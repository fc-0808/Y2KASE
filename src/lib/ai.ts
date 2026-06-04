import OpenAI from "openai";
import { STYLES, type Style } from "@/lib/pricing";

export type GeneratedProductCopy = {
  title: string;
  description: string;
  tags: string[];
  category: string;
  suggestedPriceUsd: number;
  altText: string;
  materials: string;
};

const SYSTEM_PROMPT = `You are a senior e-commerce copywriter for Y2KASE, a Gen-Z / Kawaii / Y2K aesthetic phone case brand.
You write playful but conversion-focused product copy. Voice: cute, trendy, a little maximalist, emoji-friendly but not spammy.
Given product photos, infer the product and return STRICT JSON matching this TypeScript type:
{
  "title": string,        // <= 140 chars, includes "iPhone 17 16 15 14 13 Pro Max" coverage when it is a phone case
  "description": string,  // 80-160 words, 1-2 short paragraphs, may include a few tasteful emojis
  "tags": string[],       // 8-14 lowercase snake_case search tags, no '#'
  "category": string,     // e.g. "phone_case", "phone_charm", "accessory", "airpod_case", "watch_band"
  "suggestedPriceUsd": number, // realistic USD retail price for this item
  "altText": string,      // <= 120 chars, plain accessibility description of the main image
  "materials": string     // e.g. "soft TPU", "hard polycarbonate", "silicone" — infer from photo if possible
}
Return ONLY the JSON object, no markdown fences.`;

/**
 * Generate SEO product copy from image URLs or base64 data URLs.
 *
 * @param images  Array of https:// URLs or data:image/...;base64,... strings.
 *                Up to 4 are sent to the model (first 4 used).
 * @param context Optional free-text hint, e.g. the folder category name ("Miffy", "Sanrio").
 *                Helps the model write more accurate copy for known characters/brands.
 */
export async function generateProductCopy(
  images: string[],
  context?: string,
): Promise<GeneratedProductCopy> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";

  const contextLine = context
    ? `Product category hint: "${context}". Use this to write more specific copy.\n`
    : "";

  const response = await client.chat.completions.create({
    model,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<GeneratedProductCopy>;

  return {
    title: (parsed.title ?? "Untitled Y2KASE Product").trim(),
    description: (parsed.description ?? "").trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => t.toLowerCase()) : [],
    category: parsed.category ?? "phone_case",
    suggestedPriceUsd:
      typeof parsed.suggestedPriceUsd === "number" ? parsed.suggestedPriceUsd : 19.99,
    altText: (parsed.altText ?? parsed.title ?? "Y2KASE product").trim(),
    materials: (parsed.materials ?? "").trim(),
  };
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
  const validStyles = new Set<string>(STYLES);

  const result: ImageStyleClassification = {};

  // Batch to stay within vision limits and cost.
  const BATCH = 6;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const fileList = batch.map((b) => b.filename).join(", ");

    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
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
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    for (const item of batch) {
      const rawTags = parsed[item.filename];
      const tags = Array.isArray(rawTags)
        ? rawTags
            .filter((t): t is string => typeof t === "string")
            .filter((t) => validStyles.has(t)) as Style[]
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
