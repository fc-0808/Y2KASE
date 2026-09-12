import OpenAI from "openai";
import { normalizeImageStyleTags, type Style } from "@/lib/pricing";
import {
  coerceProductCopy,
  describeViolations,
  findForbiddenScript,
  InvalidProductCopyError,
  toEnglishContextHint,
  type CopyViolation,
  type GeneratedProductCopy,
} from "@/lib/catalog/copy-schema";
import {
  classifyBrandContext,
  listBrandOptions,
  resolveBrandAssignment,
  EMPTY_BRAND_CLASSIFICATION,
  type BrandClassification,
  type BrandConfidence,
} from "@/lib/catalog/brands";
import {
  coerceMagSafeEvidence,
  type MagSafeVerdict,
} from "@/lib/catalog/magsafe";
import { inferProductTypeId } from "@/lib/catalog/product-types";
import {
  coerceRejectReason,
  emptyVerdict,
  type IncomingFolderVerdict,
} from "@/lib/catalog/folder-sort";
import {
  disabledThinkingParams,
  isThinkingParamRejected,
} from "@/lib/llm-thinking";

export type { GeneratedProductCopy } from "@/lib/catalog/copy-schema";
export type { MagSafeVerdict } from "@/lib/catalog/magsafe";
export type { BrandClassification } from "@/lib/catalog/brands";
export type { IncomingFolderVerdict } from "@/lib/catalog/folder-sort";

/**
 * Two model roles, deliberately kept on different providers.
 *
 * ── Image analysis (`visionClient`) ─────────────────────────────────────────
 * Classification work whose output is an enum, a score or a boolean: MagSafe
 * verification, per-image Style tags, thumbnail suitability. Nothing here
 * becomes customer-visible prose, so it runs on a cheap open-weight vision
 * model through an OpenAI-compatible gateway (OpenRouter). Default in
 * Default vision model is Qwen 3.8 Flash — the production successor to 3.7 Plus
 * for high-volume visual classification.
 *
 * ── Product copy (`copyClient`) ────────────────────────────────────────────
 * Titles, descriptions, tags, alt text — everything a shopper reads. This runs
 * on OpenAI directly, for two reasons:
 *
 *   1. Language. The source photos carry Chinese supplier text, and a
 *      Chinese-trained model's strongest prior is to answer in the language it
 *      sees; that is what put Chinese titles on the storefront. An OpenAI model
 *      holds the English-only instruction far more reliably. `copy-schema.ts`
 *      still validates the result — the guard is the contract, not the vendor.
 *   2. Determinism. The gateway load-balances one model id across providers
 *      with different quantisations, so identical requests disagree (see
 *      MAGSAFE_VOTES). Calling OpenAI directly removes that variable from the
 *      copy path, where a retry costs a whole regeneration.
 *
 * Both fall back to `OPENAI_API_KEY` so a single-key setup still works.
 */
function visionClient(): { client: OpenAI; model: string } {
  const apiKey = process.env.VISION_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("VISION_API_KEY (or OPENAI_API_KEY) is not set.");

  const baseURL = process.env.VISION_BASE_URL || undefined;
  const client = new OpenAI({ apiKey, baseURL });
  return { client, model: visionModelName() };
}

/**
 * Client for product copy. Talks to OpenAI directly — no `VISION_BASE_URL` —
 * unless `COPY_BASE_URL` explicitly routes it elsewhere. The model still
 * receives the product photos; it is a vision-capable text model, not a
 * second-hand description of them.
 */
function copyClient(): { client: OpenAI; model: string } {
  const apiKey = process.env.COPY_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error(
      "OPENAI_API_KEY (or COPY_API_KEY) is not set — product copy runs on OpenAI directly.",
    );

  const baseURL = process.env.COPY_BASE_URL || undefined;
  const client = new OpenAI({ apiKey, baseURL });
  return { client, model: copyModelName() };
}

/** The image-analysis model id in use. */
export function visionModelName(): string {
  return process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
}

/** The copy model id in use, for stamping onto ingested rows. */
export function copyModelName(): string {
  return process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";
}

/**
 * Tolerant JSON-object parse for LLM output. Tries a direct parse, then strips
 * ```json fences, then falls back to the outermost `{ … }` block. Returns null
 * when nothing parseable is found, so callers can degrade gracefully —
 * essential when running non-OpenAI models (e.g. Qwen via OpenRouter) that may
 * not honour `response_format` and can wrap JSON in markdown or prose.
 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const s = raw.trim();

  const candidates: string[] = [s];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(s.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const v = JSON.parse(candidate);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

type VisionMessages = Parameters<
  OpenAI["chat"]["completions"]["create"]
>[0]["messages"];

const MAX_COMPLETION_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(err: unknown): number | undefined {
  return err instanceof OpenAI.APIError ? err.status : undefined;
}

/**
 * True when the provider rejected `response_format` itself rather than the
 * request. Some OpenRouter-hosted models don't implement JSON mode; we detect
 * that specifically instead of blanket-retrying, so a bad key or an exhausted
 * quota surfaces as itself rather than as a confusing second failure.
 */
function isRejectedParam(err: unknown, param: string): boolean {
  const status = statusOf(err);
  if (status !== undefined && status !== 400 && status !== 404 && status !== 422) {
    return false;
  }
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!message.includes(param)) return false;
  return (
    message.includes("unsupported") ||
    message.includes("not supported") ||
    message.includes("does not support") ||
    message.includes("unrecognized") ||
    message.includes("invalid")
  );
}

function isUnsupportedJsonMode(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== undefined && status !== 400 && status !== 404 && status !== 422) {
    return false;
  }
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes("response_format") ||
    message.includes("json_object") ||
    message.includes("json mode") ||
    (message.includes("json") && message.includes("support"))
  );
}

/** Rate limits, timeouts and upstream hiccups — worth a backed-off retry. */
function isTransient(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true;
  const status = statusOf(err);
  if (status === undefined) return false;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/**
 * Run a vision chat completion that should return JSON.
 *
 * Requests structured output via `response_format`, drops that parameter once
 * if the provider rejects it, and retries transient failures with exponential
 * backoff — a bulk catalogue run makes hundreds of calls at concurrency and
 * will meet 429s. Returns the raw message content for tolerant parsing.
 */
async function visionJsonCompletion(
  client: OpenAI,
  model: string,
  messages: VisionMessages,
  temperature: number,
): Promise<string> {
  let jsonMode = true;
  let sendTemperature = true;
  const thinkingParams = disabledThinkingParams(model, client.baseURL);
  let sendThinkingOff = Object.keys(thinkingParams).length > 0;
  let droppedJsonMode = false;
  let droppedTemperature = false;
  let droppedThinkingOff = false;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_COMPLETION_ATTEMPTS; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages,
        ...(sendTemperature ? { temperature } : {}),
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        ...(sendThinkingOff ? thinkingParams : {}),
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
      const content = res.choices[0]?.message?.content ?? "";
      if (content.trim()) return content;
      // An empty completion is a provider hiccup, not an answer — retry it.
      lastError = new Error(`Model ${model} returned an empty response.`);
    } catch (err) {
      lastError = err;
      if (jsonMode && !droppedJsonMode && isUnsupportedJsonMode(err)) {
        jsonMode = false;
        droppedJsonMode = true;
        continue;
      }
      // Newer OpenAI models accept only the default temperature. Drop the
      // parameter rather than failing the whole product over a sampling knob.
      if (sendTemperature && !droppedTemperature && isRejectedParam(err, "temperature")) {
        sendTemperature = false;
        droppedTemperature = true;
        continue;
      }
      // Qwen 3.8 thinking controls are OpenRouter/DashScope extensions. A
      // provider that 400s on them must still classify — just slower.
      if (
        sendThinkingOff &&
        !droppedThinkingOff &&
        isThinkingParamRejected(err)
      ) {
        sendThinkingOff = false;
        droppedThinkingOff = true;
        continue;
      }
      if (!isTransient(err)) throw err;
    }

    if (attempt < MAX_COMPLETION_ATTEMPTS - 1) {
      await sleep(
        Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt) +
          Math.random() * 250,
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Completion call to ${model} failed.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared prompt fragments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The English-only contract, repeated at the top of every prompt that produces
 * human-readable text.
 *
 * This is load-bearing, not boilerplate. Our source photography comes from
 * overseas supplier listings with Chinese text burnt into the images, and the
 * configured vision model is Chinese-trained (Qwen 3.8 by default), so its
 * strongest prior is to answer in the language it sees. Without an explicit,
 * up-front constraint it reliably transcribes the supplier's Chinese listing
 * title straight into our storefront. `copy-schema.ts` validates the result.
 */
const ENGLISH_ONLY = `OUTPUT LANGUAGE — ABSOLUTE REQUIREMENT
Write every character of your answer in English, using only the Latin alphabet,
digits and standard punctuation (emoji are allowed where a field says so).

The photos come from overseas suppliers and very often show Chinese, Japanese or
Korean text — on the packaging, printed on the product, or as a graphic overlay
with the supplier's own listing title. Treat all of that text as REFERENCE ONLY:
never copy it, never transliterate it, and never leave it in your output.
When a character or brand is named in another language, use the official English
name it is sold under in the West (Hello Kitty, My Melody, Kuromi, Cinnamoroll,
Pompompurin, Badtz-Maru, Keroppi, Miffy, Rilakkuma, Sumikko Gurashi, Crayon
Shin-chan, Sanrio). If you cannot express something in English, leave it out.

Any non-English character causes the response to be rejected and regenerated.`;

/** Valid `category` values the model may return (maps to our product types). */
const CATEGORY_ENUM =
  '"iphone_case", "samsung_case", "pixel_case", "airpod_case", "ipad_case", "macbook_case", "kindle_case", "watch_band", "accessory"';

/**
 * MagSafe classification rules, shared verbatim by the copy pass and the
 * dedicated verifier so both are held to the same standard.
 *
 * The design is default-deny with named evidence. Asking for a bare boolean
 * produced an 80% MagSafe rate across a catalogue of kawaii cases whose
 * "magnetic rings" were almost always pop-sockets, swivel kickstands or camera
 * bezels; requiring the model to first establish that it can even see the back
 * of the case, then name which of three admissible proofs it found, and
 * spelling out the confusers by name, is what makes the verdict trustworthy.
 */
const MAGSAFE_RULES = `MAGSAFE CLASSIFICATION
MagSafe is Apple's magnetic ring standard: a circle of magnets in the middle of
the back of the case, which lets chargers, wallets, grips and stands snap on.
Decide it from visible evidence only, in these steps.

STEP 1 — Can you see the back of the case (or its inside face) in any photo?
  No  → not MagSafe. Stop here.
  Yes → continue.

STEP 2 — Three proofs. Settle each one in order before moving to the next; a
"yes" at any point ends the search.

  2a "magnet_ring_visible" — LOOK HERE FIRST, AND ON ITS OWN.
      Is there a large circle in the MIDDLE of the back, roughly a third of the
      case's width, well below the camera block? That is the magnet array.
      It counts however it renders: a moulded ridge, a matte disc, or — on a
      clear or printed case — a thin coloured outline, because you are seeing the
      magnets through the back. A circle that size, in that position, is a magnet
      ring; nothing else is put there. It still counts when a grip or stand sits
      on top of it, or when decoration is printed over it.

  2b "magsafe_text_visible"
      The word "MagSafe", or a magnet-ring icon, on the case, its packaging, or a
      listing graphic.

  2c "magsafe_accessory_attached"
      A grip, stand, wallet or charger that holds on by magnet. Tell-tale signs:
        - it sits on a smooth circular disc base, with no clip, screw, slot or
          adhesive pad on it;
        - it is shown lifted off or beside the case, disc facing you;
        - it is shown stuck to a fridge, mirror, glass or other flat surface.
      These are sold as a set with the case precisely because the case is magnetic.

STEP 3 — On their own, these prove nothing. Do not treat them as evidence:
  • the rings around the CAMERA LENSES, in the top corner
  • a grip or stand with a visible adhesive pad or clip, or moulded into the
    case as a single piece
  • beaded straps, chains, wrist lanyards, charms, pendants, phone jewellery
  • a small printed dot, sticker, logo or badge
  • a card holder or wallet that slots in or sticks on with glue
  • a case that merely looks thin, glossy or premium

  This list only decides the answer when it is ALL you have. It never cancels a
  proof from step 2: a case with a visible magnet ring is MagSafe even if it also
  has a beaded strap, a charm and a grip.

STEP 4 — Answer.
  Proof from step 2 → magsafe: true, magsafeEvidence: that exact value, and
    magsafeConfidence "high" when you can point straight at the ring or the word
    "MagSafe", otherwise "low". A "low" answer goes to a human reviewer instead
    of being published, so use it whenever you are between the two.
  Nothing from step 2 → magsafe: false, magsafeEvidence "none",
    magsafeConfidence "none".

Judge only what is in the photos. Do not infer MagSafe from the case looking
premium, and do not rule it out because the product also ships with straps or
charms — those are sold alongside MagSafe cases all the time.`;

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
};

/**
 * Build the system prompt, adapting the title rule to the product type so we
 * never stamp "iPhone 17 16 15…" onto an AirPods or Kindle case. With no hint
 * the model is told to identify the product from the photos.
 */
function buildSystemPrompt(hint?: CopyTypeHint, brandName?: string | null, characterName?: string | null): string {
  const productLine = hint
    ? `This product is a ${hint.label}.`
    : `First identify what the product is from the photos (phone case, AirPods case, Kindle case, watch band, accessory, …).`;
  const brandLine = brandName
    ? `If the product appears to be from the ${brandName} family, use the official English name${characterName ? ` and prefer ${characterName} when the character is visible` : ""}.`
    : `If the product clearly shows a branded character or mascot, prefer the official English brand name over a generic color-animal description.`;
  // Device coverage is deliberately NOT requested. It used to be, as a
  // hard-coded model list every phone case was told to repeat — so the title
  // asserted a fit nobody had checked, and the model embellished from there
  // ("iPhone 13-18 Pro Max" on a case sold for 15/16/17). The caller appends
  // the real coverage from the product's own variant matrix; see
  // `@/lib/catalog/listing-title`.
  const titleRule = !hint
    ? "<= 140 chars, a natural title for whatever product the photos show — do NOT mention device models"
    : `<= 140 chars, a natural title for this ${hint.label} — do NOT mention any device or model name (iPhone, Pro Max, …), we add compatibility ourselves`;

  return `${ENGLISH_ONLY}

You are a senior e-commerce copywriter for Y2KASE, a Gen-Z / Kawaii / Y2K aesthetic tech-accessory brand.
You write playful but conversion-focused product copy. Voice: cute, trendy, a little maximalist, emoji-friendly but not spammy.
${productLine}
${brandLine}
Describe what you can SEE. Ignore any price, SKU, inventory code or device-model
list printed in the photos — those belong to the supplier, not to our listing.
If the product clearly shows a branded character or mascot, prefer the official
English brand name over a generic color-animal description (for example, use
Rilakkuma rather than green bear, Miffy rather than white rabbit, Hello Kitty
rather than pink cat).

${MAGSAFE_RULES}

Never write "MagSafe" in the title, the description or the tags. Our system adds
that wording itself, and only after the classification has been independently
verified. Writing it yourself corrupts that check.

Return STRICT JSON matching this TypeScript type:
{
  "title": string,        // ${titleRule}
  "description": string,  // 80-160 words, 1-2 short paragraphs, may include a few tasteful emojis
  "tags": string[],       // 8-14 lowercase snake_case search tags, English words only, no '#', no device-model lists
  "category": string,     // EXACTLY one of: ${CATEGORY_ENUM}
  "magsafe": boolean,     // see the MagSafe steps above — default false
  "magsafeConfidence": string, // "high" | "low" | "none"
  "magsafeEvidence": string,   // "magnet_ring_visible" | "magsafe_text_visible" | "magsafe_accessory_attached" | "none"
  "colors": string[],     // 1-3 of: pink, purple, blue, red, black, white, clear, yellow, green, orange, brown, beige, grey, gold, silver, multicolor. Dominant colours you can SEE on the case, not the character's typical colours. "navy" → "blue". Clear/transparent cases include "clear".
  "motifs": string[],     // 1-3 of: puppy, bunny, cat, bear, animals, clouds, stars, florals, bows, hearts, fruit, food, dolls, patterns. What is DEPICTED on the case. A licensed character is NOT a motif — Hello Kitty is not "cat", Cinnamoroll is not "clouds", Miffy is not "bunny". Empty is honest.
  "suggestedPriceUsd": number, // realistic USD retail price for this item
  "altText": string,      // <= 120 chars, plain accessibility description of the main image
  "materials": string     // e.g. "soft TPU", "hard polycarbonate", "silicone" — infer from photo if possible
}
Return ONLY the JSON object, no markdown fences. Every string value must be in English.`;
}

const COPY_TASK_LINE =
  "Analyze these product photos and write the listing copy as strict JSON, in English only.";

/**
 * The classifier picks from a closed vocabulary: anything outside the registry
 * is rejected on the way back in anyway, so spending the tokens to state the
 * options up front converts those rejections into usable answers. Generated
 * from the registry, so adding a brand there updates the prompt too.
 */
const BRAND_VOCABULARY = listBrandOptions()
  .map(
    (b) =>
      `- ${b.name}${b.characters.length > 0 ? ` — characters: ${b.characters.map((c) => c.name).join(", ")}` : ""}`,
  )
  .join("\n");

const BRAND_CLASSIFIER_PROMPT = `You are a catalog brand classifier for a premium ecommerce workflow.
Identify the brand and character shown in the product photos, using visible evidence only.

Choose from this catalogue and nothing else:
${BRAND_VOCABULARY}

Rules:
- Return JSON only.
- "brand" must be copied verbatim from the catalogue above, or null.
- "character" must be one of that brand's listed characters, or null.
- If the product is not from any catalogued brand, return null for both. A wrong
  brand is far more costly to us than an unclassified product.
- Name a character only when you can actually see it. Do not infer one from the
  brand.
- Ignore generic color-only descriptions unless they are the only evidence.

Return this exact shape:
{ "brand": string | null, "character": string | null, "confidence": "high" | "medium" | "low" | "none", "evidence": string[] }`;

/** Images sent to the copy pass. More context costs tokens for little gain. */
const MAX_COPY_IMAGES = 4;
const COPY_TEMPERATURE = 0.7;
/** The repair pass trades flair for compliance. */
const REPAIR_TEMPERATURE = 0.2;

/**
 * One image attachment.
 *
 * `detail` matters more than it looks: "low" downsamples to 512px, which is
 * plenty for "what character is this / is a hand holding it", but destroys a
 * magnet ring seen through a clear case. Fine-grained evidence must be asked
 * for at "high".
 */
function imagePart(url: string, detail: "low" | "high" = "low") {
  return { type: "image_url" as const, image_url: { url, detail } };
}

/**
 * Ask for a clean regeneration after a contract violation.
 *
 * Deliberately describes the problem instead of quoting the bad output: echoing
 * the rejected Chinese text back into the context is exactly the prime that
 * caused it, so the model would very likely repeat itself.
 */
function repairInstruction(violations: CopyViolation[]): string {
  const problems = violations.map((v) => `- the "${v.field}" field ${v.problem}`);
  return `Your previous answer was rejected by our automated validator:
${problems.join("\n")}

Regenerate the ENTIRE JSON object from the photos. Do not reuse, translate or
adapt your previous wording — write fresh copy in English. Latin alphabet,
digits and standard punctuation only. Return ONLY the JSON object.`;
}

/**
 * Generate SEO product copy from image URLs or base64 data URLs.
 *
 * The result is validated against the copy contract (English-only, non-empty
 * headline fields, sanitised tags). One repair pass is attempted on failure;
 * if that also fails the call throws {@link InvalidProductCopyError} rather
 * than returning copy we are not willing to publish.
 *
 * @param images  Array of https:// URLs or data:image/...;base64,... strings.
 *                Up to 4 are sent to the model (first 4 used).
 * @param context Optional free-text hint, e.g. the source folder name. Reduced
 *                to plain English words before use — supplier folders are named
 *                in Chinese, and feeding that in is an instruction to reply in
 *                Chinese.
 * @param hint    Optional product-type hint. Omit to let the model classify the
 *                product itself (its returned `category` drives auto-typing).
 * @param log     Optional sink for non-fatal quality warnings.
 */
export async function generateProductCopy(
  images: string[],
  context?: string,
  hint?: CopyTypeHint,
  log?: (msg: string) => void,
): Promise<GeneratedProductCopy> {
  const { client, model } = copyClient();

  // ── Brand identification: two-layer merge ────────────────────────────────
  // Layer 1 is deterministic text detection from the folder name / context
  // (classifyBrandContext). Layer 2 is a vision call that looks at the actual
  // photos (classifyCharacterBrand). The vision verdict wins when its
  // confidence is medium or higher; otherwise the text hint is used as a
  // fallback. This is the same "cheap recall → strict verifier" pattern used
  // by the MagSafe pipeline.
  const textBrand = classifyBrandContext([context]);
  const visionBrand = await classifyCharacterBrand(images, log);

  const winner = visionBrandIsAuthoritative(visionBrand)
    ? visionBrand
    : textBrand.brandId
      ? textBrand
      : visionBrand;
  const brandHint = winner.brand;
  const characterHint = winner.character;

  const englishHint = toEnglishContextHint(context);
  if (context && !brandHint && !englishHint) {
    log?.(`context hint "${context}" dropped — no usable English words`);
  }
  const contextLine = brandHint
    ? `Product context: brand=${brandHint}${characterHint ? `; character=${characterHint}` : ""}. Use the official English character/brand name if it matches what you see.\n`
    : englishHint
      ? `Product context: "${englishHint}". Use it only if it matches what you see.\n`
      : "";

  const baseMessages = [
    { role: "system" as const, content: buildSystemPrompt(hint, brandHint, characterHint) },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: `${contextLine}${COPY_TASK_LINE}` },
        ...images.slice(0, MAX_COPY_IMAGES).map((url) => imagePart(url)),
      ],
    },
  ];

  const raw = await visionJsonCompletion(
    client,
    model,
    baseMessages,
    COPY_TEMPERATURE,
  );
  const obj = parseJsonObject(raw);
  if (!obj) {
    throw new Error(
      `Copy model (${model}) returned unparseable output — check OPENAI_TEXT_MODEL is vision-capable and the API key/credits are valid.`,
    );
  }

  let result = coerceProductCopy(obj);

  if (result.blocking.length > 0) {
    log?.(
      `copy rejected (${describeViolations(result.blocking)}) — regenerating in English`,
    );
    const retryRaw = await visionJsonCompletion(
      client,
      model,
      [
        ...baseMessages,
        {
          role: "user" as const,
          content: repairInstruction(result.blocking),
        },
      ],
      REPAIR_TEMPERATURE,
    );
    const retryObj = parseJsonObject(retryRaw);
    if (retryObj) result = coerceProductCopy(retryObj);
  }

  if (result.blocking.length > 0) {
    throw new InvalidProductCopyError(result.blocking, model);
  }
  if (result.repaired.length > 0) {
    log?.(`copy auto-cleaned: ${describeViolations(result.repaired)}`);
  }

  return result.copy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing-title descriptor
//
// The narrow counterpart to `generateProductCopy`. Re-running the full copy pass
// just to fix a title would rewrite the description, the tags, the price and the
// provisional MagSafe flag as collateral — and the MagSafe flag in particular
// has already been through an independent, voted verification that a creative
// call has no business overwriting.
//
// So this asks for one thing: the phrase that tells this case apart from the
// other forty cases of the same character. Everything else in the title is
// composed from data by `@/lib/catalog/listing-title`.
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_DESCRIPTOR_PROMPT = `${ENGLISH_ONLY}

You write the descriptive core of an e-commerce listing title for a Gen-Z /
Kawaii / Y2K tech-accessory brand. You are given photos of ONE product.

Your job is DIFFERENTIATION. This catalogue has many cases of the same
character. A shopper scanning a grid must tell THIS item apart in under a
second. Name the specific visual facts you can actually see:

  • exact colour(s) and finish (mint green, pearl white, iridescent, matte,
    translucent, glitter fill, holographic foil, quilted PU, soft TPU…)
  • the art or motif on THIS case (chef hat, strawberry print, starry night,
    polka dots, leaf charm, ribbon bow — not "bunny" when every Miffy is a bunny)
  • the one standout accessory or construction detail (3D resin charm, beaded
    phone strap, pop-socket grip, foldable ring stand, card slot, magnetic plate)

Return 5 to 10 Title Case words as a fragment. No sentence. No trailing
punctuation. Prefer concrete nouns and colours over mood words.

BANNED filler — these words add zero information and make listings collide:
  cute, kawaii, y2k, aesthetic, trendy, lovely, adorable, sweet, stylish,
  unique, premium, high quality, phone, case, cover, MagSafe, iPhone

NEVER include any of the following — they are composed automatically from
verified product data, and repeating them here corrupts the title:
  • the character or brand name (Hello Kitty, Rilakkuma, Miffy, Sanrio, …)
  • the product category ("case", "cover", "phone case")
  • any device or model name ("iPhone", "15 Pro Max", "Pro Max")
  • "MagSafe", in any spelling
  • prices, SKUs or supplier codes printed in the photos

Good: "Mint Green Matte with Beaded Strap"
Good: "Clear Glitter Fill Purple Frame Charm"
Good: "Strawberry Print Soft TPU with Pop Grip"
Good: "Chef Hat 3D Charm Foldable Ring Stand"
Bad:  "Kawaii Cute Bunny Clear Phone Case"
Bad:  "Miffy MagSafe Case for iPhone 16 Pro Max"
Bad:  "Clear Glitter Phone Case"   ← too generic; name the colour, motif, accessory

Return STRICT JSON and nothing else:
{ "descriptor": string, "seen": string[] }
where "seen" lists 2-4 short English notes on what you actually observed, for a
human reviewer.`;

export type TitleDescriptor = {
  /** The phrase, exactly as the model wrote it. Sanitised by the composer. */
  descriptor: string;
  /** What the model says it saw — shown to the operator beside the proposal. */
  seen: string[];
};

/** Images sent to the descriptor pass — enough angles to see the accessories. */
const MAX_DESCRIPTOR_IMAGES = 6;
const DESCRIPTOR_TEMPERATURE = 0.65;

export type TitleDescriptorContext = {
  ip: string | null;
  noun: string;
  /**
   * Descriptive phrases already used by sibling products of the same IP.
   * The model must not echo these — that is how a catalogue ends up with twelve
   * "Clear Glitter" Miffy titles that only differ by model list.
   */
  avoid?: string[];
};

/**
 * Ask for the descriptive phrase of a listing title from the product photos.
 *
 * Runs on the copy model, not the cheap vision model: this text is read by
 * customers, and the language failure mode documented on {@link copyClient}
 * applies in full — the photos carry burnt-in Chinese supplier text.
 *
 * Returns null rather than throwing when the model is unreachable or writes
 * something unusable, because the caller always has a deterministic repair to
 * fall back on. `log` reports which it was.
 */
export async function describeProductForTitle(
  images: string[],
  context: TitleDescriptorContext,
  log?: (msg: string) => void,
): Promise<TitleDescriptor | null> {
  if (images.length === 0) return null;

  const avoid = (context.avoid ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  const contextLine = [
    `The product is a ${context.noun}.`,
    context.ip
      ? `It has already been identified as ${context.ip} — do NOT name it, describe everything else.`
      : "",
    avoid.length > 0
      ? `Sibling listings of the same character already use these descriptive phrases — yours MUST be visually distinct from all of them:\n${avoid.map((s) => `  - ${s}`).join("\n")}`
      : "",
    "Look at the photos carefully. Describe THIS item now. Return JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { client, model } = copyClient();
    const raw = await visionJsonCompletion(
      client,
      model,
      [
        { role: "system", content: TITLE_DESCRIPTOR_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: contextLine },
            ...sampleEvenly(images, MAX_DESCRIPTOR_IMAGES).map((url) =>
              imagePart(url, "high"),
            ),
          ],
        },
      ],
      DESCRIPTOR_TEMPERATURE,
    );

    const obj = parseJsonObject(raw);
    const descriptor =
      typeof obj?.descriptor === "string" ? obj.descriptor.trim() : "";
    if (!descriptor) {
      log?.("title descriptor: model returned nothing usable");
      return null;
    }

    const script = findForbiddenScript(descriptor);
    if (script) {
      log?.(`title descriptor rejected — contains ${script}`);
      return null;
    }

    return {
      descriptor,
      seen: Array.isArray(obj?.seen)
        ? obj.seen.filter((s): s is string => typeof s === "string").slice(0, 4)
        : [],
    };
  } catch (err) {
    log?.(
      `title descriptor failed (${err instanceof Error ? err.message : err})`,
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vision-based brand/character classifier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confidence threshold for the vision classifier's verdict to override the
 * text-based hint. A "medium" or "high" vision verdict is authoritative; a
 * "low" or "none" verdict falls back to the text hint.
 */
const VISION_BRAND_MIN_CONFIDENCE: BrandConfidence = "medium";

const CONFIDENCE_RANK: Record<BrandConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Whether a vision verdict is strong enough to overrule the text signals.
 *
 * The rule lives here so ingest, the backfill script and the admin's re-detect
 * button all apply the same threshold — they used to each spell it out, which
 * is how they'd end up disagreeing about the same product.
 */
export function visionBrandIsAuthoritative(
  verdict: BrandClassification,
): boolean {
  return (
    verdict.brandId != null &&
    CONFIDENCE_RANK[verdict.confidence] >=
      CONFIDENCE_RANK[VISION_BRAND_MIN_CONFIDENCE]
  );
}

/** Images sent to the brand classifier — enough to recognise a character. */
const MAX_BRAND_IMAGES = 4;
const BRAND_CLASSIFY_TEMPERATURE = 0.2;

/**
 * Validate the model's answer against the brand registry.
 *
 * The registry is a closed vocabulary on purpose. A free-text brand name from
 * the model looks like a richer answer but is unusable downstream: it matches
 * no collection, no filter and no other product, so it silently becomes a
 * one-off label nobody can browse. An unrecognised brand is therefore treated
 * as "not classified" and logged, so the fix is a one-line registry addition.
 */
function coerceBrandClassification(
  raw: Record<string, unknown>,
  log?: (msg: string) => void,
): BrandClassification {
  const asText = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const brand = asText(raw.brand);
  const character = asText(raw.character);
  if (!brand && !character) return EMPTY_BRAND_CLASSIFICATION;

  const resolved = resolveBrandAssignment(brand, character);
  if (!resolved.ok) {
    // Retry with the brand alone: the model often nails the family and
    // hallucinates the character, and half a right answer is still useful.
    const brandOnly = brand ? resolveBrandAssignment(brand, null) : null;
    if (!brandOnly?.ok) {
      log?.(
        `brand classifier proposed "${[brand, character].filter(Boolean).join(" / ")}" — not in the registry, ignoring`,
      );
      return EMPTY_BRAND_CLASSIFICATION;
    }
    log?.(`brand classifier character "${character}" rejected: ${resolved.reason}`);
    return {
      brand: brandOnly.brand.brand,
      character: null,
      brandId: brandOnly.brand.id,
      characterId: null,
      confidence: coerceConfidence(raw.confidence),
      evidence: coerceEvidence(raw.evidence),
    };
  }

  return {
    brand: resolved.brand.brand,
    character: resolved.character?.name ?? null,
    brandId: resolved.brand.id,
    characterId: resolved.character?.id ?? null,
    confidence: coerceConfidence(raw.confidence),
    evidence: coerceEvidence(raw.evidence),
  };
}

function coerceConfidence(value: unknown): BrandConfidence {
  const allowed: BrandConfidence[] = ["high", "medium", "low", "none"];
  return allowed.includes(value as BrandConfidence)
    ? (value as BrandConfidence)
    : "none";
}

function coerceEvidence(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((e): e is string => typeof e === "string").slice(0, 6)
    : [];
}

/**
 * Ask the vision model to identify the character brand from the product
 * photos. Uses the cheap vision model (OpenRouter / Qwen-VL) rather than the
 * copy model, because this is a classification task with structured output —
 * no customer-visible prose is generated here.
 *
 * Returns a {@link BrandClassification}; `brand` is null when the model could
 * not identify a brand with at least {@link VISION_BRAND_MIN_CONFIDENCE}, or
 * named something outside the brand registry.
 *
 * Never throws: a classifier outage must not fail an ingest run. Callers that
 * need to tell "no brand here" apart from "the classifier is down" should pass
 * a `log` sink — the reason is reported there.
 */
export async function classifyCharacterBrand(
  images: string[],
  log?: (msg: string) => void,
): Promise<BrandClassification> {
  if (images.length === 0) return EMPTY_BRAND_CLASSIFICATION;

  try {
    const { client, model } = visionClient();
    const raw = await visionJsonCompletion(
      client,
      model,
      [
        { role: "system", content: BRAND_CLASSIFIER_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify the brand and character family for the product in these photos. Return JSON only.",
            },
            ...sampleEvenly(images, MAX_BRAND_IMAGES).map((url) =>
              imagePart(url, "high"),
            ),
          ],
        },
      ],
      BRAND_CLASSIFY_TEMPERATURE,
    );
    const obj = parseJsonObject(raw);
    if (!obj) {
      log?.("brand classifier returned unparseable output — falling back to text hint");
      return EMPTY_BRAND_CLASSIFICATION;
    }
    const result = coerceBrandClassification(obj, log);
    log?.(
      `brand classifier → brand=${result.brand ?? "null"}, character=${result.character ?? "null"}, confidence=${result.confidence}`,
    );
    return result;
  } catch (err) {
    log?.(
      `brand classifier failed (${err instanceof Error ? err.message : err}) — falling back to text hint`,
    );
    return EMPTY_BRAND_CLASSIFICATION;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Incoming-folder classifier (pre-ingest receiving dock)
// ─────────────────────────────────────────────────────────────────────────────

const FOLDER_CLASSIFY_TEMPERATURE = 0.2;
const MAX_FOLDER_IMAGES = 4;

const FOLDER_CLASSIFIER_PROMPT = `You classify ONE product folder from a Chinese supplier dump (QQ / WeChat group photos) for a kawaii tech-accessory store.

The photos may include:
  • real product shots (phone cases, AirPods cases, watch bands, charms…)
  • chat screenshots (QQ/WeChat UI, message bubbles, timestamps)
  • QR codes, WeChat Pay / Alipay receipts, invoices, price lists
  • size charts, compatibility tables with no product
  • unrelated memes or personal photos

STEP 1 — Is this a physical product we can sell?
  No  → isProduct: false, set rejectReason to the closest of:
        "chat_screenshot" | "qr_code" | "invoice" | "size_chart" | "unrelated" | "too_messy"
        brand and character must be null.
  Yes → isProduct: true, rejectReason: null, continue.

STEP 2 — What kind of product? category must be EXACTLY one of:
${CATEGORY_ENUM}

STEP 3 — Brand and character, from this catalogue and nothing else:
${BRAND_VOCABULARY}

Rules:
- "brand" must be copied verbatim from the catalogue, or null.
- "character" must be one of that brand's listed characters, or null.
- A wrong brand is far more costly than an unclassified product. If you are not
  sure, return null for both and lower confidence.
- Name a character only when you can actually see it.
- Ignore Chinese overlay text, SKUs, prices and device-model lists. They are
  the supplier's, not a classification.
- A generic floral / marble / solid-colour case with no character is a product
  with brand null and confidence "high" when the type is obvious.

Return STRICT JSON and nothing else:
{
  "isProduct": boolean,
  "rejectReason": string | null,
  "category": string,
  "brand": string | null,
  "character": string | null,
  "confidence": "high" | "medium" | "low" | "none",
  "evidence": string[]
}`;

/**
 * One vision pass over a supplier folder: product-vs-junk, product type, and
 * brand/character. Uses the cheap vision model (not the copy model) because
 * nothing here becomes customer-visible prose.
 *
 * Text signals from the folder name are merged with the same authority rule
 * ingest uses ({@link visionBrandIsAuthoritative}): a medium+ vision verdict
 * wins; otherwise a text hit is the fallback. A vision outage never throws —
 * the verdict is marked `failed` so the sorter queues the folder for review
 * instead of rejecting it or silently filing it.
 */
export async function classifyIncomingFolder(
  images: string[],
  context?: string,
  log?: (msg: string) => void,
): Promise<IncomingFolderVerdict> {
  const textBrand = classifyBrandContext([context]);

  if (images.length === 0) {
    log?.("folder classifier: no images — review");
    return {
      ...emptyVerdict(),
      brand: textBrand.brandId ? textBrand : EMPTY_BRAND_CLASSIFICATION,
      evidence: textBrand.evidence,
    };
  }

  try {
    const { client, model } = visionClient();
    const raw = await visionJsonCompletion(
      client,
      model,
      [
        { role: "system", content: FOLDER_CLASSIFIER_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                context
                  ? `Folder name (reference only, may be Chinese or a SKU): "${context}".`
                  : "",
                "Classify this product folder from the photos. Return JSON only.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            ...sampleEvenly(images, MAX_FOLDER_IMAGES).map((url) =>
              imagePart(url, "high"),
            ),
          ],
        },
      ],
      FOLDER_CLASSIFY_TEMPERATURE,
    );

    const obj = parseJsonObject(raw);
    if (!obj) {
      log?.("folder classifier returned unparseable output — review");
      return {
        ...emptyVerdict(),
        brand: textBrand.brandId ? textBrand : EMPTY_BRAND_CLASSIFICATION,
      };
    }

    if (typeof obj.isProduct !== "boolean") {
      log?.("folder classifier omitted isProduct — review");
      return {
        ...emptyVerdict(),
        brand: textBrand.brandId ? textBrand : EMPTY_BRAND_CLASSIFICATION,
        evidence: textBrand.evidence,
      };
    }

    const isProduct = obj.isProduct;
    const rejectReason = isProduct ? null : coerceRejectReason(obj.rejectReason);
    const visionBrand = coerceBrandClassification(obj, log);
    const inferredProductType = inferProductTypeId(
      typeof obj.category === "string" ? obj.category : null,
    );
    const productTypeId = inferredProductType ?? "iphone_case";

    const winner = visionBrandIsAuthoritative(visionBrand)
      ? visionBrand
      : textBrand.brandId
        ? textBrand
        : visionBrand;

    const rawConfidence = coerceConfidence(obj.confidence);
    const confidence: BrandConfidence = !isProduct
      ? rejectReason
        ? rawConfidence === "none"
          ? "low"
          : rawConfidence
        : "low"
      : !inferredProductType
        ? "low"
      : rawConfidence === "none"
        ? winner.confidence
        : rawConfidence;

    const evidence = Array.from(
      new Set([...coerceEvidence(obj.evidence), ...winner.evidence]),
    ).slice(0, 8);

    log?.(
      `folder classifier → product=${isProduct}` +
        (rejectReason ? ` reject=${rejectReason}` : "") +
        ` type=${productTypeId} brand=${winner.brand ?? "null"}` +
        ` character=${winner.character ?? "null"} confidence=${confidence}`,
    );

    return {
      isProduct,
      rejectReason,
      productTypeId,
      brand: isProduct ? winner : EMPTY_BRAND_CLASSIFICATION,
      confidence,
      evidence,
      failed: false,
    };
  } catch (err) {
    log?.(
      `folder classifier failed (${err instanceof Error ? err.message : err}) — review`,
    );
    return {
      ...emptyVerdict(),
      brand: textBrand.brandId ? textBrand : EMPTY_BRAND_CLASSIFICATION,
      evidence: textBrand.evidence,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MagSafe verification
// ─────────────────────────────────────────────────────────────────────────────

const MAGSAFE_VERIFY_PROMPT = `You are a quality inspector for a phone-case store. Your only job is to decide
whether the case in these photos is MagSafe, and you are held to a strict
evidence standard — a colleague already flagged it as "maybe MagSafe" and you are
the independent second opinion whose answer we act on.

${MAGSAFE_RULES}

Respond in English. Return STRICT JSON and nothing else:
{ "magsafe": boolean, "confidence": "high" | "low" | "none", "evidence": "magnet_ring_visible" | "magsafe_text_visible" | "magsafe_accessory_attached" | "none" }`;

/**
 * Images sent to the verifier.
 *
 * Higher than the copy pass on purpose. Supplier galleries are mostly lifestyle
 * shots where the phone is a small, angled part of the frame, and the magnet
 * ring is only legible in the one or two photos that happen to show the back
 * square-on. Sampling too few frames misses the evidence entirely — which shows
 * up as false negatives in `npm run eval:magsafe`, not as an error.
 */
const MAX_VERIFY_IMAGES = 8;

/**
 * Pick up to `count` items spread across the list, always keeping the first and
 * the last. Sellers photograph the front first and the back last, so taking a
 * prefix would systematically hide the one thing the verifier needs to see.
 */
function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = (items.length - 1) / (count - 1);
  return Array.from(
    new Set(Array.from({ length: count }, (_, i) => Math.round(i * step))),
  ).map((i) => items[i]);
}

/**
 * How many independent verification passes to take before deciding.
 *
 * Temperature is 0, but the answer still is not: an OpenAI-compatible gateway
 * (OpenRouter) load-balances one model id across providers running different
 * quantisations and kernels, so back-to-back calls on identical input disagree.
 * Measured on the labelled set in `npm run eval:magsafe`, a single call flips
 * borderline products between runs — which is fatal for a flag that edits live
 * copy. Voting turns that variance from a correctness bug into a usable
 * confidence signal, and costs three cheap calls on candidates only.
 */
const MAGSAFE_VOTES = 3;

/** One verification pass. Null when it failed or returned nothing parseable. */
async function verifyMagSafeOnce(
  imageUrls: string[],
): Promise<MagSafeVerdict | null> {
  try {
    const { client, model } = visionClient();
    const raw = await visionJsonCompletion(
      client,
      model,
      [
        { role: "system", content: MAGSAFE_VERIFY_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Inspect every photo, including the back of the case. Is this MagSafe? Return JSON.",
            },
            ...imageUrls.map((url) => imagePart(url, "high")),
          ],
        },
      ],
      0,
    );
    const obj = parseJsonObject(raw);
    if (!obj) return null;

    const evidence = coerceMagSafeEvidence(obj.evidence);
    const magsafe = obj.magsafe === true && evidence !== "none";
    return {
      magsafe,
      confidence: !magsafe ? "none" : obj.confidence === "high" ? "high" : "low",
      evidence,
    };
  } catch {
    return null;
  }
}

/** The evidence value cited most often among positive votes. */
function modalEvidence(votes: MagSafeVerdict[]): MagSafeVerdict["evidence"] {
  const tally = new Map<MagSafeVerdict["evidence"], number>();
  for (const v of votes) tally.set(v.evidence, (tally.get(v.evidence) ?? 0) + 1);
  let best: MagSafeVerdict["evidence"] = "none";
  let bestCount = 0;
  for (const [evidence, count] of tally) {
    if (count > bestCount) {
      best = evidence;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Independent MagSafe verification of a product's photos, by majority vote.
 *
 * This is the *deciding* signal: {@link decideMagSafe} will not auto-apply
 * MagSafe without it. The aggregation is deliberately asymmetric, because the
 * two mistakes cost different amounts — a missed MagSafe case loses a facet
 * placement, a wrong one sells a customer a case their charger falls off:
 *
 *   unanimous yes  → high confidence  → auto-confirm
 *   split          → low confidence   → human review queue
 *   unanimous no   → not MagSafe
 *
 * So nothing is published on a flickering verdict, and nothing borderline is
 * silently dropped either — it lands in front of a person.
 *
 * Returns null — not a negative verdict — when no pass completed, so an outage
 * leaves products alone rather than clearing them.
 *
 * @param imageUrls https URLs or base64 data URLs, in gallery order.
 */
export async function verifyMagSafe(
  imageUrls: string[],
): Promise<MagSafeVerdict | null> {
  if (imageUrls.length === 0) return null;

  // Sample once and reuse, so every vote sees exactly the same evidence and any
  // disagreement is the model's, not the sampler's.
  const frames = sampleEvenly(imageUrls, MAX_VERIFY_IMAGES);
  const results = await Promise.all(
    Array.from({ length: MAGSAFE_VOTES }, () => verifyMagSafeOnce(frames)),
  );

  const votes = results.filter((v): v is MagSafeVerdict => v !== null);
  if (votes.length === 0) return null;

  const yes = votes.filter((v) => v.magsafe);
  if (yes.length === 0) return { magsafe: false, confidence: "none", evidence: "none" };

  const unanimous = yes.length === votes.length;
  const mostlyHigh = yes.filter((v) => v.confidence === "high").length * 2 >= yes.length;
  return {
    magsafe: true,
    confidence: unanimous && mostlyHigh ? "high" : "low",
    evidence: modalEvidence(yes),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-image classifiers
// ─────────────────────────────────────────────────────────────────────────────

const STYLE_CLASSIFY_PROMPT = `You classify product photos for a phone-case store. Respond in English only.
For EACH image (identified by filename key), name the ONE configuration it shows.

Valid style values (use EXACT strings):
- "Case + Grip + Charm"
- "Case + Grip"
- "Case + Charm"
- "Case Only"
- "Grip Only"
- "Charm Only"

Rules:
- Exactly one value per image: the configuration physically present in the photo, counting every accessory visible. A case shown with BOTH a grip and a charm is "Case + Grip + Charm", never "Case + Grip".
- Phone case with no grip or charm → "Case Only".
- A pop grip / stand on its own → "Grip Only". Charms or straps on their own → "Charm Only".
- If no configuration is identifiable — packaging, a texture close-up, a lifestyle shot with the product obscured — return null. Do not guess.

Return STRICT JSON: { "filename_without_ext": "Style" | null, ... }
Keys must match the filename labels provided. No markdown.`;

/**
 * filename → the single style the photo depicts, as the array shape stored in
 * `product_images.style_tags`. Empty means universal / unidentifiable.
 */
export type ImageStyleClassification = Record<string, Style[]>;

/**
 * Classify which Style option each product photo depicts.
 *
 * A photo shows one physical configuration, so the result carries at most one
 * style per image — see "Per-image style tagging" in `@/lib/pricing`.
 *
 * @param items  filename (no ext) + image as base64 data URL or https URL
 */
export async function classifyImageStyles(
  items: { filename: string; imageUrl: string }[],
): Promise<ImageStyleClassification> {
  if (items.length === 0) return {};

  const { client, model } = visionClient();
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
              ...batch.map((item) => imagePart(item.imageUrl)),
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
      const raw = parsed[item.filename];
      // Accept a bare string (what the prompt asks for) or an array (what
      // models occasionally return anyway). Normalization validates the values
      // and, if several came back, keeps the most complete one.
      const candidates = Array.isArray(raw)
        ? raw.filter((t): t is string => typeof t === "string")
        : typeof raw === "string"
          ? [raw]
          : [];
      result[item.filename] = normalizeImageStyleTags(candidates);
    }
  }

  return result;
}

/** How an image reads for use as a storefront grid thumbnail. */
export type ThumbnailCategory =
  | "clean_product" // product only, plain/simple background — ideal
  | "hand_held" // a hand is holding the product
  | "has_props" // extra objects: cards, packaging, plates, decor
  | "lifestyle" // in-context / scene shot
  | "busy"; // cluttered or hard to isolate the product

export type ThumbnailScore = {
  /** 0–1 suitability as a clean catalog thumbnail (higher = better). */
  score: number;
  category: ThumbnailCategory;
  /** True only for a product-only shot with no hands/props/scene. */
  cleanProductShot: boolean;
  /** Short human-readable justification for the review sheet. */
  reason: string;
};

export type ThumbnailSuitability = Record<string, ThumbnailScore>;

const THUMB_CATEGORIES = new Set<ThumbnailCategory>([
  "clean_product",
  "hand_held",
  "has_props",
  "lifestyle",
  "busy",
]);

const THUMBNAIL_SCORE_PROMPT = `You are curating hero thumbnails for an e-commerce grid (like Amazon/CASETiFY).
Respond in English only.
For EACH image (identified by its filename key), judge how well it works as a clean product THUMBNAIL.

STEP 1 — HANDS FIRST (most important). Look very carefully for ANY human body part:
fingers, a fingernail, a thumb, a palm, a hand, a wrist, an arm, or a person
holding or touching the product. Phone-case photos are very often shot held in a
hand — do not overlook it just because the product looks nice.
• If ANY human hand/finger/arm is visible (even partially, even just fingertips
  at an edge): category = "hand_held", score MUST be <= 0.2, cleanProductShot = false.
  This overrides everything else — a beautiful product held in a hand is STILL 0.2.

STEP 2 — only for images with NO human body part, score the rest:
- "clean_product" (0.8–1.0): ONE product, well framed, on a plain/simple/neutral
  or transparent background, no hands, no props, sharp and fully visible.
- "has_props" (0.3–0.6): extra objects — cards, packaging, plates, decor, other items.
- "lifestyle" (0.2–0.5): an in-context / staged scene.
- "busy" (0.0–0.3): cluttered, or the product is hard to make out.

Be strict: when unsure whether something is a finger/hand, assume it IS and use "hand_held".

Return STRICT JSON keyed by each filename:
{ "<filename>": { "score": number, "category": "clean_product|hand_held|has_props|lifestyle|busy", "cleanProductShot": boolean, "reason": string }, ... }
The reason should name what you saw, in English (e.g. "hand holding case", "clean product on white"). No markdown.`;

/**
 * Score each supplied image for use as a storefront grid thumbnail.
 *
 * This is the SELECTION half of thumbnail normalization: because background
 * removal cannot strip a hand that is holding the product (the hand is the
 * segmented foreground), the durable fix is to pick each product's cleanest
 * existing shot as the hero. Runs on the same cheap vision path as the other
 * classifiers; a failed batch degrades to score 0 (never selected) rather than
 * failing the run.
 *
 * @param items filename key (unique per image) + image as https URL or data URL
 */
export async function classifyThumbnailSuitability(
  items: { filename: string; imageUrl: string }[],
): Promise<ThumbnailSuitability> {
  if (items.length === 0) return {};

  const { client, model } = visionClient();
  const result: ThumbnailSuitability = {};

  const BATCH = 6;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const fileList = batch.map((b) => b.filename).join(", ");

    let parsed: Record<string, unknown> = {};
    try {
      const raw = await visionJsonCompletion(
        client,
        model,
        [
          { role: "system", content: THUMBNAIL_SCORE_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Score these images as thumbnails. Filenames: ${fileList}. Return JSON keyed by each filename.`,
              },
              ...batch.map((item) => imagePart(item.imageUrl)),
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
      result[item.filename] = coerceThumbnailScore(parsed[item.filename]);
    }
  }

  return result;
}

/** Normalize an untrusted model result into a safe ThumbnailScore. */
function coerceThumbnailScore(raw: unknown): ThumbnailScore {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const rawScore = typeof o.score === "number" ? o.score : 0;
  const score = Math.max(0, Math.min(1, rawScore));
  const category: ThumbnailCategory = THUMB_CATEGORIES.has(
    o.category as ThumbnailCategory,
  )
    ? (o.category as ThumbnailCategory)
    : "busy";
  return {
    score,
    category,
    cleanProductShot:
      o.cleanProductShot === true || category === "clean_product",
    reason: typeof o.reason === "string" ? o.reason.slice(0, 160) : "",
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
