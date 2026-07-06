/**
 * Social Studio — caption + hashtag generation.
 *
 * Produces platform-tailored copy for a creative using the chat model. Each
 * platform has its own voice and hashtag conventions:
 *   - Pinterest: keyword-rich, SEO-driven, descriptive (discovered via search).
 *   - TikTok:    short, punchy, trend-aware, hook-first, fewer hashtags.
 *   - Instagram: aspirational caption + a healthy hashtag block.
 *   - generic:   a neutral, reusable caption.
 */

import OpenAI from "openai";
import type { SocialPlatform } from "@/lib/social/presets";

export type GeneratedCaption = {
  caption: string;
  hashtags: string[];
};

const PLATFORM_BRIEF: Record<SocialPlatform, string> = {
  pinterest:
    "Pinterest: write a keyword-rich, search-optimised description (1-2 sentences) a shopper would type when looking for this. Helpful and descriptive, not salesy. 3-6 relevant hashtags.",
  tiktok:
    "TikTok: write a short, punchy, hook-first caption (max ~150 chars) with Gen-Z energy and a light CTA. 3-5 trending-style hashtags.",
  instagram:
    "Instagram: write an aspirational, on-brand caption (2-3 short lines, tasteful emojis, a soft CTA). 6-10 hashtags mixing niche + broad.",
  generic:
    "Generic: write a clean, reusable caption (1-2 sentences, light emoji) and 5-8 broadly useful hashtags.",
};

const SYSTEM = `You are the social media manager for Y2KASE, a Gen-Z kawaii / Y2K phone accessories brand. Voice: cute, trendy, playful, confident, emoji-friendly but never spammy. You write copy that converts while staying authentic. Return STRICT JSON: { "caption": string, "hashtags": string[] } where hashtags have NO leading '#' and are lowercase.`;

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
}): Promise<GeneratedCaption> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";

  const ctx = [
    `Product: ${opts.productTitle} (${opts.productType.replace(/_/g, " ")}).`,
    opts.description ? `Details: ${opts.description.slice(0, 300)}` : "",
    opts.tags?.length ? `Tags: ${opts.tags.slice(0, 8).join(", ")}` : "",
    opts.extra ? `Theme: ${opts.extra}` : "",
    PLATFORM_BRIEF[opts.platform],
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
  const parsed = JSON.parse(raw) as Partial<GeneratedCaption>;

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  return {
    caption: (parsed.caption ?? "").trim(),
    hashtags,
  };
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

const VARIATIONS_SYSTEM = `You are a Pinterest SEO strategist for Y2KASE, a Gen-Z kawaii / Y2K phone accessories brand (phone cases, charms, grips). Pinterest is a visual SEARCH engine: a single product is posted as many pins, so EACH pin must target a DIFFERENT search angle to maximise discovery and avoid duplicate-looking pins. Voice: cute, trendy, authentic, emoji-friendly but never spammy.

Return STRICT JSON: { "variations": [ { "title": string, "caption": string, "hashtags": string[] } ] }.

Rules:
- Produce EXACTLY the requested number of variations, each MEANINGFULLY DISTINCT from the others (different lead keyword, angle and phrasing — not reworded duplicates).
- Spread across angles such as: aesthetic/vibe, gift idea/occasion, device compatibility, protection/quality, character/fandom, styling, seasonal/trend.
- "title": a real Pinterest search phrase, <= 90 chars, keyword-rich, includes the product; vary the LEADING keyword per variation and avoid identical suffixes.
- "caption": 1-2 helpful, search-optimised sentences a shopper would actually type; not salesy.
- "hashtags": 3-6 lowercase tags, NO leading '#'.`;

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
