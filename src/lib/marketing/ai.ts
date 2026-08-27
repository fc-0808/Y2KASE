import "server-only";
import OpenAI from "openai";
import {
  type CampaignType,
  type MarketingDraft,
  type MarketingProductOption,
} from "./types";
import { applyVerifiedOfferEmphasis } from "./emphasis";
import {
  BUNDLE_MARKETING,
  bundleMechanicsCoverage,
  bundleOfferPromptContext,
  isBuyTwoGetTwoCampaign,
  knownCouponPromptContext,
} from "./offer";
import {
  subjectCandidateIsProfessional,
} from "./copy-quality";
import {
  marketingPreflight,
  marketingSendBlockers,
  validateMarketingDraft,
} from "./template";

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

const SYSTEM_PROMPT = `You are Y2KASE's senior lifecycle copywriter and conversion editor. Y2KASE sells kawaii, Y2K, and holographic phone cases, grips, and charms to opted-in subscribers.

Write polished DTC email copy: stylish, concise, specific, warm, and easy to scan on a phone. It may feel playful, but never childish, vague, desperate, or spammy.

Truth hierarchy (never violate it):
1. AUTHORITATIVE OFFER FACTS supplied in the user message.
2. Verified product facts and listed price.
3. Operator brief.
If details conflict, use the higher source. Never invent or infer a discount, code, deadline, stock level, popularity claim, product benefit, shipping promise, exclusivity, or urgency.

Conversion standards:
- One email, one value proposition, one primary CTA.
- Lead with the concrete customer benefit or news. No greeting or throat-clearing.
- Explain how an offer works before lifestyle language.
- Translate mechanics into natural shopper language. Never say "eligible units".
- Give one useful emotional reason to act: mix-and-match freedom, a coordinated set, or finding a style that feels personal. Do not manufacture pressure.
- CTA describes the next step. Prefer "Build your bundle", "Choose your cases", or "Explore the drop"; never "Click here", "Learn more", or "Shop now".
- Subject: one clear idea, usually 30–55 characters, maximum 60. Avoid all caps, repeated punctuation, fake RE:/FWD:, and excessive "FREE" language.
- Subject alternatives must use genuinely different angles: one benefit-led and one curiosity/mechanic-led—not minor word swaps.
- Preview text: 45–100 characters and adds missing information; never paraphrase the subject.
- Eyebrow: 2–5 words. Use the exact offer label when one exists; never use "Announcement".
- Heading: natural, benefit-led, and ideally 3–9 words. Do not merely repeat the eyebrow or subject.
- Body: 2–3 short paragraphs, roughly 55–110 words total. Each paragraph should be 1–2 sentences.
- State "no code" or timing only when supplied as verified fact.
- Emphasis: use **double asterisks** around one high-value phrase in the body. Optionally use one different short benefit phrase in the heading. Never emphasise whole paragraphs.
- Plain text only except **emphasis**. No HTML, links, bullets, hashtags, or other Markdown.
- Maximum two emojis across all returned fields; zero is acceptable.

Avoid tired copy:
"a little treat", "just for the group chat", "unlock a little extra", "main-character moment", "this is your sign", "run don't walk", "must-have", "you'll be obsessed", "stack up on", and generic filler such as "shop and build your set your way".

Before returning, silently edit for factual accuracy, repetition, mobile scannability, and natural English. The operator will still review every field before sending.

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
  const seen = new Set([primary.trim().toLowerCase()]);
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(subjectCandidateIsProfessional)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

const REVISION_WARNING_CODES = new Set([
  "long-subject",
  "preview-length",
  "short-body",
  "long-body",
  "long-cta",
  "subject-preview-overlap",
  "heading-eyebrow-overlap",
  "generic-cta",
  "tired-copy",
  "placeholder-copy",
  "paragraph-structure",
  "body-link",
  "emoji-density",
  "bundle-mechanics",
]);

function parseGeneratedJson(raw: string | null | undefined) {
  if (!raw) throw new Error("The AI returned an empty response.");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("The AI returned malformed JSON.");
  }
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
  const bundleOffer = isBuyTwoGetTwoCampaign({
    offer: input.offer,
    brief: input.brief,
    draft: input.currentDraft,
  });
  if (bundleOffer && input.promoCode.trim()) {
    throw new Error(
      "Buy 2, Get 2 Free is automatic and cannot be combined with a promo code.",
    );
  }
  const productContext = input.product
    ? [
        `Product: ${input.product.title}`,
        `Store URL: https://y2kase.com/products/${input.product.slug}`,
        `Listed price: ${input.product.price} ${input.product.currency}`,
      ].join("\n")
    : "Product: no single product selected";
  const couponFacts = knownCouponPromptContext(input.promoCode);
  const authoritativeOffer = bundleOffer
    ? bundleOfferPromptContext()
    : couponFacts ??
      (input.offer.trim()
        ? `Operator-verified offer: ${input.offer.trim()}`
        : "No verified offer. Do not mention a discount, code, or deadline.");
  const baseBrief = [
    "AUTHORITATIVE OFFER FACTS:",
    authoritativeOffer,
    "",
    "CAMPAIGN CONTEXT:",
    `Campaign type: ${input.campaignType}`,
    `Tone: ${input.tone}`,
    productContext,
    `Operator goal and facts: ${input.brief || "No additional brief."}`,
    `Operator offer wording: ${input.offer || "None."}`,
    `Verified promo code: ${input.promoCode || "None."}`,
    "",
    bundleOffer
      ? "This is a multi-product bundle. Direct the CTA to the full collection and make the four-item mechanic unmistakable."
      : "",
    "Return the final edited JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  async function requestDraft(revisionIssues: string[] = []) {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            revisionIssues.length === 0
              ? baseBrief
              : [
                  baseBrief,
                  "",
                  "QUALITY REVISION REQUIRED:",
                  ...revisionIssues.map((issue) => `- ${issue}`),
                  "Rewrite the full draft, fixing every issue. Return JSON only.",
                ].join("\n"),
        },
      ],
    });
    return parseGeneratedJson(response.choices[0]?.message?.content);
  }

  function validatedCandidate(
    parsed: Record<string, unknown>,
  ): MarketingDraft {
    const emphasised = applyVerifiedOfferEmphasis(
      {
        heading: typeof parsed.heading === "string" ? parsed.heading : "",
        body: typeof parsed.body === "string" ? parsed.body : "",
      },
      bundleOffer ? BUNDLE_MARKETING.name : input.offer,
      input.promoCode,
    );
    const candidate = {
      ...input.currentDraft,
      campaignType: input.campaignType,
      name: parsed.name,
      subject: parsed.subject,
      previewText: parsed.previewText,
      eyebrow: parsed.eyebrow,
      heading: emphasised.heading,
      body: emphasised.body,
      ctaLabel: parsed.ctaLabel,
      ctaUrl: bundleOffer
        ? BUNDLE_MARKETING.collectionUrl
        : input.product
          ? `https://y2kase.com/products/${input.product.slug}`
          : input.currentDraft.ctaUrl,
      // Copy generation must never overwrite artwork that already completed
      // the separate product-safe image review workflow.
      heroImageUrl: input.currentDraft.heroImageUrl,
      heroImageAlt: input.currentDraft.heroImageAlt,
      promoCode: bundleOffer ? "" : input.promoCode,
    };
    const validated = validateMarketingDraft(candidate);
    if (!validated.ok) {
      throw new Error(`The generated draft was invalid: ${validated.errors[0]}`);
    }
    return validated.value;
  }

  let parsed = await requestDraft();
  let draft = validatedCandidate(parsed);
  const firstPassWarnings = marketingPreflight(draft)
    .filter((warning) => REVISION_WARNING_CODES.has(warning.code))
    .map((warning) => warning.message);
  if (bundleOffer) {
    const coverage = bundleMechanicsCoverage(
      `${draft.previewText} ${draft.body}`,
    );
    if (
      !coverage.itemCount ||
      !coverage.freeCount ||
      !coverage.automatic ||
      !coverage.repeating ||
      !coverage.nonStacking
    ) {
      firstPassWarnings.push(
        `State all canonical ${BUNDLE_MARKETING.name} mechanics exactly: add any 4 cases, grips, or charms; the 2 lowest-priced items are free; it applies automatically with no code; every group of 4 receives 2 free; coupon codes cannot be combined.`,
      );
    }
  }
  if (firstPassWarnings.length > 0) {
    parsed = await requestDraft([...new Set(firstPassWarnings)]);
    draft = validatedCandidate(parsed);
  }
  const remainingBlocker = marketingSendBlockers(draft)[0];
  if (remainingBlocker) {
    throw new Error(
      `The AI draft did not meet the campaign accuracy bar: ${remainingBlocker.message}`,
    );
  }

  return {
    draft,
    subjectAlternatives: cleanAlternatives(
      parsed.subjectAlternatives,
      draft.subject,
    ),
  };
}
