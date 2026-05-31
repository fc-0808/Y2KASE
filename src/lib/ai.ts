import OpenAI from "openai";

export type GeneratedProductCopy = {
  title: string;
  description: string;
  tags: string[];
  category: string;
  suggestedPriceUsd: number;
  altText: string;
};

const SYSTEM_PROMPT = `You are a senior e-commerce copywriter for Y2KASE, a Gen-Z / Kawaii / Y2K aesthetic phone case brand.
You write playful but conversion-focused product copy. Voice: cute, trendy, a little maximalist, emoji-friendly but not spammy.
Given product photos, infer the product and return STRICT JSON matching this TypeScript type:
{
  "title": string,        // <= 140 chars, includes "iPhone 17 16 15 14 13 Pro Max" coverage when it is a phone case
  "description": string,  // 80-160 words, 1-2 short paragraphs, may include a few tasteful emojis
  "tags": string[],       // 8-14 lowercase snake_case search tags, no '#'
  "category": string,     // e.g. "phone_case", "phone_charm", "accessory"
  "suggestedPriceUsd": number, // realistic USD retail price for this item
  "altText": string       // <= 120 chars, plain accessibility description of the main image
}
Return ONLY the JSON object, no markdown fences.`;

export async function generateProductCopy(
  imageUrls: string[],
): Promise<GeneratedProductCopy> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";

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
            text: "Analyze these product photos and write the listing copy as strict JSON.",
          },
          ...imageUrls.slice(0, 4).map((url) => ({
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
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
