/**
 * Instagram fashion editorial — the mix a real accessories social team runs
 * instead of a SKU catalog firehose.
 *
 * Why this file exists
 * ────────────────────
 * Pinterest is search. Instagram is a magazine cover you judge in two seconds.
 * The first @y2kase.co post was a product close-up with the overlay "this is
 * the CUTEST jirai phone case ever". That is Bella Straps: a shop grid.
 * BURGA, plantica, mintapple and TORRAS do the opposite — the accessory is in
 * the frame, the frame is fashion.
 *
 * Steal the MIX, not the wardrobe
 * ───────────────────────────────
 * Y2KASE is not BURGA (surf / quiet luxury), not mintapple (pebbled leather),
 * not TORRAS (sport). The site already says CUTE BUT TOUGH: jirai, Y2K,
 * holographic, Sanrio, charms + bows + grips. That is Harajuku maximalist
 * fashion. The website's Featured Editorial, "Shop the universe", and
 * drop-proof-but-cute trust line are the brief. Instagram just wasn't using it.
 *
 * Hard rules
 * ──────────
 *   1. Consecutive posts never share a pillar. Three case close-ups in a row
 *      is a catalog, even with a pretty caption.
 *   2. Auto-publish still uses real catalog media when the post claims to be
 *      the SKU (Reels especially). Fashion stills are operator assets:
 *      generate, download, post in the Instagram app, mark recorded.
 *      Never auto-publish AI as "this is the product you will receive".
 *   3. Captions talk about the girl, the look, the vanity, the era. The
 *      product is the last accessory she puts on — not the sentence subject
 *      on line one, and never the listing title dumped as a caption.
 *   4. Overlay copy is 2–6 words of mood. Not a product slogan.
 *   5. Profile category is Fashion Accessories. Bio stays the attitude line.
 *
 * What a human still has to do
 * ────────────────────────────
 * Change the IG category off 手機店, shoot a real look when you can, reply,
 * and fill highlights. The desk plans the mix and writes the page; it does
 * not replace a person in the comments.
 */

import { BRAND_KNOWLEDGE } from "@/lib/catalog/brands";

/**
 * Photography + product locks for fashion stills. Text-only generation
 * invents SKUs and plastic faces. These lines go on every fashion prompt;
 * the catalog photo is attached separately via images.edit.
 */
export const FASHION_PHOTO_LOCK = `PHOTOGRAPHY: Looks like a real candid photo shot on an iPhone 15 Pro or 35mm film — not a render. Visible pores, peach fuzz, flyaway hairs, natural catchlights, slight grain, slight asymmetry. NOT a beauty filter, NOT Facetune, NOT CGI, NOT an illustration, NOT waxy airbrushed skin, NOT doll eyes, NOT extra fingers, NOT warped text, NOT studio beauty lighting on a generated face.`;

export const FASHION_MOOD_LOCK = `MOOD: Y2KASE is CUTE BUT TOUGH — lively, playful, confident. A small real smile or a knowing smirk, not a stock-photo grin, not a beauty-campaign smile. Eyes engaged. NOT vacant, NOT melancholy, NOT a mugshot, NOT gothic-funeral, NOT unblinking.`;

export const FASHION_PRODUCT_LOCK = `PRODUCT: The attached catalog photo IS the product. Copy that exact case, print, charm and grip into the scene. Do not redesign it. Do not invent a marble case, a round glitter pop socket, a flat character print, or extra beads. A charm, grip or strap appears ONLY if it is in the attached photo. If the charm is 3D plush, it stays 3D plush.`;

export const FASHION_FRAME_LOCK = `FRAMING: The product is the hero. Hold it toward the lens so the case fills at least half the frame, sharp and readable. Not a headshot with a tiny phone by the cheek. Not a wide full-body shot where the case is a speck.`;

export const FASHION_REFERENCE_PRODUCT = "the exact product in the attached catalog photo";

export const INSTAGRAM_TAGLINE = "CUTE BUT TOUGH";

/** Instagram business category — not "Mobile phone shop". */
export const INSTAGRAM_BIO_CATEGORY = "Fashion Accessories";

/**
 * 150-character-class bio. Same shape as BURGA's "ESCAPE BORING #myBURGA":
 * attitude, then the shop. Do not turn this into a product list.
 */
export const INSTAGRAM_BIO = `${INSTAGRAM_TAGLINE} 👅
Y2K / jirai accessories
#y2kase`;

export const INSTAGRAM_HIGHLIGHTS = [
  { key: "looks", label: "Looks", cover: "A fashion still — outfit, not a white-background SKU." },
  { key: "shop", label: "Shop", cover: "One strong product crop. The shop ring, not the whole grid." },
  { key: "characters", label: "Characters", cover: "Kuromi / Melody / Kitty as a world, not a catalog row." },
  { key: "new", label: "New", cover: "The current drop, shot like a magazine insert." },
] as const;

/** Overlay on a Reel cover or fashion still. IG stickers die after ~6 words. */
export const INSTAGRAM_OVERLAY_MAX_WORDS = 6;

export type FashionPillar = "look" | "still" | "graphic" | "detail" | "world";

export type FashionAesthetic = "jirai" | "y2k" | "kawaii";

export type LookCues = {
  character: string | null;
  brand: string | null;
  aesthetic: FashionAesthetic;
};

export type FashionAssetSource = "reel" | "fashion-still" | "catalog-photos";

/**
 * First 3×4 grid. Read it like a magazine spread, left-to-right, top-to-bottom:
 *
 *   look     still    graphic
 *   world    look     detail
 *   graphic  still    look
 *   detail   world    look
 *
 * Four looks (the brand), two of everything else. No two neighbours match.
 */
export const INSTAGRAM_BOOTSTRAP_GRID: readonly FashionPillar[] = [
  "look",
  "still",
  "graphic",
  "world",
  "look",
  "detail",
  "graphic",
  "still",
  "look",
  "detail",
  "world",
  "look",
] as const;

/**
 * After the first grid. Starts on `still` so it does not collide with the
 * bootstrap closer (`look`), and the cycle does not collide with itself.
 */
export const INSTAGRAM_SUSTAIN_CYCLE: readonly FashionPillar[] = [
  "still",
  "graphic",
  "world",
  "look",
  "detail",
  "look",
] as const;

/** Social Studio preset keyed by pillar. Must exist in presets.ts. */
export const FASHION_PRESET_BY_PILLAR: Record<FashionPillar, string> = {
  look: "fashion_look",
  still: "vanity_still",
  graphic: "manifesto_card",
  detail: "macro_charm",
  world: "character_world",
};

export const FASHION_PRESET_KEYS: readonly string[] = Object.values(
  FASHION_PRESET_BY_PILLAR,
);

export type FashionPillarMeta = {
  label: string;
  kicker: string;
  why: string;
  defaultOverlay: string;
  defaultCaption: string;
  seedHashtags: readonly string[];
  /** Swatch in the admin mix grid. */
  swatch: string;
};

export const FASHION_PILLARS: Record<FashionPillar, FashionPillarMeta> = {
  look: {
    label: "Look",
    kicker: "Editorial",
    why: "The case is the hero — large, sharp, held toward the camera. The girl is styled context, not a beauty-filter portrait.",
    defaultOverlay: "jirai girl era",
    defaultCaption:
      "Black bow. White beads. That's the uniform.",
    seedHashtags: ["jiraikei", "y2kfashion", "harajuku"],
    swatch: "#E1306C",
  },
  still: {
    label: "Still life",
    kicker: "Vanity",
    why: "A styled world, not a white-background SKU. plantica puts flowers next to the case; we put bows, gloss, charms.",
    defaultOverlay: "the 11pm vanity",
    defaultCaption: "The vanity at 11pm. Everything stays on the case.",
    seedHashtags: ["jiraikei", "y2k", "vanity"],
    swatch: "#833AB4",
  },
  graphic: {
    label: "Manifesto",
    kicker: "Graphic",
    why: "BURGA's 'Daily affirmations' tile. Personality in the grid so it does not read as a shop row.",
    defaultOverlay: INSTAGRAM_TAGLINE.toLowerCase(),
    defaultCaption: `${INSTAGRAM_TAGLINE}.\nPretty is not the opposite of durable.`,
    seedHashtags: ["y2kase", "y2k", "jiraikei"],
    swatch: "#F77737",
  },
  detail: {
    label: "Detail",
    kicker: "Macro",
    why: "mintapple's leather macro, translated: glitter bow, charm, holographic edge. Jewelry lighting.",
    defaultOverlay: "the bow is the outfit",
    defaultCaption: "The glitter on the bow is the whole personality.",
    seedHashtags: ["holographic", "jiraikei", "y2k"],
    swatch: "#0EA5A4",
  },
  world: {
    label: "World",
    kicker: "Atmosphere",
    why: "TORRAS sells passion around the product. We sell the universe the girl lives in — then the case is in it.",
    defaultOverlay: "this is the universe",
    defaultCaption: "Not a listing photo. A world she already lives in.",
    seedHashtags: ["y2kfashion", "jiraikei", "harajuku"],
    swatch: "#6C5CE7",
  },
};

export type FashionLookBrief = {
  pillar: FashionPillar;
  label: string;
  kicker: string;
  why: string;
  shoot: string;
  overlay: string;
  captionSeed: string;
  hashtags: string[];
  preset: string;
  assetSource: FashionAssetSource;
  allowGenerate: boolean;
  /** Extra prompt fragment for gpt-image-1. */
  promptExtra: string;
};

export type FashionBriefInput = {
  publishedCount: number;
  mediaType?: "carousel" | "video" | null;
  productTitle?: string | null;
  tags?: readonly string[];
  characterName?: string | null;
  brandName?: string | null;
};

const SLOGAN_LINE_RE =
  /this is the (cutest|best|coolest|hottest)\b|\bphone case ever\b|\bnew drop in the shop\b/i;

export function fashionPillarAt(publishedCount: number): FashionPillar {
  const n = Number.isFinite(publishedCount)
    ? Math.max(0, Math.floor(publishedCount))
    : 0;
  if (n < INSTAGRAM_BOOTSTRAP_GRID.length) {
    return INSTAGRAM_BOOTSTRAP_GRID[n]!;
  }
  const i =
    (n - INSTAGRAM_BOOTSTRAP_GRID.length) % INSTAGRAM_SUSTAIN_CYCLE.length;
  return INSTAGRAM_SUSTAIN_CYCLE[i]!;
}

/** Next `length` pillars including the current slot — the mix the operator sees. */
export function fashionGridPreview(
  publishedCount: number,
  length = INSTAGRAM_BOOTSTRAP_GRID.length,
): FashionPillar[] {
  const n = Math.max(1, Math.min(24, Math.floor(length)));
  return Array.from({ length: n }, (_, i) => fashionPillarAt(publishedCount + i));
}

export function isFashionPreset(key: string): boolean {
  return (FASHION_PRESET_KEYS as readonly string[]).includes(key);
}

export function pillarFromPreset(presetKey: string): FashionPillar | null {
  for (const [pillar, key] of Object.entries(FASHION_PRESET_BY_PILLAR) as [
    FashionPillar,
    string,
  ][]) {
    if (key === presetKey) return pillar;
  }
  return null;
}

/**
 * What actually goes on the grid today.
 *
 * A listing video existing is not a reason to burn a Look day. Reels discovery
 * on a 0-post shop is wasted if the profile tile is a studio SKU clip — the
 * visitor lands, sees a catalog, and leaves. Graph API may still prefer Reels;
 * the manual fashion pack does not.
 *
 * Detail days may use the product clip: a 14s charm close-up is jewelry, not a
 * listing, once the grid already looks like a magazine.
 */
export function fashionFeedMediaType(input: {
  pillar: FashionPillar;
  catalogMediaType?: "carousel" | "video" | null;
}): "carousel" | "video" {
  if (input.pillar === "detail" && input.catalogMediaType === "video") {
    return "video";
  }
  return "carousel";
}

export function fashionAssetPlan(input: {
  pillar: FashionPillar;
  mediaType?: "carousel" | "video" | null;
}): { assetSource: FashionAssetSource; allowGenerate: boolean } {
  if (input.pillar === "detail" && input.mediaType === "video") {
    return { assetSource: "reel", allowGenerate: true };
  }
  if (input.pillar === "detail") {
    return { assetSource: "catalog-photos", allowGenerate: true };
  }
  return { assetSource: "fashion-still", allowGenerate: true };
}

export function inferLookCues(input: {
  title?: string | null;
  tags?: readonly string[];
  characterName?: string | null;
  brandName?: string | null;
}): LookCues {
  const character =
    input.characterName?.trim() ||
    characterFromText(`${input.title ?? ""} ${(input.tags ?? []).join(" ")}`);
  const brand = input.brandName?.trim() || null;
  return {
    character: character || null,
    brand,
    aesthetic: inferAesthetic(
      `${input.title ?? ""} ${(input.tags ?? []).join(" ")} ${character ?? ""} ${brand ?? ""}`,
      character,
    ),
  };
}

function characterFromText(raw: string): string | null {
  const hay = raw.toLowerCase();
  if (!hay.trim()) return null;
  let best: { name: string; len: number } | null = null;
  for (const entry of BRAND_KNOWLEDGE) {
    for (const ch of entry.characters ?? []) {
      const names = [ch.name, ...(ch.aliases ?? [])];
      for (const name of names) {
        const needle = name.toLowerCase().trim();
        if (needle.length < 3) continue;
        if (!hay.includes(needle)) continue;
        if (!best || needle.length > best.len) {
          best = { name: ch.name, len: needle.length };
        }
      }
    }
  }
  return best?.name ?? null;
}

function inferAesthetic(raw: string, character: string | null): FashionAesthetic {
  const hay = raw.toLowerCase();
  if (/\bjirai(?:-?kei)?\b/.test(hay)) return "jirai";
  if (character && /kuromi/i.test(character)) return "jirai";
  // Character identity beats SEO stuffing. "Miffy … Cute Kawaii Y2K for iPhone"
  // is a mint kawaii object, not a chrome gyaru look.
  if (
    character &&
    /miffy|hello kitty|cinnamoroll|pompompurin|keroppi|pochacco|chiikawa|little twin stars/i.test(
      character,
    )
  ) {
    return "kawaii";
  }
  if (character && /my melody/i.test(character)) {
    return "kawaii";
  }
  if (/\b(holograph(?:ic)?|chrome)\b/.test(hay)) return "y2k";
  if (/\b(kawaii|sanrio)\b/.test(hay)) return "kawaii";
  if (/\b(y2k|2000s)\b/.test(hay)) return "y2k";
  return "y2k";
}

export function sanitizeFashionOverlay(
  raw: string,
  fallback: string,
): string {
  const fb = fallback.replace(/\s+/g, " ").trim() || FASHION_PILLARS.look.defaultOverlay;
  let next = raw.replace(/[#|/]/g, " ").replace(/\s+/g, " ").trim();
  if (!next || SLOGAN_LINE_RE.test(next)) next = fb;
  const words = next.split(/\s+/).filter(Boolean).slice(0, INSTAGRAM_OVERLAY_MAX_WORDS);
  const out = words.join(" ");
  return out.length >= 2 ? out : fb;
}

export function fashionOverlayLines(
  raw: string,
  fallback: string,
  maxLineChars = 18,
): string[] {
  const words = sanitizeFashionOverlay(raw, fallback)
    .split(/\s+/)
    .filter(Boolean);
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

export function isCatalogDumpCaption(
  caption: string,
  productTitle: string,
): boolean {
  const a = caption.replace(/\s+/g, " ").trim().toLowerCase();
  const b = productTitle.replace(/\s+/g, " ").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(b) && a.length - b.length < 8) return true;
  return false;
}

/** Drop listing-slogan lines. Empty string means "use the fashion fallback". */
export function stripCatalogSlogans(caption: string): string {
  const kept = caption
    .split("\n")
    .filter((line) => !SLOGAN_LINE_RE.test(line));
  return kept
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function fallbackFashionCaption(
  pillar: FashionPillar,
  cues: LookCues,
): string {
  const meta = FASHION_PILLARS[pillar];
  const character = cues.character;
  if (pillar === "look" && character) {
    return `${character} girl era.\nThe case is the last accessory she puts on.`;
  }
  if (pillar === "world" && character) {
    return `A ${character} world. The phone just lives in it.`;
  }
  if (pillar === "graphic") {
    return meta.defaultCaption;
  }
  if (character && pillar === "still") {
    return `The ${character} vanity at 11pm. Bows stay on.`;
  }
  return meta.defaultCaption;
}

export function hashtagsForCues(
  cues: LookCues,
  pillar: FashionPillar,
): string[] {
  const seeded = [...FASHION_PILLARS[pillar].seedHashtags];
  if (cues.aesthetic === "kawaii") {
    return uniqueTags([
      tagFromName(cues.character),
      "kawaii",
      "y2kase",
      ...seeded.filter((t) => t !== "jiraikei" && t !== "harajuku"),
    ]);
  }
  if (cues.character) {
    const tag = tagFromName(cues.character);
    if (tag) seeded.unshift(tag);
  }
  if (cues.aesthetic === "jirai" && !seeded.includes("jiraikei")) {
    seeded.push("jiraikei");
  }
  return uniqueTags(seeded);
}

function tagFromName(name: string | null): string | null {
  if (!name) return null;
  const tag = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return tag.length >= 2 && tag.length <= 30 ? tag : null;
}

function uniqueTags(tags: Array<string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function overlayFor(cues: LookCues, pillar: FashionPillar): string {
  const meta = FASHION_PILLARS[pillar];
  if (pillar === "graphic") return meta.defaultOverlay;
  if (pillar === "look" && cues.character) {
    return sanitizeFashionOverlay(
      `${cues.character} girl era`,
      meta.defaultOverlay,
    );
  }
  if (pillar === "look" && cues.aesthetic === "jirai") {
    return meta.defaultOverlay;
  }
  if (pillar === "look" && cues.aesthetic === "y2k") {
    return "chrome and bows";
  }
  return meta.defaultOverlay;
}

function shootBrief(cues: LookCues, pillar: FashionPillar): string {
  const product = FASHION_REFERENCE_PRODUCT;
  const characterBit = cues.character
    ? ` Character on the physical product: ${cues.character} — only as it appears in the catalog photo, never as a costumed mascot in the room.`
    : "";
  const aestheticBit =
    cues.aesthetic === "jirai"
      ? "jirai-kei / landmine girl (black-pink, dark bows, twin tails or space buns, cute-but-tough)"
      : cues.aesthetic === "kawaii"
        ? "soft grown-up kawaii (mint, cream, gingham, leaf charms, sweet but styled — not baby, not chrome gyaru, not black lolita)"
        : "Y2K (chrome, holographic, butterflies, 2000s gyaru magazine)";
  const settingBit =
    cues.aesthetic === "kawaii"
      ? "a sunlit cafe window, a cream bedroom floor, or a park bench"
      : cues.aesthetic === "jirai"
        ? "Harajuku night, a bedroom floor, or a dim cafe window"
        : "city night with chrome, a bedroom floor, or a cafe window";
  const energy =
    pillar === "look" || pillar === "world"
      ? " A small real smile or knowing smirk, CUTE BUT TOUGH energy, eyes engaged. Not a vacant mugshot, not a stock-photo grin, not doll-faced, not gothic-funeral."
      : "";

  switch (pillar) {
    case "look":
      return `Product-hero fashion still, not a headshot and not a white-background listing. A woman in her early 20s wearing a ${aestheticBit} outfit that colour-matches ${product}. Styled hands, nails and sleeve are in frame. She holds ${product} toward the camera so the case fills at least half the frame — sharp, front-facing, readable. Her face stays at the edge or is cropped at the cheek; never a beauty-filter portrait with a tiny phone. Setting: ${settingBit}. Shot like a real candid iPhone photo in natural light.${energy}${characterBit}`;
    case "still":
      return cues.aesthetic === "kawaii"
        ? `Vanity still life, slightly overhead. ${product} sits among mint leaves, cream ribbon, lip gloss, a small bag. Soft daylight, not ecommerce white. The product is one object in a girl's world.${characterBit}`
        : `Vanity still life, slightly overhead. ${product} sits among a black glitter bow, a beaded charm, lip gloss, loose bows, jewelry. Moody bedroom lamp, not ecommerce white. The product is one object in a girl's world.${characterBit}`;
    case "graphic":
      return `Square Y2K graphic poster: chrome hearts, pink-to-black gradient, sparkle, 2004 gyaru-magazine energy. Generous empty centre. Do NOT render the product as a catalog shot. Do NOT render any text, watermarks, or logos.`;
    case "detail":
      return `Jewelry-ad macro of the most fashion-coded part of ${product} — glitter bow, charm, holographic edge, or beaded strap, exactly as in the catalog photo. Extreme close-up, shallow depth of field. Crop so it could run in a fashion magazine.${characterBit}`;
    case "world":
      return `The world this girl lives in, ${aestheticBit}. ${settingBit}. ${product} is in the scene the way a watch is in a fashion story — present and sharp, not the only subject.${energy}${characterBit}`;
  }
}

export function buildFashionLookBrief(input: FashionBriefInput): FashionLookBrief {
  const pillar = fashionPillarAt(input.publishedCount);
  const meta = FASHION_PILLARS[pillar];
  const cues = inferLookCues({
    title: input.productTitle,
    tags: input.tags,
    characterName: input.characterName,
    brandName: input.brandName,
  });
  const { assetSource, allowGenerate } = fashionAssetPlan({
    pillar,
    mediaType: input.mediaType,
  });
  const overlay = overlayFor(cues, pillar);
  const shoot = shootBrief(cues, pillar);
  return {
    pillar,
    label: meta.label,
    kicker: meta.kicker,
    why: meta.why,
    shoot,
    overlay,
    captionSeed: fallbackFashionCaption(pillar, cues),
    hashtags: hashtagsForCues(cues, pillar),
    preset: FASHION_PRESET_BY_PILLAR[pillar],
    assetSource,
    allowGenerate,
    promptExtra: shoot,
  };
}

export function describeFashionBrief(brief: FashionLookBrief): string {
  if (brief.assetSource === "reel") {
    return `${brief.kicker} · ${brief.label}. Detail-day Reel: the clip is jewelry, not a listing. Cover sticker is the fashion layer. Listing videos do not run on Look days.`;
  }
  if (brief.assetSource === "catalog-photos") {
    return `${brief.kicker} · ${brief.label}. Use a tight catalog crop, or generate a macro still. ${brief.why}`;
  }
  return `${brief.kicker} · ${brief.label}. Generate the fashion still from the listing photo, download, post in Instagram. Reject it if the case is not the real SKU or the face looks CGI. ${brief.why}`;
}

/** Voice paragraph injected into the caption model for this pillar. */
export function fashionCaptionVoice(pillar: FashionPillar): string {
  switch (pillar) {
    case "look":
      return "Write as a fashion story. The girl, the outfit, the era. The product is an accessory in the look.";
    case "still":
      return "Write as a still-life caption. Objects, time of day, mood. No SKU dump.";
    case "graphic":
      return `Write a short manifesto. Lead with ${INSTAGRAM_TAGLINE}. No product name on line one.`;
    case "detail":
      return "Write about one detail as if it were jewelry. Texture, not a listing title.";
    case "world":
      return "Write about the world she lives in, not the checkout.";
  }
}
