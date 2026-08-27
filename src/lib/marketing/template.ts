import {
  escapeHtml,
  normalizeEmphasisMarkup,
  renderInlineEmphasisHtml,
  stripEmphasisMarkup,
} from "./emphasis";
import { isLegacyGenerativeMarketingHeroUrl } from "./hero";
import { marketingCopyQualityWarnings } from "./copy-quality";
import {
  BUNDLE_MARKETING,
  bundleMechanicsCoverage,
  isBuyTwoGetTwoCampaign,
} from "./offer";
import {
  CAMPAIGN_TYPES,
  MARKETING_LIMITS,
  type CampaignType,
  type MarketingDraft,
  type MarketingProductOption,
} from "./types";
import { resolveBroadcastCoupon } from "@/lib/promotions";

const SITE_URL = "https://y2kase.com";
/** Bump for every renderer change that should invalidate a previous test send. */
export const MARKETING_TEMPLATE_VERSION = "2026-08-27.1";
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
    heading: normalizeEmphasisMarkup(
      field(raw.heading, "Heading", MARKETING_LIMITS.heading, errors),
    ),
    body: normalizeEmphasisMarkup(
      field(raw.body, "Body", MARKETING_LIMITS.body, errors, true, true),
    ),
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
  if (
    value.heroImageUrl &&
    isLegacyGenerativeMarketingHeroUrl(value.heroImageUrl)
  ) {
    errors.push(
      "This legacy AI-repainted hero may show products that do not exist. Rebuild it from catalogue images before testing or sending.",
    );
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
  if (value.promoCode && !resolveBroadcastCoupon(value.promoCode)) {
    errors.push(
      "Promo code is not approved for a full-list marketing campaign.",
    );
  }
  const bundleCampaign = isBuyTwoGetTwoCampaign({ draft: value });
  if (value.promoCode && bundleCampaign) {
    errors.push(
      "Buy 2, Get 2 Free is automatic and cannot include a promo code.",
    );
  }

  return errors.length
    ? { ok: false, value: null, errors }
    : { ok: true, value, errors: [] };
}

/**
 * Facts that may remain incomplete while drafting but must be resolved before
 * a test or production send. Server Actions enforce these independently of UI.
 */
export function marketingSendBlockers(
  draft: MarketingDraft,
): MarketingPreflightWarning[] {
  if (!isBuyTwoGetTwoCampaign({ draft })) return [];
  const blockers: MarketingPreflightWarning[] = [];
  const coverage = bundleMechanicsCoverage(
    `${draft.previewText} ${draft.body}`,
  );
  if (
    !coverage.itemCount ||
    !coverage.freeCount ||
    !coverage.automatic ||
    !coverage.repeating ||
    !coverage.nonStacking
  ) {
    blockers.push({
      code: "bundle-terms-blocker",
      message:
        "State all bundle terms before sending: add any 4 products; the 2 lowest-priced are free automatically; every group of 4 qualifies; coupon codes cannot be combined.",
    });
  }
  try {
    const path = new URL(draft.ctaUrl).pathname;
    if (path !== "/products" && !path.startsWith("/collections/")) {
      blockers.push({
        code: "bundle-destination-blocker",
        message:
          "Link Buy 2, Get 2 Free to the full product or collection page so shoppers can choose four items.",
      });
    }
  } catch {
    // The structural draft validator reports malformed URLs.
  }
  return blockers;
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
  const bodyPlainLength = stripEmphasisMarkup(draft.body).length;
  if (bodyPlainLength < 100) {
    warnings.push({
      code: "short-body",
      message: "Body copy is very short; confirm the offer and context are clear.",
    });
  } else if (bodyPlainLength > 1_500) {
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
  if (draft.heroImageUrl) {
    try {
      const path = new URL(draft.heroImageUrl).pathname.toLowerCase();
      if (/\.(?:webp|avif|svg)$/.test(path)) {
        warnings.push({
          code: "email-image-format",
          message:
            "Use JPEG or PNG for reliable Gmail and Outlook rendering; WebP, AVIF, and SVG remain inconsistent in email.",
        });
      }
    } catch {
      // Invalid URLs already have a dedicated CTA/image validation warning.
    }
  }
  warnings.push(...marketingCopyQualityWarnings(draft));
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
        subject: product ? `New: ${title}` : "See what’s new at Y2KASE",
        previewText:
          "Explore the design details and available options in our latest release.",
        eyebrow: "NEW AT Y2KASE",
        heading: "A fresh case for your rotation",
        body: product
          ? `${title} is now available at Y2KASE. See the design up close and check the available options for your phone.\n\nIf it fits your style, choose your model and make it part of your everyday rotation.`
          : "A new Y2KASE release is ready to explore. Take a closer look at the design details and available phone options.\n\nChoose the style that feels most like you, then find the right fit for your device.",
        ctaLabel: "Explore the new case",
      };
    case "promotion":
      return {
        ...shared,
        name: `${BUNDLE_MARKETING.name} · Bundle`,
        subject: `Pick ${BUNDLE_MARKETING.qualifyingItems} favorites. Pay for ${BUNDLE_MARKETING.qualifyingItems - BUNDLE_MARKETING.freeItems}.`,
        previewText: `Add any ${BUNDLE_MARKETING.qualifyingItems} ${BUNDLE_MARKETING.eligibleProductCopy}—the ${BUNDLE_MARKETING.freeItems} lowest-priced are free automatically.`,
        eyebrow: BUNDLE_MARKETING.name.toUpperCase(),
        heading: `${BUNDLE_MARKETING.qualifyingItems} favorites. **${BUNDLE_MARKETING.freeItems} are on us.**`,
        body: `Mix and match any ${BUNDLE_MARKETING.qualifyingItems} ${BUNDLE_MARKETING.eligibleProductCopy}. The **${BUNDLE_MARKETING.freeItems} lowest-priced items are free** automatically—no code needed.\n\nChoose a coordinated set or ${BUNDLE_MARKETING.qualifyingItems} completely different moods. Start with the styles that feel most like you.\n\nFor every ${BUNDLE_MARKETING.qualifyingItems} items, ${BUNDLE_MARKETING.freeItems} are free. Coupon codes can’t be combined, and your bag shows the savings before checkout.`,
        ctaLabel: "Build your bundle",
        ctaUrl: BUNDLE_MARKETING.collectionUrl,
      };
    case "restock":
      return {
        ...shared,
        name: `${product?.title ?? "Favourite"} restock`,
        subject: product ? `Back in stock: ${title}` : "A returning style is back",
        previewText:
          "A returning Y2KASE design is available again—see the current options.",
        eyebrow: "BACK IN STOCK",
        heading: "Available again at Y2KASE",
        body: product
          ? `${title} is available again. Check the current phone models and style options on the product page.\n\nTake another look at the details and choose the version that fits your device and your look.`
          : "A returning Y2KASE style is available again. Check the current phone models and options in the collection.\n\nTake another look at the details and choose the version that fits your device and your look.",
        ctaLabel: "View the restock",
      };
    case "newsletter":
      return {
        ...shared,
        name: "Y2KASE monthly edit",
        subject: "Your latest Y2KASE edit",
        previewText:
          "A focused mix of cases, grips, charms, and styling ideas to explore.",
        eyebrow: "THE Y2KASE EDIT",
        heading: "A few details worth a closer look",
        body: "Explore a focused edit of Y2KASE cases, grips, and charms, chosen to make it easier to find a combination that feels personal.\n\nBrowse the latest selection, compare the details, and save the styles that work with your phone and your look.",
        ctaLabel: "Browse the edit",
      };
    case "seasonal":
      return {
        ...shared,
        name: "Seasonal Y2KASE edit",
        subject: "A fresh phone look for the season",
        previewText:
          "Explore cases and accessories selected for an easy seasonal refresh.",
        eyebrow: "SEASONAL EDIT",
        heading: "Refresh the accessory you use every day",
        body: "A new season is an easy reason to switch the details you see every day. Explore cases and accessories that can be mixed, matched, and made your own.\n\nChoose a color, character, or finish that gives your phone a fresh point of view.",
        ctaLabel: "Explore the seasonal edit",
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

function bodyParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => {
      const content = renderInlineEmphasisHtml(paragraph, "body");
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
                  <a href="${escapeHtml(trackedCtaUrl)}" style="display:block;text-decoration:none;">
                    <img src="${escapeHtml(draft.heroImageUrl)}" width="600" height="360" border="0" alt="${escapeHtml(draft.heroImageAlt)}" style="display:block;width:100%;max-width:600px;height:auto;border-width:0;color:#4f3a56;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;">
                  </a>
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
                    <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;font-weight:900;color:#34203b;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">${renderInlineEmphasisHtml(draft.heading, "heading")}</h1>
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
    stripEmphasisMarkup(draft.heading),
    "",
    stripEmphasisMarkup(draft.body),
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

