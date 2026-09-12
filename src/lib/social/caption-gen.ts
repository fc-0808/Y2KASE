/**
 * Social Studio — caption + hashtag generation.
 *
 * Produces platform-tailored copy for a creative using the chat model. Each
 * platform has its own voice and hashtag conventions:
 *   - Pinterest: keyword-rich, SEO-driven, descriptive (discovered via search).
 *   - TikTok:    short, punchy, trend-aware, hook-first, fewer hashtags.
 *   - Instagram: fashion-editorial, pillar-aware (look / still / graphic /
 *     world / detail), 3–5 niche hashtags, link-in-bio — never a URL dump.
 *   - generic:   a neutral, reusable caption.
 */

import OpenAI from "openai";
import type { SocialPlatform } from "@/lib/social/presets";
import {
  sanitizeInstagramCaption,
  sanitizeInstagramHashtags,
} from "@/lib/social/instagram-strategy";
import {
  fallbackFashionCaption,
  fashionCaptionVoice,
  hashtagsForCues,
  inferLookCues,
  isCatalogDumpCaption,
  stripCatalogSlogans,
  type FashionPillar,
} from "@/lib/social/instagram-fashion";

export type GeneratedCaption = {
  caption: string;
  hashtags: string[];
};

const PLATFORM_BRIEF: Record<SocialPlatform, string> = {
  pinterest:
    "Pinterest: write 1-2 natural sentences a shopper would type when searching. Name the product, who it's for or when they'd use it, and what they get on click. No comma-separated keyword lists, no 'Stylish/Trendy/Unique' openers, no invented iPhone models. 3-5 niche hashtags.",
  tiktok:
    "TikTok: write a short, punchy, hook-first caption (max ~150 chars) with Gen-Z energy and a light CTA. 3-5 trending-style hashtags.",
  instagram:
    "Instagram: you are the fashion editor of Y2KASE (CUTE BUT TOUGH) — a jirai / Y2K accessories house, not a phone-case catalog. Line 1 is a mood a girl would screenshot. NEVER open with the product name. NEVER write 'this is the CUTEST … phone case ever'. NEVER 'new drop in the shop'. Name the product at most once, as an accessory in the look. 2-4 short lines, at most 3 emojis. Soft CTA is 'link in bio' — NEVER paste a URL. 3-5 niche hashtags only (character, jiraikei, y2kfashion, harajuku, holographic). Never #fyp #viral #love #fashion #style #cute #instagood #explorepage. Put hashtags in the JSON array, not in the caption body.",
  generic:
    "Generic: write a clean, reusable caption (1-2 sentences, light emoji) and 5-8 broadly useful hashtags.",
};

const SYSTEM = `You are the social media manager for Y2KASE, a Gen-Z jirai / Y2K / kawaii FASHION accessories brand (phone cases, charms, grips). Tagline: CUTE BUT TOUGH. Voice: fashion-editorial, confident, a little mean in a cute way, never a catalog dump. You write copy that makes the grid look like a magazine. Return STRICT JSON: { "caption": string, "hashtags": string[] } where hashtags have NO leading '#' and are lowercase.`;

export function isCaptionGenConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateCaption(opts: {
  productTitle: string;
  productType: string;
  description?: string | null;
  tags?: string[];
  platform: SocialPlatform;
  preset: string;
  extra?: string;
  pillar?: FashionPillar;
  characterName?: string | null;
  brandName?: string | null;
}): Promise<GeneratedCaption> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";

  const ctx = [
    `Product: ${opts.productTitle} (${opts.productType.replace(/_/g, " ")}).`,
    opts.characterName ? `Character: ${opts.characterName}` : "",
    opts.brandName ? `Brand: ${opts.brandName}` : "",
    opts.description ? `Details: ${opts.description.slice(0, 300)}` : "",
    opts.tags?.length ? `Tags: ${opts.tags.slice(0, 8).join(", ")}` : "",
    opts.extra ? `Theme: ${opts.extra}` : "",
    opts.platform === "instagram"
      ? `${PLATFORM_BRIEF.instagram}\nToday's pillar: ${opts.pillar ?? "look"}. ${fashionCaptionVoice(opts.pillar ?? "look")}`
      : PLATFORM_BRIEF[opts.platform],
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.chat.completions.create({
    model,
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Write social copy for this creative.\n${ctx}\nReturn only the JSON.`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<GeneratedCaption> = {};
  try {
    parsed = JSON.parse(raw) as Partial<GeneratedCaption>;
  } catch {
    parsed = {};
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const caption = (parsed.caption ?? "").trim();
  if (opts.platform === "instagram") {
    const pillar = opts.pillar ?? "look";
    const cues = inferLookCues({
      title: opts.productTitle,
      tags: opts.tags,
      characterName: opts.characterName,
      brandName: opts.brandName,
    });
    const cleaned = stripCatalogSlogans(sanitizeInstagramCaption(caption));
    const body =
      cleaned && !isCatalogDumpCaption(cleaned, opts.productTitle)
        ? cleaned
        : fallbackFashionCaption(pillar, cues);
    return {
      caption: body,
      hashtags: sanitizeInstagramHashtags([
        ...hashtagsForCues(cues, pillar),
        ...hashtags,
      ]),
    };
  }

  return { caption, hashtags };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-pin variations (Pinterest SEO) — distinct copy for each pin of a listing
// ─────────────────────────────────────────────────────────────────────────────

export type CaptionVariation = {
  /** Keyword-rich Pinterest title (<= 100 chars). */
  title: string;
  caption: string;
  hashtags: string[];
};

const VARIATIONS_SYSTEM = `You are a Pinterest SEO strategist for Y2KASE, a Gen-Z kawaii / Y2K phone accessories brand (phone cases, charms, grips). Pinterest is a visual SEARCH engine. Each pin must sound like a real search a shopper would type — not an ad, not a keyword dump.

Return STRICT JSON: { "variations": [ { "title": string, "caption": string, "hashtags": string[] } ] }.

Rules:
- Produce EXACTLY the requested number of variations.
- "title": a real Pinterest search phrase, <= 90 chars. Lead with the product noun (character, color, product type). NEVER start with Stylish, Trendy, Unique, Fun and Funky, Amazing, or Must-have. NEVER invent a device model (iPhone 17, Pixel 10, …) that is not in the product title.
- "caption": 1-2 helpful sentences. First sentence is what the pin is. Second is who it's for or what they find on click. No comma-separated keyword lists. No hard sell.
- "hashtags": 3-5 lowercase niche tags (character / aesthetic / product type), NO leading '#'. Never fyp, viral, cute, aesthetic, trending.`;

/**
 * Generate `count` DISTINCT Pinterest copy variations for one product in a
 * single call — one per pin — so each pin ranks for different search terms.
 * Best-effort: returns [] on failure so callers can fall back gracefully.
 */
export async function generateCaptionVariations(opts: {
  productTitle: string;
  productType: string;
  description?: string | null;
  tags?: string[];
  count: number;
  extra?: string;
}): Promise<CaptionVariation[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const count = Math.max(1, Math.min(10, Math.floor(opts.count)));
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";

  const ctx = [
    `Product: ${opts.productTitle} (${opts.productType.replace(/_/g, " ")}).`,
    opts.description ? `Details: ${opts.description.slice(0, 300)}` : "",
    opts.tags?.length ? `Tags: ${opts.tags.slice(0, 8).join(", ")}` : "",
    opts.extra ? `Angle: ${opts.extra}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.chat.completions.create({
    model,
    temperature: 1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: VARIATIONS_SYSTEM },
      {
        role: "user",
        content: `Produce ${count} distinct Pinterest pin variations for this product.\n${ctx}\nReturn only the JSON.`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: { variations?: unknown };
  try {
    parsed = JSON.parse(raw) as { variations?: unknown };
  } catch {
    return [];
  }

  const list = Array.isArray(parsed.variations) ? parsed.variations : [];
  return list
    .map((v): CaptionVariation | null => {
      if (typeof v !== "object" || v === null) return null;
      const obj = v as Record<string, unknown>;
      const caption = typeof obj.caption === "string" ? obj.caption.trim() : "";
      const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 100) : "";
      const hashtags = Array.isArray(obj.hashtags)
        ? obj.hashtags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.replace(/^#/, "").trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 8)
        : [];
      if (!caption && !title) return null;
      return { title, caption, hashtags };
    })
    .filter((v): v is CaptionVariation => v !== null);
}
