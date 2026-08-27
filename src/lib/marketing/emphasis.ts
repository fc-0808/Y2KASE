/**
 * Safe inline emphasis for marketing email fields.
 *
 * Operators and the AI may mark key phrases with Markdown-style **bold**.
 * Markup is never treated as HTML: content is HTML-escaped first, then the
 * markers are converted to a fixed <strong> style. That keeps the trust
 * boundary of the deterministic renderer while allowing professional
 * highlight of offers (e.g. **Buy 2, Get 2 Free**).
 */

const EMPHASIS_PAIR =
  /\*\*([^*\n]{1,120}?)\*\*/g;

const BODY_STRONG =
  'font-weight:800;color:#ff3ea5;';
const HEADING_STRONG =
  'font-weight:900;color:#ff3ea5;';

/** Well-known offer labels we may auto-emphasize when the verified offer matches. */
const CANONICAL_OFFER_PHRASES = [
  "Buy 2, Get 2 Free",
  "Buy 2 Get 2 Free",
  "Buy 4, Pay for 2",
  "Buy 4 Pay for 2",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Remove emphasis markers for plain-text MIME parts and length checks. */
export function stripEmphasisMarkup(text: string): string {
  return text.replace(EMPHASIS_PAIR, "$1");
}

/**
 * Normalize operator/AI markup into a predictable form:
 * - keep only non-empty, single-line emphasis spans
 * - drop unpaired trailing ** markers
 * - trim whitespace inside markers
 */
export function normalizeEmphasisMarkup(text: string): string {
  let output = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const close = text.indexOf("**", index + 2);
      if (close === -1) {
        output += text.slice(index + 2);
        break;
      }
      const inner = text.slice(index + 2, close).trim();
      if (!inner || inner.includes("\n") || inner.includes("*")) {
        // Invalid span: emit the inner content without markers.
        output += text.slice(index + 2, close);
      } else {
        output += `**${inner}**`;
      }
      index = close + 2;
      continue;
    }
    output += text[index];
    index += 1;
  }
  return output;
}

/**
 * Escape first, then convert **phrase** → branded <strong>.
 * Callers must still wrap the result in a block element.
 */
export function renderInlineEmphasisHtml(
  text: string,
  variant: "body" | "heading" = "body",
): string {
  const strongStyle = variant === "heading" ? HEADING_STRONG : BODY_STRONG;
  const escaped = escapeHtml(text);
  return escaped
    .replace(
      EMPHASIS_PAIR,
      `<strong style="${strongStyle}">$1</strong>`,
    )
    .replace(/\n/g, "<br>");
}

/**
 * Phrase candidates derived from the verified offer / promo fields.
 * Longer phrases win so we do not wrap a substring of a better match.
 */
export function offerEmphasisPhrases(
  offer: string,
  promoCode = "",
): string[] {
  const phrases = new Set<string>();
  const haystack = `${offer} ${promoCode}`.trim();
  if (!haystack) return [];

  for (const phrase of CANONICAL_OFFER_PHRASES) {
    if (haystack.toLowerCase().includes(phrase.toLowerCase())) {
      phrases.add(phrase);
    }
  }

  // Quoted offer names: Buy 2, Get 2 Free — …
  const titled = offer.match(
    /\b((?:Buy|Get|Save|Free|Off)\b[^.\n!]{0,48}?)(?:\s*[—-]|\s*$)/i,
  );
  if (titled?.[1]) {
    const cleaned = titled[1].replace(/\s+/g, " ").trim();
    if (cleaned.length >= 6 && cleaned.length <= 60) phrases.add(cleaned);
  }

  if (promoCode.trim()) phrases.add(promoCode.trim().toUpperCase());

  return [...phrases].sort((a, b) => b.length - a.length);
}

/**
 * Wrap the first plain occurrence of a verified phrase in **…**.
 * Skips when the phrase is already emphasised or sits inside another span.
 */
export function emphasizeFirstMatch(
  text: string,
  phrases: string[],
): string {
  if (!text.trim() || phrases.length === 0) return text;

  for (const phrase of phrases) {
    if (!phrase || phrase.length < 4) continue;
    if (
      new RegExp(`\\*\\*${escapeRegExp(phrase)}\\*\\*`, "i").test(text)
    ) {
      return text;
    }

    const lower = text.toLowerCase();
    const needle = phrase.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      const before = text.slice(0, idx);
      const markerCount = before.match(/\*\*/g)?.length ?? 0;
      if (markerCount % 2 === 1) {
        from = idx + needle.length;
        continue;
      }
      const actual = text.slice(idx, idx + phrase.length);
      return (
        text.slice(0, idx) + `**${actual}**` + text.slice(idx + phrase.length)
      );
    }
  }
  return text;
}

/**
 * Preserve intentional heading emphasis and guarantee one verified offer
 * emphasis in the body. We do not auto-repeat the offer in the heading when the
 * eyebrow/subject already carry it.
 */
export function applyVerifiedOfferEmphasis(
  draft: { heading: string; body: string },
  offer: string,
  promoCode = "",
): { heading: string; body: string } {
  const phrases = offerEmphasisPhrases(offer, promoCode);
  if (phrases.length === 0) {
    return {
      heading: normalizeEmphasisMarkup(draft.heading),
      body: normalizeEmphasisMarkup(draft.body),
    };
  }
  return {
    heading: normalizeEmphasisMarkup(draft.heading),
    body: normalizeEmphasisMarkup(emphasizeFirstMatch(draft.body, phrases)),
  };
}
