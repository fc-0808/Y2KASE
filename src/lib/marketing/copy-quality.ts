import { stripEmphasisMarkup } from "./emphasis";
import {
  BUNDLE_MARKETING,
  bundleMechanicsCoverage,
  isBuyTwoGetTwoCampaign,
} from "./offer";
import type { MarketingDraft } from "./types";

export type MarketingCopyWarning = {
  code: string;
  message: string;
};

const GENERIC_CTA = new Set([
  "click here",
  "learn more",
  "shop now",
  "buy now",
  "see more",
  "discover more",
]);

const TIRED_PHRASES = [
  "a little treat",
  "just for the group chat",
  "unlock a little extra",
  "main-character moment",
  "this is your sign",
  "run, don’t walk",
  "run, don't walk",
  "must-have",
  "you’ll be obsessed",
  "you'll be obsessed",
  "eligible units",
  "stack up on",
] as const;

const PLACEHOLDER_PHRASES = [
  "share the news in a clear first paragraph",
  "add your offer details",
  "add your highlights here",
] as const;

const TOKEN_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "with",
  "your",
]);

function normalizedTokens(value: string): Set<string> {
  return new Set(
    stripEmphasisMarkup(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(
        (token) =>
          token.length >= 2 && !TOKEN_STOP_WORDS.has(token),
      ),
  );
}

function overlapRatio(a: string, b: string): number {
  const first = normalizedTokens(a);
  const second = normalizedTokens(b);
  if (first.size === 0 || second.size === 0) return 0;
  let overlap = 0;
  for (const token of first) {
    if (second.has(token)) overlap += 1;
  }
  return overlap / Math.min(first.size, second.size);
}

function emojiCount(value: string): number {
  return value.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
}

export function marketingCopyQualityWarnings(
  draft: MarketingDraft,
): MarketingCopyWarning[] {
  const warnings: MarketingCopyWarning[] = [];
  if (overlapRatio(draft.subject, draft.previewText) >= 0.7) {
    warnings.push({
      code: "subject-preview-overlap",
      message:
        "Preview text repeats too much of the subject; use it to add the mechanic or a second reason to open.",
    });
  }
  if (overlapRatio(draft.eyebrow, draft.heading) >= 0.8) {
    warnings.push({
      code: "heading-eyebrow-overlap",
      message:
        "The heading repeats the eyebrow; use the heading for a customer benefit instead of restating the offer label.",
    });
  }

  const cta = draft.ctaLabel.trim().toLowerCase();
  if (GENERIC_CTA.has(cta)) {
    warnings.push({
      code: "generic-cta",
      message:
        "Replace the generic button label with the next action, such as “Build your bundle” or “Choose your case”.",
    });
  }

  const plainBody = stripEmphasisMarkup(draft.body);
  const tired = TIRED_PHRASES.filter((phrase) =>
    plainBody.toLowerCase().includes(phrase.toLowerCase()),
  );
  if (tired.length > 0) {
    warnings.push({
      code: "tired-copy",
      message: `Replace vague or overused phrasing: ${tired
        .map((phrase) => `“${phrase}”`)
        .join(", ")}.`,
    });
  }
  if (
    PLACEHOLDER_PHRASES.some((phrase) =>
      plainBody.toLowerCase().includes(phrase),
    )
  ) {
    warnings.push({
      code: "placeholder-copy",
      message:
        "Replace the starter instructions with the actual verified campaign message before testing.",
    });
  }

  const paragraphs = plainBody
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length < 2 || paragraphs.length > 4) {
    warnings.push({
      code: "paragraph-structure",
      message:
        "Use 2–4 short paragraphs so the message scans cleanly on mobile.",
    });
  }
  if (/https?:\/\//i.test(plainBody)) {
    warnings.push({
      code: "body-link",
      message:
        "Keep URLs out of body copy; use the single tracked CTA button instead.",
    });
  }

  const visibleCopy = [
    draft.subject,
    draft.previewText,
    draft.eyebrow,
    draft.heading,
    draft.body,
    draft.ctaLabel,
  ].join(" ");
  if (emojiCount(visibleCopy) > 2) {
    warnings.push({
      code: "emoji-density",
      message:
        "Use no more than two emojis across the email copy to keep it polished and deliverability-friendly.",
    });
  }

  if (isBuyTwoGetTwoCampaign({ draft })) {
    const coverage = bundleMechanicsCoverage(
      `${draft.previewText} ${draft.body}`,
    );
    const missing = [
      !coverage.itemCount ? "add any 4 eligible products" : null,
      !coverage.freeCount ? "the 2 lowest-priced items are free" : null,
      !coverage.automatic ? "the discount is automatic/no code" : null,
      !coverage.repeating ? "every complete group of 4 receives 2 free" : null,
      !coverage.nonStacking ? "coupon codes cannot be combined" : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      warnings.push({
        code: "bundle-mechanics",
        message: `Clarify the verified ${BUNDLE_MARKETING.name} mechanic: ${missing.join(
          "; ",
        )}.`,
      });
    }
    if (draft.promoCode) {
      warnings.push({
        code: "bundle-promo-code",
        message:
          "Remove the promo code: Buy 2, Get 2 Free applies automatically and cannot stack with coupons.",
      });
    }
    try {
      const path = new URL(draft.ctaUrl).pathname;
      if (path !== "/products" && !path.startsWith("/collections/")) {
        warnings.push({
          code: "bundle-destination",
          message:
            "Send bundle shoppers to the full product or collection page, not one product—they need four choices.",
        });
      }
    } catch {
      // URL validity is handled by the draft validator.
    }
  }

  return warnings;
}

export function subjectCandidateIsProfessional(value: string): boolean {
  const subject = value.replace(/\s+/g, " ").trim();
  if (!subject || subject.length > 60 || /[!?]{2,}/.test(subject)) return false;
  if (subject.includes("{{") || subject.includes("}}")) return false;
  const letters = subject.match(/[A-Za-z]/g) ?? [];
  const uppercase = letters.filter((letter) => letter === letter.toUpperCase());
  return letters.length < 8 || uppercase.length / letters.length <= 0.7;
}
