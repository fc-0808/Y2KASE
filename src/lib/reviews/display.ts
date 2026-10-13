/**
 * How published reviews are allowed to appear on the storefront.
 *
 * The homepage quote and the sentence under a product price are excerpts of
 * a real review. They are never rewritten, and a quote never moves onto a
 * different product. The full text, including complaints, stays on the
 * product page that earned it.
 */

export const REVIEW_EXCERPT_MAX = 200;
export const REVIEW_EXCERPT_MIN = 40;
export const REVIEW_HISTOGRAM_MIN = 5;
export const REVIEW_PREVIEW_COUNT = 3;
export const QUOTE_BAND_MIN_REVIEWS = 8;
export const QUOTE_BAND_MIN_PRODUCTS = 3;
/** How many different products the homepage row will show. */
export const QUOTE_BAND_SIZE = 6;

export type QuoteCandidate = {
  id: number;
  productId: number;
  rating: number;
  body: string;
  authorName: string;
  verified: boolean;
  productTitle: string;
  productSlug: string;
  imageUrl: string | null;
};

export type StorefrontQuote = {
  id: number;
  productId: number;
  rating: number;
  excerpt: string;
  authorName: string;
  verified: boolean;
  productTitle: string;
  productSlug: string;
  imageUrl: string | null;
};

/** First name, or the whole short display name when there is no space. */
export function reviewAuthorLabel(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  const first = cleaned.split(" ")[0] ?? cleaned;
  return first.slice(0, 40);
}

/**
 * A product title is a keyword sentence ("… for iPhone 17 Pro Max").
 * The quote attribution only needs the object the buyer named.
 */
export function shortProductLabel(title: string, max = 52): string {
  const head = title.split(/\s+(?:for|—|–)\s+/i)[0]?.trim() || title.trim();
  if (head.length <= max) return head;
  const slice = head.slice(0, max - 1);
  const space = slice.lastIndexOf(" ");
  return `${(space > 24 ? slice.slice(0, space) : slice).trim()}…`;
}

/**
 * One or two sentences, clipped at the first clause when a sentence runs on
 * into a complaint. A trailing comma is closed so the homepage never ends
 * mid-thought.
 */
export function reviewExcerpt(body: string, max = REVIEW_EXCERPT_MAX): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";

  for (const sentence of sentences) {
    if (!out) {
      out = clipAtClause(sentence, max);
      if (out.length >= Math.min(max, 110)) break;
      continue;
    }
    const room = max - out.length - 1;
    if (room < REVIEW_EXCERPT_MIN) break;
    const next = sentence.length <= room ? sentence : clipAtClause(sentence, room);
    if (next.length < REVIEW_EXCERPT_MIN) break;
    out = `${out} ${next}`;
    break;
  }

  return closeExcerpt(out);
}

export function highlightFromReviews(
  reviews: { body: string; authorName: string }[],
): { excerpt: string; authorName: string } | null {
  for (const review of reviews) {
    const excerpt = reviewExcerpt(review.body);
    if (excerpt.length < REVIEW_EXCERPT_MIN) continue;
    return { excerpt, authorName: reviewAuthorLabel(review.authorName) };
  }
  return null;
}

/** The single line under the homepage hero. Null when nothing is quotable. */
export function pickLeadQuote(rows: QuoteCandidate[]): StorefrontQuote | null {
  for (const row of rows) {
    const quote = toQuote(row);
    if (quote) return quote;
  }
  return null;
}

/**
 * Up to six quotes, each from a different product. Hidden until the file is
 * large enough that a row of praise does not advertise an empty store.
 * Pass the homepage lead id so that sentence is not repeated in the row.
 * Callers pass rows verified-first.
 */
export function pickQuoteBand(
  rows: QuoteCandidate[],
  excludeId?: number,
): StorefrontQuote[] {
  if (rows.length < QUOTE_BAND_MIN_REVIEWS) return [];
  if (new Set(rows.map((row) => row.productId)).size < QUOTE_BAND_MIN_PRODUCTS) {
    return [];
  }

  const band: StorefrontQuote[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.id === excludeId) continue;
    if (seen.has(row.productId)) continue;
    const quote = toQuote(row);
    if (!quote) continue;
    seen.add(row.productId);
    band.push(quote);
    if (band.length === QUOTE_BAND_SIZE) return band;
  }
  return band.length >= QUOTE_BAND_MIN_PRODUCTS ? band : [];
}

function toQuote(row: QuoteCandidate): StorefrontQuote | null {
  const excerpt = reviewExcerpt(row.body);
  if (excerpt.length < REVIEW_EXCERPT_MIN) return null;
  return {
    id: row.id,
    productId: row.productId,
    rating: row.rating,
    excerpt,
    authorName: reviewAuthorLabel(row.authorName),
    verified: row.verified,
    productTitle: row.productTitle,
    productSlug: row.productSlug,
    imageUrl: row.imageUrl,
  };
}

function clipAtClause(sentence: string, max: number): string {
  const clean = sentence.trim();
  if (clean.length <= max) return clean;
  const comma = clean.indexOf(",");
  if (comma >= REVIEW_EXCERPT_MIN && comma <= max) {
    return clean.slice(0, comma).trim();
  }
  const slice = clean.slice(0, max);
  const space = slice.lastIndexOf(" ");
  return clean.slice(0, space >= REVIEW_EXCERPT_MIN ? space : max).trim();
}

function closeExcerpt(value: string): string {
  const trimmed = value.replace(/[,\s]+$/g, "").trim();
  if (!trimmed) return "";
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}
