/**
 * Social Studio — creative presets.
 *
 * Each preset is a reusable "art direction" that turns a product into a
 * platform-ready marketing image. The prompts are written the way a creative
 * director briefs a studio: subject, setting, lighting, composition, mood, and
 * the aspect ratio that matches where the asset will be posted.
 *
 * Pinterest favours tall 2:3 lifestyle imagery; TikTok/Reels favour 9:16
 * vertical; feed posts use 1:1 squares. The preset declares its ideal size and
 * default platform so the studio picks sensible defaults.
 */

import type { ImageSize } from "@/lib/social/image-gen";
import {
  FASHION_FRAME_LOCK,
  FASHION_MOOD_LOCK,
  FASHION_PHOTO_LOCK,
  FASHION_PRODUCT_LOCK,
} from "@/lib/social/instagram-fashion";

export type SocialPlatform = "pinterest" | "tiktok" | "instagram" | "generic";

export type CreativePreset = {
  key: string;
  label: string;
  /** Short description shown in the admin UI. */
  description: string;
  /** Default platform this preset is tuned for. */
  platform: SocialPlatform;
  /** Recommended output dimensions. */
  size: ImageSize;
  /** Emoji shown in the picker. */
  emoji: string;
  /**
   * When true, generation must attach a catalog photo and use images.edit so
   * the model cannot invent a SKU. Graphic/promo cards stay text-only.
   */
  usesProductReference?: boolean;
  /**
   * Build the image prompt. `product` is the listing being marketed; `extra`
   * is optional free-text the operator can add (e.g. "Valentine's Day", "pink").
   * For fashion presets, `extra` *replaces* the default scene so a mint Miffy
   * Look is not generated on top of a jirai-kei wardrobe.
   */
  buildPrompt: (product: PresetProductContext, extra?: string) => string;
};

export type PresetProductContext = {
  title: string;
  productType: string;
  description?: string | null;
  materials?: string | null;
  tags?: string[];
  characterName?: string | null;
  brandName?: string | null;
};

const BRAND_VOICE = `Brand: Y2KASE — a Gen-Z kawaii / Y2K aesthetic phone accessories brand (phone cases, charms, grips). Aesthetic: playful, cute, holographic, pastel, maximalist but tasteful, trend-forward. Always photoreal, high-end e-commerce quality, sharp focus, professional studio or lifestyle photography. No text, no watermarks, no logos unless described.`;

const FASHION_VOICE = `Brand: Y2KASE — CUTE BUT TOUGH. A Gen-Z jirai / Y2K / kawaii FASHION accessories house (cases, charms, grips). The phone case is a fashion accessory, never an Amazon product shot. Photoreal, editorial, magazine quality. Match the wardrobe to the product in the attached catalog photo (mint kawaii, jirai black-pink, or Y2K chrome) — never default every girl to gothic lolita. When a person appears she is an adult in her early 20s, styled, not sexualized, lively not vacant. No watermarks. No invented licensed mascots standing in the scene — character prints appear only as they exist on the physical product.`;

function productLine(p: PresetProductContext): string {
  const bits = [`Product: ${p.title} (${p.productType.replace(/_/g, " ")})`];
  if (p.characterName) bits.push(`Character print: ${p.characterName}`);
  if (p.brandName) bits.push(`IP brand: ${p.brandName}`);
  if (p.materials) bits.push(`Materials: ${p.materials}`);
  if (p.tags && p.tags.length) bits.push(`Style cues: ${p.tags.slice(0, 6).join(", ")}`);
  return bits.join(". ");
}

function withExtra(base: string, extra?: string): string {
  return extra && extra.trim()
    ? `${base}\nAdditional art direction: ${extra.trim()}.`
    : base;
}

/** Identity without the SEO title — the title is how models invent fake prints. */
function fashionProductIdent(p: PresetProductContext): string {
  const kind = p.productType.replace(/_/g, " ") || "accessory";
  const who = [p.characterName?.trim(), p.brandName?.trim()]
    .filter(Boolean)
    .join(" ");
  const label = who ? `${who} ${kind}` : `Y2KASE ${kind}`;
  return `Product identity: the real ${label} in the attached catalog photo. Copy that exact case, print, charm and grip. Do not redesign. Do not invent a flat character print. Do not illustrate any listing title.`;
}

function fashionScene(extra: string | undefined, fallback: string): string {
  return `Scene: ${extra?.trim() || fallback}`;
}

function fashionPrompt(
  p: PresetProductContext,
  extra: string | undefined,
  fallbackScene: string,
  opts: { people?: boolean; square?: boolean; productHero?: boolean } = {},
): string {
  const frame = opts.square
    ? "1:1 square."
    : "Vertical 2:3 for the Instagram grid.";
  return [
    FASHION_VOICE,
    fashionProductIdent(p),
    FASHION_PHOTO_LOCK,
    opts.productHero !== false ? FASHION_FRAME_LOCK : "",
    opts.people ? FASHION_MOOD_LOCK : "",
    FASHION_PRODUCT_LOCK,
    fashionScene(extra, fallbackScene),
    `${frame} Do NOT render any text, watermarks, or logos.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const PRESETS: CreativePreset[] = [
  {
    key: "lifestyle_flatlay",
    label: "Lifestyle Flatlay",
    description: "Aesthetic flatlay with cute props — Pinterest's top performer.",
    platform: "pinterest",
    size: "1024x1536",
    emoji: "🪞",
    buildPrompt: (p, extra) =>
      withExtra(
        `${BRAND_VOICE}\n${productLine(p)}\nScene: a top-down flatlay of the product styled on a soft pastel surface, surrounded by tasteful kawaii props (dried flowers, glossy beads, a matcha latte, holographic confetti). Soft natural daylight, gentle shadows, lots of negative space, dreamy editorial composition. Vertical 2:3 framing optimised for Pinterest.`,
        extra,
      ),
  },
  {
    key: "in_hand_vertical",
    label: "In-Hand (Vertical)",
    description: "Product held by a stylish hand — great for TikTok / Reels.",
    platform: "tiktok",
    size: "1024x1536",
    emoji: "🤳",
    buildPrompt: (p, extra) =>
      withExtra(
        `${BRAND_VOICE}\n${productLine(p)}\nScene: a young person's manicured hand holding the phone showing off the product, trendy outfit sleeve visible, blurred aesthetic cafe / bedroom background with bokeh fairy lights. Bright, punchy, authentic UGC-style vertical photo. 9:16 vertical framing for TikTok and Reels.`,
        extra,
      ),
  },
  {
    key: "studio_hero",
    label: "Studio Hero",
    description:
      "Clean premium product shot. For Pinterest / download — Instagram feed uses fashion presets (Look / Vanity / Manifesto), not this still.",
    platform: "instagram",
    size: "1024x1024",
    emoji: "✨",
    buildPrompt: (p, extra) =>
      withExtra(
        `${BRAND_VOICE}\n${productLine(p)}\nScene: a premium studio hero shot of the product floating / standing on a smooth gradient backdrop in the brand's signature pastel-holographic palette. Crisp rim lighting, subtle reflection, glossy highlights, ultra-clean commercial product photography. Centered 1:1 square composition for an Instagram feed post.`,
        extra,
      ),
  },
  {
    key: "sale_promo",
    label: "Sale / Promo Card",
    description: "Eye-catching promo background (add your own text after). Download and post manually — never auto-published as a fake product shot.",
    platform: "instagram",
    size: "1024x1024",
    emoji: "🏷️",
    buildPrompt: (p, extra) =>
      withExtra(
        `${BRAND_VOICE}\n${productLine(p)}\nScene: a vibrant promotional composition with the product as hero, dynamic confetti and sparkle elements, bold pastel colour blocking, energetic sale-poster energy with generous empty space at the top for a discount headline to be added later. Leave the top third visually clean. 1:1 square. Do NOT render any text.`,
        extra,
      ),
  },
  {
    key: "seasonal",
    label: "Seasonal / Holiday",
    description: "Themed to a holiday or season you specify in the prompt box.",
    platform: "pinterest",
    size: "1024x1536",
    emoji: "🎁",
    buildPrompt: (p, extra) =>
      withExtra(
        `${BRAND_VOICE}\n${productLine(p)}\nScene: a festive seasonal styling of the product with themed decor and a cozy mood matching the season specified. Warm inviting light, gift-guide editorial vibe, tasteful seasonal props. Vertical 2:3 for Pinterest gift boards.`,
        extra || "current season",
      ),
  },
  {
    key: "aesthetic_collage",
    label: "Aesthetic Moodboard",
    description: "Y2K moodboard collage vibe — highly shareable.",
    platform: "pinterest",
    size: "1024x1536",
    emoji: "🌈",
    buildPrompt: (p, extra) =>
      withExtra(
        `${BRAND_VOICE}\n${productLine(p)}\nScene: a Y2K-inspired aesthetic moodboard composition featuring the product alongside chrome hearts, butterflies, glitter gradients, star motifs and holographic textures arranged in a pleasing collage. Nostalgic 2000s digital-print energy, saturated but cohesive. Vertical 2:3 for Pinterest.`,
        extra,
      ),
  },
  {
    key: "fashion_look",
    label: "Fashion Look",
    description:
      "Product-hero fashion still — the case fills the frame, the girl is styled context. Instagram mix: Look days.",
    platform: "instagram",
    size: "1024x1536",
    emoji: "🖤",
    usesProductReference: true,
    buildPrompt: (p, extra) =>
      fashionPrompt(
        p,
        extra,
        "Product-hero fashion still of a woman in her early 20s in a jirai-kei / Y2K outfit (black-and-pink, dark bows, twin tails or space buns). Styled hands and sleeve in frame. She holds the exact product in the attached catalog photo toward the camera so the case fills at least half the frame — sharp, front-facing. Face at the edge or cropped at the cheek, never a beauty-filter portrait with a tiny phone. Harajuku night, a bedroom floor, or a cafe window. Candid iPhone light, CUTE BUT TOUGH energy.",
        { people: true, productHero: true },
      ),
  },
  {
    key: "vanity_still",
    label: "Vanity Still Life",
    description:
      "Bows, gloss, charms, bedroom lamp — plantica's object world, in jirai. Instagram mix: Still days.",
    platform: "instagram",
    size: "1024x1536",
    emoji: "🎀",
    usesProductReference: true,
    buildPrompt: (p, extra) =>
      fashionPrompt(
        p,
        extra,
        "A vanity still life shot from slightly above. The exact product in the attached catalog photo sits among a black glitter bow, a beaded phone charm, lip gloss, loose ribbons, jewelry. Moody bedroom lamp, not ecommerce white. The product is one object in a girl's world. Photoreal, rich blacks and pinks.",
        { productHero: false },
      ),
  },
  {
    key: "manifesto_card",
    label: "Manifesto Card",
    description:
      "BURGA-style personality tile. Empty centre — you add CUTE BUT TOUGH in Instagram. Graphic days.",
    platform: "instagram",
    size: "1024x1024",
    emoji: "🗯️",
    usesProductReference: false,
    buildPrompt: (_p, extra) =>
      withExtra(
        `${FASHION_VOICE}\n${FASHION_PHOTO_LOCK}\nScene: a square Y2K graphic poster — chrome hearts, pink-to-black gradient, sparkle, 2004 gyaru-magazine energy. Generous empty centre for a headline to be added later. Do NOT render the product as a catalog shot. Do NOT render any text, watermarks, or logos. 1:1 square.`,
        extra,
      ),
  },
  {
    key: "macro_charm",
    label: "Macro Charm",
    description:
      "Jewelry-ad close-up of the bow, charm, or holographic edge. Instagram mix: Detail days.",
    platform: "instagram",
    size: "1024x1024",
    emoji: "💎",
    usesProductReference: true,
    buildPrompt: (p, extra) =>
      fashionPrompt(
        p,
        extra,
        "Jewelry-advertising macro of the most fashion-coded part of the exact product in the attached catalog photo — glitter bow grip, beaded charm, holographic edge, or star strap, copied exactly. Extreme close-up, shallow depth of field. Crop so it could run in a fashion magazine.",
        { square: true },
      ),
  },
  {
    key: "character_world",
    label: "Character World",
    description:
      "The universe she lives in — product present like a watch in a fashion story. World days.",
    platform: "instagram",
    size: "1024x1536",
    emoji: "🌙",
    usesProductReference: true,
    buildPrompt: (p, extra) =>
      fashionPrompt(
        p,
        extra,
        "The world this girl lives in — a cluttered cute-but-dark desk, city night with chrome, a bag charm in motion, jirai bedroom. The exact product in the attached catalog photo is in the scene the way a watch is in a fashion story: present, sharp, not the only subject. Photoreal editorial. Do NOT invent a licensed mascot standing in the room.",
        { people: true, productHero: false },
      ),
  },
];

export const PRESET_MAP: Record<string, CreativePreset> = Object.fromEntries(
  PRESETS.map((p) => [p.key, p]),
);

export function getPreset(key: string): CreativePreset | undefined {
  return PRESET_MAP[key];
}

export const PLATFORMS: { key: SocialPlatform; label: string; emoji: string }[] = [
  { key: "pinterest", label: "Pinterest", emoji: "📌" },
  { key: "tiktok", label: "TikTok", emoji: "🎵" },
  { key: "instagram", label: "Instagram", emoji: "📸" },
  { key: "generic", label: "Generic", emoji: "🗂️" },
];
