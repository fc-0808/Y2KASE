import "server-only";
import OpenAI from "openai";
import {
  MARKETING_LIMITS,
  type CampaignType,
  type MarketingDraft,
  type MarketingProductOption,
} from "./types";
import { validateMarketingDraft } from "./template";

export type MarketingTone = "playful" | "polished" | "warm" | "energetic";

export type GenerateMarketingDraftInput = {
  campaignType: CampaignType;
  brief: string;
  offer: string;
  tone: MarketingTone;
  promoCode: string;
  product: MarketingProductOption | null;
  currentDraft: MarketingDraft;
};

export type GeneratedMarketingDraft = {
  draft: MarketingDraft;
  subjectAlternatives: string[];
};

const SYSTEM_PROMPT = `You are the senior lifecycle copywriter for Y2KASE, a Gen-Z kawaii and Y2K phone-accessories brand.

Write concise, specific email copy that sounds playful and confident without sounding spammy. Protect customer trust:
- Never invent a discount, promo code, deadline, stock level, product claim, or shipping promise.
- Never use fake urgency, manipulative guilt, all-caps sentences, or more than two emojis in any field.
- One email has one goal and one primary call to action.
- Body is plain text only, 2-4 short paragraphs separated by blank lines. No Markdown, HTML, bullet characters, or links.
- Subject is clear and under 60 characters when practical.
- Preview text complements the subject instead of repeating it.
- The operator will review and edit everything before any send.

Return strict JSON with exactly these keys:
{
  "name": string,
  "subject": string,
  "subjectAlternatives": string[2],
  "previewText": string,
  "eyebrow": string,
  "heading": string,
  "body": string,
  "ctaLabel": string
}`;

export function isMarketingAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function cleanAlternatives(value: unknown, primary: string): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, MARKETING_LIMITS.subject))
    .filter((item) => item && item !== primary)
    .slice(0, 2);
}

export async function generateMarketingCopy(
  input: GenerateMarketingDraftInput,
): Promise<GeneratedMarketingDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({
    apiKey,
    timeout: 30_000,
    maxRetries: 2,
  });
  const model = process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";
  const productContext = input.product
    ? [
        `Product: ${input.product.title}`,
        `Store URL: https://y2kase.com/products/${input.product.slug}`,
        `Listed price: ${input.product.price} ${input.product.currency}`,
      ].join("\n")
    : "Product: no single product selected";

  const response = await client.chat.completions.create({
    model,
    temperature: 0.75,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `Campaign type: ${input.campaignType}`,
          `Tone: ${input.tone}`,
          productContext,
          `Operator brief: ${input.brief || "No additional brief."}`,
          `Verified offer details: ${input.offer || "No offer. Do not invent one."}`,
          `Verified promo code: ${input.promoCode || "None. Do not mention a code."}`,
          "",
          "Draft the campaign. Return JSON only.",
        ].join("\n"),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("The AI returned an empty response.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("The AI returned malformed JSON.");
  }

  const candidate = {
    ...input.currentDraft,
    campaignType: input.campaignType,
    name: parsed.name,
    subject: parsed.subject,
    previewText: parsed.previewText,
    eyebrow: parsed.eyebrow,
    heading: parsed.heading,
    body: parsed.body,
    ctaLabel: parsed.ctaLabel,
    ctaUrl: input.product
      ? `https://y2kase.com/products/${input.product.slug}`
      : input.currentDraft.ctaUrl,
    heroImageUrl: input.product?.imageUrl ?? input.currentDraft.heroImageUrl,
    heroImageAlt: input.product
      ? `${input.product.title} from Y2KASE`
      : input.currentDraft.heroImageAlt,
    promoCode: input.promoCode,
  };
  const validated = validateMarketingDraft(candidate);
  if (!validated.ok) {
    throw new Error(`The generated draft was invalid: ${validated.errors[0]}`);
  }

  return {
    draft: validated.value,
    subjectAlternatives: cleanAlternatives(
      parsed.subjectAlternatives,
      validated.value.subject,
    ),
  };
}

