/**
 * Pinterest editorial strategy — the rules a real social / growth team would
 * enforce after a TransAct-era impression drop.
 *
 * Why this file exists
 * ────────────────────
 * Pinterest is a visual SEARCH engine, not a dump-the-catalog firehose.
 * Posting every gallery photo of a listing in one burst (8–14 near-duplicate
 * stills of the same SKU) is the 2022 playbook. The 2025–2026 ranking model
 * (TransAct V2: long-horizon user history + next-action prediction) demotes
 * visual repetition, burst posting, and keyword-stuffed titles. Save rate
 * compounds: zero-save pins train the model that this account is skippable.
 *
 * Hard rules (CASETiFY / Glossier / Brooklinen cadence, adapted for a small
 * catalog brand)
 * ──────────────────────────────────────────────────────────────────────────
 *   1. Cap by PIN, not by listing. Two to five fresh original pins/day is the
 *      current quality sweet spot. A hard ceiling of 8 stops an env typo from
 *      looking like a spam bot.
 *   2. One pin per product per run, and a multi-day cooldown before the same
 *      SKU appears again. Remaining gallery shots go out later as fresh pins,
 *      not as a same-day duplicate row.
 *   3. Video first when the listing has an un-pinned clip. Video pins earn
 *      materially more saves than stills; the stills wait.
 *   4. Fresh pin graphics: a 2:3 (1000×1500) card with the REAL product photo
 *      and a short readable overlay. New image bytes = a fresh pin even when
 *      the destination URL is the same PDP. The product must remain the hero
 *      so Pinterest's "Visit Site" quality check still matches the landing page.
 *   5. Titles sound like searches a shopper would type. No "Stylish" / "Trendy"
 *      prefixes, no comma-separated keyword lists, no invented device models.
 *   6. Alt text is a literal description of the photo (accessibility + visual
 *      search), not a hashtag dump.
 *
 * What a human still has to do (this module cannot)
 * ──────────────────────────────────────────────────
 * Profile bio/keywords (Pinterest has no profile PATCH), saving other people's
 * pins from the home feed (Create Pin must not be used as a repin bot), seasonal
 * Trends research, and engaging with comments. Boards, 0-save duplicate cleanup,
 * and a slow follow drip live in pinterest-hygiene / pinterest-follow.
 */

export const PINTEREST_HANDLE = "y2kase";
export const PINTEREST_PROFILE_URL = "https://www.pinterest.com/y2kase";

/** Official feed spec: 2:3 vertical, 1000×1500. Taller than 2:3 gets cropped. */
export const PINTEREST_PIN_WIDTH = 1000;
export const PINTEREST_PIN_HEIGHT = 1500;

/** Pinterest UI title limit. */
export const PINTEREST_TITLE_MAX = 100;

/**
 * Pinterest indexes the start of the description most heavily. The API accepts
 * 800; we write to 500 so the copy stays a real paragraph, not a keyword slab.
 */
export const PINTEREST_DESC_MAX = 500;

export const PINTEREST_ALT_MAX = 500;

/** Overlay copy on the pin graphic — Pinterest's own ad spec is ≤10 words. */
export const PINTEREST_OVERLAY_MAX_WORDS = 8;

export const PINTEREST_MAX_HASHTAGS = 5;

/** Default cadence. Two cron slots × 2 pins = 4 fresh pins/UTC day. */
export const PINTEREST_DEFAULT_PINS_PER_RUN = 2;
export const PINTEREST_DEFAULT_PINS_PER_DAY = 4;

/** Hard ceiling so an env typo cannot firehose the account. */
export const PINTEREST_MAX_PINS_PER_RUN = 4;
export const PINTEREST_MAX_PINS_PER_DAY = 8;

/** Days before another pin of the same SKU may go out. */
export const PINTEREST_DEFAULT_PRODUCT_COOLDOWN_DAYS = 3;
export const PINTEREST_MAX_PRODUCT_COOLDOWN_DAYS = 14;

export const PINTEREST_CTA = "Shop this look at y2kase.com";

/**
 * Filler openers the old SEO prompt produced ("Stylish iPhone 15 Case: …").
 * They waste the title's first tokens — the ones Pinterest matches to search.
 */
export const PINTEREST_BANNED_TITLE_PREFIXES = [
  "stylish",
  "trendy",
  "unique",
  "fun and funky",
  "funky",
  "amazing",
  "awesome",
  "must-have",
  "must have",
] as const;

/**
 * Generic / engagement-bait tags. They do not help a 4-follower shop get found
 * and they make the pin look automated.
 */
export const PINTEREST_BANNED_HASHTAGS = new Set([
  "viral",
  "fyp",
  "foryou",
  "foryoupage",
  "explore",
  "explorepage",
  "follow",
  "followme",
  "like",
  "love",
  "pinterest",
  "pin",
  "sale",
  "shopnow",
  "smallbusiness",
  "trending",
  "trend",
  "aesthetic",
  "cute",
]);

const HASHTAG_RE = /^[a-z0-9_]{2,30}$/;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const SPAM_PREFIX_RE = new RegExp(
  `^(?:${PINTEREST_BANNED_TITLE_PREFIXES.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})\\s*[:\\-–—]?\\s*`,
  "i",
);

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Pins a single cron invocation may publish. Default 2, hard-capped at 4. */
export function pinterestPinsPerRun(
  raw: string | undefined = process.env.PINTEREST_AUTOPIN_PER_RUN,
): number {
  return clampInt(
    raw,
    PINTEREST_DEFAULT_PINS_PER_RUN,
    1,
    PINTEREST_MAX_PINS_PER_RUN,
  );
}

/** Pins published per UTC day across every run. Default 4, hard-capped at 8. */
export function pinterestPinsPerDay(
  raw: string | undefined = process.env.PINTEREST_AUTOPIN_PER_DAY,
): number {
  return clampInt(
    raw,
    PINTEREST_DEFAULT_PINS_PER_DAY,
    1,
    PINTEREST_MAX_PINS_PER_DAY,
  );
}

/** Calendar days a SKU must rest after a pin before another pin of it. */
export function pinterestProductCooldownDays(
  raw: string | undefined = process.env.PINTEREST_AUTOPIN_PRODUCT_COOLDOWN_DAYS,
): number {
  return clampInt(
    raw,
    PINTEREST_DEFAULT_PRODUCT_COOLDOWN_DAYS,
    1,
    PINTEREST_MAX_PRODUCT_COOLDOWN_DAYS,
  );
}

/** Opt-out for the 2:3 branded card. Default on. */
export function isPinCardEnabled(
  raw: string | undefined = process.env.PINTEREST_PIN_CARD_ENABLED,
): boolean {
  return raw !== "false";
}

export type PinterestMediaType = "image" | "video";

export type PinterestSlotPlan =
  | {
      action: "post";
      mediaType: PinterestMediaType;
      reason: "prefer-video" | "video-remaining" | "image-remaining";
    }
  | {
      action: "skip";
      reason: "daily-cap" | "product-cooldown" | "nothing-left" | "no-media";
    };

/**
 * Decide the single pin this product may contribute to today's drip.
 *
 * Product *selection* (coverage + cooldown) lives in auto-pin SQL. This
 * function only picks media type and enforces the daily pin cap.
 */
export function planPinSlot(input: {
  hasUnpinnedPhotos: boolean;
  hasUnpinnedVideo: boolean;
  pinsPostedToday: number;
  dailyCap?: number;
  productPinnedWithinCooldown: boolean;
}): PinterestSlotPlan {
  const cap = input.dailyCap ?? pinterestPinsPerDay();
  if (input.pinsPostedToday >= cap) {
    return { action: "skip", reason: "daily-cap" };
  }
  if (!input.hasUnpinnedPhotos && !input.hasUnpinnedVideo) {
    return { action: "skip", reason: "no-media" };
  }
  if (input.productPinnedWithinCooldown) {
    return { action: "skip", reason: "product-cooldown" };
  }
  if (input.hasUnpinnedVideo) {
    return {
      action: "post",
      mediaType: "video",
      reason: input.hasUnpinnedPhotos ? "prefer-video" : "video-remaining",
    };
  }
  return { action: "post", mediaType: "image", reason: "image-remaining" };
}

export function describePinSlot(plan: PinterestSlotPlan): string {
  if (plan.action === "skip") {
    if (plan.reason === "daily-cap") {
      return "Today's Pinterest pin budget is already used — next pin tomorrow.";
    }
    if (plan.reason === "product-cooldown") {
      return "This listing was pinned recently. It waits so the feed does not repeat the same SKU.";
    }
    if (plan.reason === "no-media") {
      return "This listing has no postable photos or video.";
    }
    return "This listing is already fully pinned.";
  }
  if (plan.mediaType === "video") {
    return plan.reason === "prefer-video"
      ? "Video first — video pins earn more saves than stills. Remaining photos wait for later days."
      : "Video pin from the product clip.";
  }
  return "One still pin from a distinct gallery photo. Other angles wait so they stay visually fresh.";
}

/**
 * Pick which unpinned gallery photo to post so successive pins of the same
 * SKU are visually far apart (hero, then a lifestyle/end shot, then the
 * middle) instead of five near-identical close-ups in a row.
 *
 * Returns an index into `unpinnedPositions`, or -1 when there is nothing to
 * pick.
 */
export function pickDiverseImageIndex(
  unpinnedPositions: readonly number[],
  pinnedPositions: readonly number[],
): number {
  if (unpinnedPositions.length === 0) return -1;
  if (pinnedPositions.length === 0) return 0;
  let best = 0;
  let bestDist = -1;
  for (let i = 0; i < unpinnedPositions.length; i++) {
    const pos = unpinnedPositions[i]!;
    let dist = Infinity;
    for (const pinned of pinnedPositions) {
      dist = Math.min(dist, Math.abs(pos - pinned));
    }
    if (dist > bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function sanitizePinterestHashtags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.replace(/^#/, "").trim().toLowerCase();
    if (!HASHTAG_RE.test(tag)) continue;
    if (PINTEREST_BANNED_HASHTAGS.has(tag)) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= PINTEREST_MAX_HASHTAGS) break;
  }
  return out;
}

/**
 * Natural-language pin body. Strips URL dumps, trailing hashtag blocks, and
 * comma-separated keyword lists that TransAct-era spam filters treat as stuffing.
 */
export function sanitizePinterestCaption(caption: string): string {
  const stripped = caption
    .replace(URL_RE, " ")
    .replace(/(?:\s*#\w+)+\s*$/, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
  if (!stripped) return "";
  const commas = (stripped.match(/,/g) ?? []).length;
  const hasSentence = /[.!?]/.test(stripped);
  if (commas >= 4 && !hasSentence) {
    const first = stripped.split(",")[0]?.trim() ?? "";
    return first;
  }
  return stripped;
}

/**
 * Drop spammy lead adjectives and invented punctuation so the title starts
 * on a real search noun ("green polka dot bear phone case"), not "Stylish:".
 */
export function sanitizePinterestTitle(
  title: string,
  fallback = "",
): string {
  let next = title.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4; i++) {
    const stripped = next.replace(SPAM_PREFIX_RE, "").trim();
    if (stripped === next) break;
    next = stripped;
  }
  next = next.replace(/^[:\-–—]\s*/, "").replace(/\s+/g, " ").trim();
  if (next.length < 8) {
    const fb = fallback.replace(/\s+/g, " ").trim();
    if (fb.length >= 8) next = fb;
  }
  return next.slice(0, PINTEREST_TITLE_MAX);
}

/**
 * Device tokens (iphone 17, pixel 10, …) that appear in the pin title but
 * not in the catalog title are almost always the model hallucinating SEO.
 * Strip those tokens; keep tokens the product actually claims.
 */
export function stripUnmentionedDevices(
  title: string,
  productTitle: string,
): string {
  const product = productTitle.toLowerCase();
  return title
    .replace(
      /\b(iphone|ipad|galaxy|pixel|pixel fold)\s*(\d{1,2})\b/gi,
      (match, family: string, num: string) => {
        const token = `${family} ${num}`.toLowerCase();
        const compact = `${family}${num}`.toLowerCase();
        if (product.includes(token) || product.includes(compact)) return match;
        return family;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function pinOverlayLines(
  title: string,
  maxWords: number = PINTEREST_OVERLAY_MAX_WORDS,
  maxLineChars = 22,
): string[] {
  const words = sanitizePinterestTitle(title)
    .replace(/[#|]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxLineChars && lines.length < 1) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

export function buildPinterestAltText(input: {
  imageAlt?: string | null;
  productTitle?: string | null;
}): string {
  const fromImage = input.imageAlt?.trim() ?? "";
  if (fromImage.length >= 12) return fromImage.slice(0, PINTEREST_ALT_MAX);
  const title = input.productTitle?.trim();
  if (!title) return "Y2KASE phone accessory product photo.";
  return `${title} — product photo from Y2KASE.`.slice(0, PINTEREST_ALT_MAX);
}

export function buildPinterestDescription(input: {
  caption?: string | null;
  hashtags?: readonly string[];
  productTitle?: string | null;
}): string {
  const caption =
    sanitizePinterestCaption(input.caption ?? "") ||
    (input.productTitle?.trim()
      ? `${input.productTitle.trim()} from Y2KASE.`
      : "");
  const tags = sanitizePinterestHashtags(input.hashtags ?? []);
  const tagLine = tags.map((t) => `#${t}`).join(" ");
  const cta = /y2kase\.com/i.test(caption) ? "" : PINTEREST_CTA;
  return [caption, cta, tagLine]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, PINTEREST_DESC_MAX);
}

/** Parse the `ALT:` line auto-pin stores on the creative prompt. */
export function altTextFromPrompt(prompt: string | null | undefined): string | null {
  if (!prompt) return null;
  const match = /^ALT:(.+)$/m.exec(prompt);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

export function promptWithAltText(altText: string | null | undefined): string {
  const alt = altText?.trim();
  return alt
    ? `ALT:${alt}`
    : "(auto-pinned real product photo — no generation)";
}
