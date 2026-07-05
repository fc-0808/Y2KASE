import OpenAI from "openai";
import { STYLES, type Style } from "@/lib/pricing";

/**
 * Build the OpenAI-compatible client used for vision calls.
 * Prefers VISION_BASE_URL / VISION_API_KEY (e.g. OpenRouter) and falls back to
 * the standard OpenAI credentials so existing setups keep working.
 */
function visionClient(): { client: OpenAI; model: string } {
  const apiKey = process.env.VISION_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("VISION_API_KEY (or OPENAI_API_KEY) is not set.");

  const baseURL = process.env.VISION_BASE_URL || undefined;
  const client = new OpenAI({ apiKey, baseURL });
  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
  return { client, model };
}

/**
 * Tolerant JSON-object parse for LLM output. Strips ```json fences and any
 * prose around the object, then parses the outermost `{ … }` block. Returns
 * null when nothing parseable is found, so callers can degrade gracefully —
 * essential when running non-OpenAI models (e.g. Qwen via OpenRouter) that may
 * not honour `response_format` and can wrap JSON in markdown.
 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type VisionMessages = Parameters<
  OpenAI["chat"]["completions"]["create"]
>[0]["messages"];

/**
 * Run a vision chat completion that should return JSON. Requests structured
 * output via `response_format`, but transparently retries once *without* it if
 * the provider/model rejects that parameter — some OpenRouter-hosted models do.
 * Returns the raw message content for tolerant parsing by the caller.
 */
async function visionJsonCompletion(
  client: OpenAI,
  model: string,
  messages: VisionMessages,
  temperature: number,
): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages,
    });
    return res.choices[0]?.message?.content ?? "";
  } catch {
    const res = await client.chat.completions.create({
      model,
      temperature,
      messages,
    });
    return res.choices[0]?.message?.content ?? "";
  }
}

export type GeneratedProductCopy = {
  title: string;
  description: string;
  tags: string[];
  category: string;
  suggestedPriceUsd: number;
  altText: string;
  materials: string;
  /** True when the photos show a MagSafe case (magnetic ring / explicit MagSafe). */
  magsafe: boolean;
  /** How sure the model is about `magsafe` ("none" when not MagSafe). */
  magsafeConfidence: "high" | "low" | "none";
};

/**
 * A hint about the product type the copy is for. When omitted, the model is
 * asked to identify the product itself (used by AI auto-classification).
 */
export type CopyTypeHint = {
  id: string;
  /** Human label, e.g. "AirPods Case". */
  label: string;
  /** Short noun, e.g. "Case" / "Band". */
  noun: string;
  /** Phone cases get iPhone-model coverage in the title; nothing else does. */
  isPhoneCase: boolean;
};

/** Valid `category` values the model may return (maps to our product types). */
const CATEGORY_ENUM =
  '"iphone_case", "samsung_case", "pixel_case", "airpod_case", "ipad_case", "macbook_case", "kindle_case", "watch_band", "accessory"';

/**
 * Build the system prompt, adapting the title rule to the product type so we
 * never stamp "iPhone 17 16 15…" onto an AirPods or Kindle case. With no hint
 * the model is told to identify the product from the photos.
 */
function buildSystemPrompt(hint?: CopyTypeHint): string {
  const productLine = hint
    ? `This product is a ${hint.label}.`
    : `First identify what the product is from the photos (phone case, AirPods case, Kindle case, watch band, accessory, …).`;

  const titleRule = !hint
    ? "<= 140 chars, a natural title for whatever product the photos show"
    : hint.isPhoneCase
      ? '<= 140 chars, include "iPhone 17 16 15 14 13 Pro Max" model coverage'
      : `<= 140 chars, a natural title for this ${hint.label} — do NOT mention iPhone models`;

  return `You are a senior e-commerce copywriter for Y2KASE, a Gen-Z / Kawaii / Y2K aesthetic tech-accessory brand.
You write playful but conversion-focused product copy. Voice: cute, trendy, a little maximalist, emoji-friendly but not spammy.
${productLine}

MagSafe detection (IMPORTANT): A case is MagSafe when the photos show a circular magnetic ring on the back, a MagSafe accessory snapping on magnetically, or the listing/packaging says "MagSafe". If — and ONLY if — it is MagSafe:
  • set "magsafe": true and "magsafeConfidence" to "high" (ring/label clearly visible) or "low" (inferred, not clearly visible),
  • include the word "MagSafe" in the title, and
  • mention MagSafe compatibility in the description.
If it is NOT MagSafe, set "magsafe": false, "magsafeConfidence": "none", and do NOT mention MagSafe anywhere.

Return STRICT JSON matching this TypeScript type:
{
  "title": string,        // ${titleRule}
  "description": string,  // 80-160 words, 1-2 short paragraphs, may include a few tasteful emojis
  "tags": string[],       // 8-14 lowercase snake_case search tags, no '#' (include the character/brand, and "magsafe" when applicable)
  "category": string,     // EXACTLY one of: ${CATEGORY_ENUM}
  "magsafe": boolean,     // true ONLY if this is a MagSafe case (see rule above)
  "magsafeConfidence": string, // "high" | "low" | "none"
  "suggestedPriceUsd": number, // realistic USD retail price for this item
  "altText": string,      // <= 120 chars, plain accessibility description of the main image
  "materials": string     // e.g. "soft TPU", "hard polycarbonate", "silicone" — infer from photo if possible
}
Return ONLY the JSON object, no markdown fences.`;
}

/**
 * Generate SEO product copy from image URLs or base64 data URLs.
 *
 * @param images  Array of https:// URLs or data:image/...;base64,... strings.
 *                Up to 4 are sent to the model (first 4 used).
 * @param context Optional free-text hint, e.g. the folder category name ("Miffy", "Sanrio").
 *                Helps the model write more accurate copy for known characters/brands.
 * @param hint    Optional product-type hint. Omit to let the model classify the
 *                product itself (its returned `category` drives auto-typing).
 */
export async function generateProductCopy(
  images: string[],
  context?: string,
  hint?: CopyTypeHint,
): Promise<GeneratedProductCopy> {
  const { client, model } = visionClient();

  const contextLine = context
    ? `Product category hint: "${context}". Use this to write more specific copy.\n`
    : "";

  const raw = await visionJsonCompletion(
    client,
    model,
    [
      { role: "system", content: buildSystemPrompt(hint) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${contextLine}Analyze these product photos and write the listing copy as strict JSON.`,
          },
          ...images.slice(0, 4).map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "low" as const },
          })),
        ],
      },
    ],
    0.7,
  );

  const obj = parseJsonObject(raw);
  if (!obj) {
    throw new Error(
      `Vision model (${model}) returned unparseable copy — check the model is vision-capable and the API key/credits are valid.`,
    );
  }
  const parsed = obj as Partial<GeneratedProductCopy>;

  return {
    title: (parsed.title ?? "Untitled Y2KASE Product").trim(),
    description: (parsed.description ?? "").trim(),
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => t.toLowerCase())
      : [],
    category: parsed.category ?? "phone_case",
    magsafe: parsed.magsafe === true,
    magsafeConfidence:
      parsed.magsafe === true
        ? parsed.magsafeConfidence === "high"
          ? "high"
          : "low"
        : "none",
    suggestedPriceUsd:
      typeof parsed.suggestedPriceUsd === "number"
        ? parsed.suggestedPriceUsd
        : 19.99,
    altText: (parsed.altText ?? parsed.title ?? "Y2KASE product").trim(),
    materials: (parsed.materials ?? "").trim(),
  };
}

const MAGSAFE_PROMPT = `You inspect phone-case product photos and decide if this is a MagSafe case.
A case is MagSafe when the photos clearly show a circular magnetic ring on the back of the case, a MagSafe accessory snapping on magnetically, or the case/packaging is labelled "MagSafe". A plain case with no visible magnetic ring is NOT MagSafe.
Also report your confidence:
  • "high" — a magnetic ring or "MagSafe" label is clearly visible.
  • "low"  — it might be MagSafe but you're inferring, the ring isn't clearly visible.
Return STRICT JSON: { "magsafe": boolean, "confidence": "high" | "low" }. No markdown, no other keys.`;

export type MagSafeVerdict = { magsafe: boolean; confidence: "high" | "low" };

/**
 * Focused, cheap MagSafe-only classification of an existing product's photos —
 * used by the backfill to re-classify the catalogue without regenerating copy.
 * Returns a not-MagSafe verdict on any error so a hiccup never mislabels a product.
 */
export async function detectMagSafe(
  imageUrls: string[],
): Promise<MagSafeVerdict> {
  if (imageUrls.length === 0) return { magsafe: false, confidence: "low" };
  try {
    const { client, model } = visionClient();
    const raw = await visionJsonCompletion(
      client,
      model,
      [
        { role: "system", content: MAGSAFE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Is this a MagSafe case? Return JSON." },
            ...imageUrls.slice(0, 3).map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: "low" as const },
            })),
          ],
        },
      ],
      0,
    );
    const obj = parseJsonObject(raw);
    return {
      magsafe: obj?.magsafe === true,
      confidence: obj?.confidence === "high" ? "high" : "low",
    };
  } catch {
    return { magsafe: false, confidence: "low" };
  }
}

const STYLE_CLASSIFY_PROMPT = `You classify product photos for a phone-case store.
For EACH image (identified by filename key), list which product configuration(s) are clearly visible.

Valid style values (use EXACT strings):
- "Case + Grip + Charm"
- "Case + Grip"
- "Case + Charm"
- "Case Only"
- "Grip Only"
- "Charm Only"

Rules:
- An image may match MULTIPLE styles if it shows that bundle (e.g. case+grip+charm visible → include all three relevant bundles).
- If the image shows only the phone case with no grip or charm → ["Case Only"].
- If only a pop grip / stand → ["Grip Only"].
- If only charms/accessories → ["Charm Only"].
- If unsure, include the closest match(es); prefer being inclusive over empty.

Return STRICT JSON: { "filename_without_ext": ["Style1", "Style2"], ... }
Keys must match the filename labels provided. No markdown.`;

export type ImageStyleClassification = Record<string, Style[]>;

/**
 * Classify which Style option(s) each product photo depicts.
 * @param items  filename (no ext) + image as base64 data URL or https URL
 */
export async function classifyImageStyles(
  items: { filename: string; imageUrl: string }[],
): Promise<ImageStyleClassification> {
  if (items.length === 0) return {};

  const { client, model } = visionClient();
  const validStyles = new Set<string>(STYLES);

  const result: ImageStyleClassification = {};

  // Batch to stay within vision limits and cost.
  const BATCH = 6;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const fileList = batch.map((b) => b.filename).join(", ");

    // Style tags are a nice-to-have, not essential — a failed batch (network or
    // unparseable output) just leaves those images untagged rather than failing
    // the whole product.
    let parsed: Record<string, unknown> = {};
    try {
      const raw = await visionJsonCompletion(
        client,
        model,
        [
          { role: "system", content: STYLE_CLASSIFY_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Classify these images. Filenames: ${fileList}. Return JSON keyed by each filename.`,
              },
              ...batch.map((item) => ({
                type: "image_url" as const,
                image_url: { url: item.imageUrl, detail: "low" as const },
              })),
            ],
          },
        ],
        0.2,
      );
      parsed = parseJsonObject(raw) ?? {};
    } catch {
      parsed = {};
    }

    for (const item of batch) {
      const rawTags = parsed[item.filename];
      const tags = Array.isArray(rawTags)
        ? (rawTags
            .filter((t): t is string => typeof t === "string")
            .filter((t) => validStyles.has(t)) as Style[])
        : [];
      result[item.filename] = tags;
    }
  }

  return result;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
