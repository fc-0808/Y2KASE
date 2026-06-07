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
   * Build the image prompt. `product` is the listing being marketed; `extra`
   * is optional free-text the operator can add (e.g. "Valentine's Day", "pink").
   */
  buildPrompt: (product: PresetProductContext, extra?: string) => string;
};

export type PresetProductContext = {
  title: string;
  productType: string;
  description?: string | null;
  materials?: string | null;
  tags?: string[];
};

const BRAND_VOICE = `Brand: Y2KASE — a Gen-Z kawaii / Y2K aesthetic phone accessories brand (phone cases, charms, grips). Aesthetic: playful, cute, holographic, pastel, maximalist but tasteful, trend-forward. Always photoreal, high-end e-commerce quality, sharp focus, professional studio or lifestyle photography. No text, no watermarks, no logos unless described.`;

function productLine(p: PresetProductContext): string {
  const bits = [`Product: ${p.title} (${p.productType.replace(/_/g, " ")})`];
  if (p.materials) bits.push(`Materials: ${p.materials}`);
  if (p.tags && p.tags.length) bits.push(`Style cues: ${p.tags.slice(0, 6).join(", ")}`);
  return bits.join(". ");
}

function withExtra(base: string, extra?: string): string {
  return extra && extra.trim()
    ? `${base}\nAdditional art direction: ${extra.trim()}.`
    : base;
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
    description: "Clean premium product shot on a colour-pop backdrop.",
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
    description: "Eye-catching promo background (add your own text after).",
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
