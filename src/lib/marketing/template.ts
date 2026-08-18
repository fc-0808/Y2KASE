import {
  CAMPAIGN_TYPES,
  MARKETING_LIMITS,
  type CampaignType,
  type MarketingDraft,
  type MarketingProductOption,
} from "./types";

const SITE_URL = "https://y2kase.com";
/** Bump for every renderer change that should invalidate a previous test send. */
export const MARKETING_TEMPLATE_VERSION = "2026-08-14.3";
export const RESEND_UNSUBSCRIBE_PLACEHOLDER =
  "{{{RESEND_UNSUBSCRIBE_URL}}}";

export type MarketingDraftValidation =
  | { ok: true; value: MarketingDraft; errors: [] }
  | { ok: false; value: null; errors: string[] };

export type MarketingPreflightWarning = {
  code: string;
  message: string;
};

function field(
  value: unknown,
  label: string,
  max: number,
  errors: string[],
  required = true,
  multiline = false,
): string {
  if (typeof value !== "string") {
    if (required) errors.push(`${label} is required.`);
    return "";
  }
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  const safe = multiline ? normalized : normalized.replace(/\s+/g, " ");
  if (required && !safe) errors.push(`${label} is required.`);
  if (safe.length > max) {
    errors.push(`${label} must be ${max} characters or fewer.`);
  }
  return safe.slice(0, max);
}

export function isBrandUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "y2kase.com" || url.hostname.endsWith(".y2kase.com"))
    );
  } catch {
    return false;
  }
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !host.includes(".") ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "::1" ||
      host.includes(":")
    ) {
      return false;
    }
    const octets = host.split(".").map(Number);
    if (octets.length === 4 && octets.every(Number.isInteger)) {
      const [a, b] = octets;
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Validate and normalize every untrusted Server Action payload. */
export function validateMarketingDraft(
  input: unknown,
): MarketingDraftValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, value: null, errors: ["Invalid campaign draft."] };
  }

  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const requestedType =
    typeof raw.campaignType === "string" ? raw.campaignType : "";
  const campaignType = CAMPAIGN_TYPES.includes(requestedType as CampaignType)
    ? (requestedType as CampaignType)
    : "announcement";
  if (campaignType !== requestedType) errors.push("Choose a valid campaign type.");

  const value: MarketingDraft = {
    name: field(raw.name, "Campaign name", MARKETING_LIMITS.name, errors),
    campaignType,
    subject: field(raw.subject, "Subject", MARKETING_LIMITS.subject, errors),
    previewText: field(
      raw.previewText,
      "Preview text",
      MARKETING_LIMITS.previewText,
      errors,
    ),
    eyebrow: field(raw.eyebrow, "Eyebrow", MARKETING_LIMITS.eyebrow, errors),
    heading: field(raw.heading, "Heading", MARKETING_LIMITS.heading, errors),
    body: field(raw.body, "Body", MARKETING_LIMITS.body, errors, true, true),
    ctaLabel: field(raw.ctaLabel, "CTA label", MARKETING_LIMITS.ctaLabel, errors),
    ctaUrl: field(raw.ctaUrl, "CTA URL", MARKETING_LIMITS.url, errors),
    heroImageUrl: field(
      raw.heroImageUrl,
      "Hero image URL",
      MARKETING_LIMITS.url,
      errors,
      false,
    ),
    heroImageAlt: field(
      raw.heroImageAlt,
      "Hero image alt text",
      MARKETING_LIMITS.imageAlt,
      errors,
      false,
    ),
    promoCode: field(
      raw.promoCode,
      "Promo code",
      MARKETING_LIMITS.promoCode,
      errors,
      false,
    ),
  };

  if (value.ctaUrl && !isBrandUrl(value.ctaUrl)) {
    errors.push("CTA URL must use HTTPS on y2kase.com.");
  }
  if (value.heroImageUrl && !isPublicHttpsUrl(value.heroImageUrl)) {
    errors.push("Hero image URL must be a public absolute HTTPS URL.");
  }
  if (value.heroImageUrl && !value.heroImageAlt) {
    errors.push("Hero image alt text is required when an image is used.");
  }
  if (!value.heroImageUrl) value.heroImageAlt = "";
  if (
    Object.entries(value).some(
      ([key, item]) =>
        key !== "campaignType" &&
        typeof item === "string" &&
        (item.includes("{{") || item.includes("}}")),
    )
  ) {
    errors.push("Campaign fields cannot contain provider template expressions.");
  }

  return errors.length
    ? { ok: false, value: null, errors }
    : { ok: true, value, errors: [] };
}

/** Advisory deliverability/readability checks shown before the mandatory test. */
export function marketingPreflight(
  draft: MarketingDraft,
): MarketingPreflightWarning[] {
  const warnings: MarketingPreflightWarning[] = [];
  if (draft.subject.length > 60) {
    warnings.push({
      code: "long-subject",
      message: "Subject exceeds 60 characters and may truncate on mobile.",
    });
  }
  if (draft.previewText.length < 35 || draft.previewText.length > 120) {
    warnings.push({
      code: "preview-length",
      message: "Keep inbox preview text between 35 and 120 characters.",
    });
  }
  if (draft.body.length < 100) {
    warnings.push({
      code: "short-body",
      message: "Body copy is very short; confirm the offer and context are clear.",
    });
  } else if (draft.body.length > 1_500) {
    warnings.push({
      code: "long-body",
      message: "Body copy is long for a promotional email; consider tightening it.",
    });
  }
  const letters = draft.subject.match(/[A-Za-z]/g) ?? [];
  const uppercase = letters.filter((letter) => letter === letter.toUpperCase());
  if (letters.length >= 8 && uppercase.length / letters.length > 0.7) {
    warnings.push({
      code: "uppercase-subject",
      message: "Mostly-uppercase subjects can look spammy and reduce trust.",
    });
  }
  if (/[!?]{2,}/.test(draft.subject)) {
    warnings.push({
      code: "subject-punctuation",
      message: "Repeated subject punctuation can hurt deliverability.",
    });
  }
  if (draft.ctaLabel.length > 30) {
    warnings.push({
      code: "long-cta",
      message: "Shorten the button label so it remains readable on mobile.",
    });
  }
  if (!isBrandUrl(draft.ctaUrl)) {
    warnings.push({
      code: "invalid-cta",
      message: "CTA must use a verified HTTPS y2kase.com URL.",
    });
  }
  if (draft.heroImageUrl && !draft.heroImageAlt.trim()) {
    warnings.push({
      code: "missing-alt",
      message: "Add alt text for the hero image.",
    });
  }
  return warnings;
}

function productUrl(product?: MarketingProductOption | null): string {
  return product ? `${SITE_URL}/products/${product.slug}` : `${SITE_URL}/products`;
}

/** Safe, useful starting copy when AI is unavailable or unnecessary. */
export function createStarterDraft(
  campaignType: CampaignType = "announcement",
  product?: MarketingProductOption | null,
): MarketingDraft {
  const title = product?.title ?? "something cute";
  const url = productUrl(product);
  const shared = {
    campaignType,
    ctaUrl: url,
    heroImageUrl: product?.imageUrl ?? "",
    heroImageAlt: product ? `${product.title} from Y2KASE` : "",
    promoCode: "",
  };

  switch (campaignType) {
    case "product-launch":
      return {
        ...shared,
        name: `${product?.title ?? "New drop"} launch`,
        subject: `Just dropped: ${title} ✨`,
        previewText: "Fresh Y2K energy just landed at Y2KASE.",
        eyebrow: "NEW DROP",
        heading: "Your phone’s new personality just arrived",
        body: `${title} is officially here—made for main-character mirror selfies and everyday protection.\n\nSubscriber crew gets first look before everyone else catches on.`,
        ctaLabel: "Shop the new drop",
      };
    case "promotion":
      return {
        ...shared,
        name: "Subscriber-only offer",
        subject: "A little treat, just for the group chat 💌",
        previewText: "Your subscriber-only Y2KASE offer is waiting.",
        eyebrow: "SUBSCRIBER EXCLUSIVE",
        heading: "Cute case. Even cuter checkout.",
        body: "A tiny thank-you for being part of the Y2KASE crew. Pick the case, charm, or grip that matches your current era.\n\nAdd your offer details and expiry before sending.",
        ctaLabel: "Shop the offer",
      };
    case "restock":
      return {
        ...shared,
        name: `${product?.title ?? "Favourite"} restock`,
        subject: `${title} is back (for now) 👀`,
        previewText: "The wait is over—your Y2KASE favourite is back.",
        eyebrow: "BACK IN STOCK",
        heading: "You asked. We restocked.",
        body: `${title} is back on the shelf and ready for its next main-character moment.\n\nRestocks can move quickly, so take a look while your favourite option is available.`,
        ctaLabel: "Shop the restock",
      };
    case "newsletter":
      return {
        ...shared,
        name: "Y2KASE monthly edit",
        subject: "The Y2KASE edit: what we’re loving right now",
        previewText: "New arrivals, styling ideas, and cute things worth opening.",
        eyebrow: "THE Y2KASE EDIT",
        heading: "Your monthly dose of cute",
        body: "A quick scroll through what’s new, what’s trending, and what the Y2KASE crew has on repeat.\n\nAdd your highlights here, keep it useful, and finish with one clear next step.",
        ctaLabel: "Explore the edit",
      };
    case "seasonal":
      return {
        ...shared,
        name: "Seasonal Y2KASE edit",
        subject: "New season, new phone era 🌸",
        previewText: "A fresh edit for your next Y2K look.",
        eyebrow: "SEASONAL EDIT",
        heading: "A new mood for your most-used accessory",
        body: "Refresh the thing that goes everywhere with you. We pulled together a seasonal edit of cases and accessories made to mix, match, and make the mirror selfie.\n\nChoose your next-era favourite.",
        ctaLabel: "Shop the seasonal edit",
      };
    default:
      return {
        ...shared,
        name: "Y2KASE announcement",
        subject: "A cute update from Y2KASE ✨",
        previewText: "A quick update for the Y2KASE subscriber crew.",
        eyebrow: "Y2KASE NEWS",
        heading: "We saved this update for you",
        body: "Share the news in a clear first paragraph, then explain why it matters to the subscriber crew.\n\nKeep the message focused on one action and one honest reason to click.",
        ctaLabel: "See what’s new",
      };
  }
}

export function campaignTrackingUrl(
  draft: MarketingDraft,
  campaignId?: string,
): string {
  const url = new URL(draft.ctaUrl);
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "email");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "email");
  if (!url.searchParams.has("utm_campaign")) {
    const slug = draft.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    url.searchParams.set("utm_campaign", slug || "campaign");
  }
  if (campaignId && !url.searchParams.has("utm_id")) {
    url.searchParams.set("utm_id", campaignId);
  }
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bodyParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => {
      const content = escapeHtml(paragraph).replace(/\n/g, "<br>");
      return `<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#4f3a56;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">${content}</p>`;
    })
    .join("");
}

export type RenderMarketingEmailOptions = {
  postalAddress: string;
  unsubscribeUrl?: string;
  campaignId?: string;
};

/**
 * Render conservative, table-based email HTML and a matching plain-text part.
 * Every editable value is escaped before interpolation.
 */
export function renderMarketingEmail(
  draft: MarketingDraft,
  options: RenderMarketingEmailOptions,
): { html: string; text: string; trackedCtaUrl: string } {
  const unsubscribeUrl =
    options.unsubscribeUrl ?? RESEND_UNSUBSCRIBE_PLACEHOLDER;
  const trackedCtaUrl = campaignTrackingUrl(draft, options.campaignId);
  const year = new Date().getUTCFullYear();
  const hero = draft.heroImageUrl
    ? `
              <tr>
                <td style="padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;" bgcolor="#f7e7f6">
                  <img src="${escapeHtml(draft.heroImageUrl)}" width="600" height="360" border="0" alt="${escapeHtml(draft.heroImageAlt)}" style="display:block;width:100%;max-width:600px;height:auto;border-width:0;">
                </td>
              </tr>`
    : "";
  const promo = draft.promoCode
    ? `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;margin-right:0;margin-bottom:24px;margin-left:0;">
                      <tr>
                        <td align="center" bgcolor="#fdf3fb" style="border-width:2px;border-style:dashed;border-color:#ff3ea5;padding-top:18px;padding-right:20px;padding-bottom:18px;padding-left:20px;">
                          <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;letter-spacing:1.5px;color:#8a7790;margin-top:0;margin-right:0;margin-bottom:6px;margin-left:0;">USE CODE</p>
                          <p style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:32px;letter-spacing:2px;font-weight:800;color:#ff3ea5;margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;">${escapeHtml(draft.promoCode)}</p>
                        </td>
                      </tr>
                    </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(draft.subject)}</title>
</head>
<body style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;background-color:#fdf3fb;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(draft.previewText)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fdf3fb" style="width:100%;background-color:#fdf3fb;">
    <tr>
      <td align="center" style="padding-top:28px;padding-right:12px;padding-bottom:28px;padding-left:12px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border-width:1px;border-style:solid;border-color:#f1d3ec;">
          <tr>
            <td bgcolor="#ff3ea5" style="height:6px;font-size:0;line-height:0;background-color:#ff3ea5;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" bgcolor="#ffffff" style="padding-top:26px;padding-right:32px;padding-bottom:24px;padding-left:32px;background-color:#ffffff;">
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:32px;font-weight:900;letter-spacing:2px;color:#ff3ea5;margin-top:0;margin-right:0;margin-bottom:5px;margin-left:0;">Y2KASE</p>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:16px;letter-spacing:2px;color:#8a7790;margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;">KAWAII · Y2K · HOLOGRAPHIC</p>
            </td>
          </tr>${hero}
          <tr>
            <td bgcolor="#ffffff" style="padding-top:36px;padding-right:42px;padding-bottom:36px;padding-left:42px;background-color:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:800;letter-spacing:1.6px;color:#ff3ea5;margin-top:0;margin-right:0;margin-bottom:12px;margin-left:0;">${escapeHtml(draft.eyebrow)}</p>
                    <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;font-weight:900;color:#34203b;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">${escapeHtml(draft.heading)}</h1>
                    <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#4f3a56;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">Hey bestie ✨</p>
                    ${bodyParagraphs(draft.body)}
                    ${promo}
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;margin-right:0;margin-bottom:4px;margin-left:0;">
                      <tr>
                        <td align="center" bgcolor="#ff3ea5" style="background-color:#ff3ea5;border-radius:999px;">
                          <a href="${escapeHtml(trackedCtaUrl)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:800;color:#34203b;text-decoration:none;padding-top:15px;padding-right:28px;padding-bottom:15px;padding-left:28px;border-radius:999px;">${escapeHtml(draft.ctaLabel)}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f7e7f6" style="padding-top:24px;padding-right:32px;padding-bottom:24px;padding-left:32px;background-color:#f7e7f6;">
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#6f5c75;margin-top:0;margin-right:0;margin-bottom:9px;margin-left:0;">You received this because you joined the Y2KASE email list.</p>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#6f5c75;margin-top:0;margin-right:0;margin-bottom:9px;margin-left:0;">${escapeHtml(options.postalAddress)}</p>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#6f5c75;margin-top:0;margin-right:0;margin-bottom:9px;margin-left:0;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6f5c75;text-decoration:underline;">Unsubscribe or update preferences</a> · <a href="${SITE_URL}/policies/privacy-policy" style="color:#6f5c75;text-decoration:underline;">Privacy</a></p>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#8a7790;margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;">© ${year} Y2KASE</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    draft.eyebrow,
    draft.heading,
    "",
    "Hey bestie ✨",
    "",
    draft.body,
    draft.promoCode ? `\nUse code: ${draft.promoCode}` : "",
    "",
    `${draft.ctaLabel}: ${trackedCtaUrl}`,
    "",
    "You received this because you joined the Y2KASE email list.",
    options.postalAddress,
    `Unsubscribe or update preferences: ${unsubscribeUrl}`,
    `Privacy: ${SITE_URL}/policies/privacy-policy`,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");

  return { html, text, trackedCtaUrl };
}

