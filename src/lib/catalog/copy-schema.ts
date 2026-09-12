/**
 * The contract for AI-generated product copy: its shape, its language, and the
 * coercion that turns untrusted model output into something safe to persist.
 *
 * This module has no dependencies beyond `./magsafe` (itself a leaf), so it is
 * cheap to import from both the generation layer and the remediation scripts,
 * and is pure/synchronous — every rule here is unit-testable without a model.
 *
 * ── Why a language guard exists ─────────────────────────────────────────────
 * Our source photography comes from Chinese supplier listings: the images carry
 * burnt-in Chinese marketing text and the folders are named in Chinese. Feed
 * that to a model and it will happily answer in Chinese, because matching the
 * language of the input is the statistically "correct" continuation — the effect
 * is strongest on Chinese-trained models, which is why copy generation runs on
 * `OPENAI_TEXT_MODEL` rather than the cheap open-weight `OPENAI_VISION_MODEL`.
 * Neither the model choice nor the prompt is a guarantee, so the storefront's
 * English-only promise is enforced here, in code.
 *
 * The rule is: non-English copy is NEVER written to the database. Fields we can
 * repair deterministically (tags, materials, alt text) are repaired; the
 * headline fields (title, description) have no safe fallback, so a violation is
 * reported as blocking and the caller retries or fails the product.
 */
import {
  ADMISSIBLE_MAGSAFE_EVIDENCE,
  coerceMagSafeEvidence,
  MAGSAFE_TAG,
  type MagSafeConfidence,
  type MagSafeEvidence,
} from "./magsafe";
import { parseColorFamilies, type ColorFamilySlug } from "./colors";
import { parseMotifFamilies, type MotifFamilySlug } from "./motifs";

export type GeneratedProductCopy = {
  title: string;
  description: string;
  tags: string[];
  category: string;
  suggestedPriceUsd: number;
  altText: string;
  materials: string;
  /**
   * The copy pass's provisional MagSafe read. Over-eager by design — it exists
   * to trigger the strict verifier, never to decide. See `./magsafe`.
   */
  magsafe: boolean;
  magsafeConfidence: MagSafeConfidence;
  /** What the model claims it saw. Gated against an allow-list. */
  magsafeEvidence: MagSafeEvidence;
  /**
   * Canonical color families the model saw on the product. Coerced against
   * `@/lib/catalog/colors` — unknown names are dropped, never persisted raw.
   */
  colors: ColorFamilySlug[];
  /**
   * Canonical motif families the model saw depicted on the product. Coerced
   * against `@/lib/catalog/motifs` — unknown names are dropped.
   */
  motifs: MotifFamilySlug[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Script detection
//
// An allow-list would be wrong here: the brand voice is explicitly emoji-
// friendly, and emoji, typographic dashes and accented Latin are all legitimate.
// So we deny-list the writing systems that must never appear in storefront copy
// and let everything else through.
// ─────────────────────────────────────────────────────────────────────────────

/** Writing systems that are never valid in our English-only storefront copy. */
const FORBIDDEN_SCRIPTS: { name: string; find: RegExp; strip: RegExp }[] = (
  [
    // CJK ideographs, incl. the astral extension planes.
    ["Chinese/Japanese (CJK)", "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FA1F}"],
    ["Japanese kana", "\\u3040-\\u30FF\\u31F0-\\u31FF\\uFF66-\\uFF9F"],
    ["Korean (Hangul)", "\\u1100-\\u11FF\\u3130-\\u318F\\uA960-\\uA97F\\uAC00-\\uD7AF"],
    ["Bopomofo", "\\u3100-\\u312F"],
    // CJK punctuation (、。「」) and fullwidth Latin (ＡＢ１２（）).
    ["CJK punctuation/fullwidth forms", "\\u3000-\\u303F\\uFE30-\\uFE4F\\uFF01-\\uFF65\\uFFE0-\\uFFE6"],
    ["Cyrillic", "\\u0400-\\u052F"],
    ["Arabic", "\\u0600-\\u06FF\\u0750-\\u077F"],
    ["Hebrew", "\\u0590-\\u05FF"],
    ["Thai", "\\u0E00-\\u0E7F"],
    ["Devanagari", "\\u0900-\\u097F"],
  ] satisfies [string, string][]
).map(([name, ranges]) => ({
  name,
  find: new RegExp(`[${ranges}]`, "u"),
  strip: new RegExp(`[${ranges}]`, "gu"),
}));

/**
 * Name the first forbidden writing system present in `text`, or null when the
 * text is clean. Emoji, curly quotes, em dashes and accented Latin all pass.
 */
export function findForbiddenScript(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  for (const { name, find } of FORBIDDEN_SCRIPTS) {
    if (find.test(text)) return name;
  }
  return null;
}

/** True when the text contains no forbidden writing system. */
export function isEnglishSafe(text: string | null | undefined): boolean {
  return findForbiddenScript(text) === null;
}

/** Drop every character belonging to a forbidden script, then tidy whitespace. */
export function stripForbiddenScripts(text: string): string {
  let out = text;
  for (const { strip } of FORBIDDEN_SCRIPTS) out = out.replace(strip, " ");
  return out.replace(/\s{2,}/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Violations
// ─────────────────────────────────────────────────────────────────────────────

export type CopyField =
  | "title"
  | "description"
  | "altText"
  | "materials"
  | "tags";

export type CopyViolation = {
  field: CopyField;
  /** Full predicate, e.g. `contains Chinese/Japanese (CJK)` or `is empty`. */
  problem: string;
  /** A short excerpt of the offending value, for logs and error messages. */
  sample: string;
};

/** Report a forbidden script in `value`, or null when it is clean. */
function scriptViolation(field: CopyField, value: string): CopyViolation | null {
  const script = findForbiddenScript(value);
  return script
    ? { field, problem: `contains ${script}`, sample: value.slice(0, 80) }
    : null;
}

/** Render violations as a single human-readable line for logs/errors. */
export function describeViolations(violations: CopyViolation[]): string {
  return violations
    .map((v) => (v.sample ? `${v.field} ${v.problem}: "${v.sample}"` : `${v.field} ${v.problem}`))
    .join("; ");
}

/**
 * Thrown when generated copy still violates the contract after the repair
 * attempt. Failing the product is deliberate: the ingest pipeline records the
 * folder as errored and it can be re-run, whereas a Chinese title written to
 * the database quietly becomes a live storefront listing.
 */
export class InvalidProductCopyError extends Error {
  readonly violations: CopyViolation[];

  constructor(violations: CopyViolation[], model: string) {
    super(
      `Vision model (${model}) returned unusable copy after a repair attempt — ${describeViolations(violations)}`,
    );
    this.name = "InvalidProductCopyError";
    this.violations = violations;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field normalisation
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TITLE_CHARS = 140;
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_ALT_TEXT_CHARS = 120;
const MAX_MATERIALS_CHARS = 120;
const MAX_TAG_CHARS = 40;
const MAX_TAGS = 14;
const MIN_PRICE_USD = 1;
const MAX_PRICE_USD = 500;
const DEFAULT_PRICE_USD = 19.99;

function asText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Truncate at a word boundary so we never ship a half-word title. */
function clampWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Folder-name noise that carries no descriptive value. Supplier folders look
 * like `hot-圆边双面imd 磨砂蜜瓜薄荷绿轻松熊 10 13-14-...-18promax_variants`,
 * where the Latin fragments are inventory shorthand, not product description.
 */
const HINT_STOPWORDS = new Set([
  "hot", "new", "sale", "best", "top", "imd", "pcs", "set", "sets", "lot",
  "variant", "variants", "case", "cases", "cover", "covers", "phone", "iphone",
  "pro", "promax", "max", "mini", "plus", "ultra", "and", "the", "for", "with",
  "other", "others", "misc", "general", "uncategorized", "untitled", "folder",
  "image", "images", "photo", "photos", "product", "products", "temp", "tmp",
  "copy", "final", "batch", "upload", "uploads",
]);

/**
 * Reduce a source-folder name to a short English hint safe to put in a prompt.
 *
 * The folder name used to be passed to the model verbatim as
 * `Product category hint: "…". Use this to write more specific copy.` — so a
 * Chinese folder name was an explicit instruction to think in Chinese. Anything
 * that is not a plain Latin word is dropped; when nothing meaningful survives we
 * return null and the prompt simply omits the hint.
 */
export function toEnglishContextHint(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  // Brand words are deliberately kept: `generateProductCopy` prefers the
  // classified brand line and only falls back to this hint, so stripping them
  // here just threw away the one usable word in folders named "Sanrio".
  const words = raw
    .split(/[\s/\\_\-–—+,.()[\]{}]+/)
    .map((w) => w.trim())
    .filter((w) => /^[A-Za-z]{3,}$/.test(w))
    .filter((w) => !HINT_STOPWORDS.has(w.toLowerCase()));

  const unique = Array.from(new Set(words)).slice(0, 6);
  return unique.length > 0 ? unique.join(" ") : null;
}

/**
 * Normalise one untrusted tag (model output or a source-folder name), or
 * reject it.
 *
 * Rejects: forbidden scripts, numeric device-model dumps
 * (`15-15pro-15promax-16-…`), anything left too short to be a search term, and
 * `magsafe` — which is reserved, because only a verified classification may
 * apply it. Do not run manifest-authored tags through this; those are a human
 * assertion and are allowed to say MagSafe.
 */
export function sanitizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (findForbiddenScript(raw)) return null;

  // snake_case is the canonical form: mixing `beaded-strap` and `beaded_strap`
  // would split one storefront facet into two.
  const tag = raw
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s./\\|,+&-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  if (tag.length < 2 || tag.length > MAX_TAG_CHARS) return null;
  if (!/[a-z]/.test(tag)) return null; // purely numeric / punctuation

  // `magsafe` is reserved: only a verified decision may apply it (see ./magsafe).
  if (tag === MAGSAFE_TAG || /^mag[_-]?safe$/.test(tag)) return null;

  // Device-model dumps are mostly digits and are never useful search terms.
  const digits = (tag.match(/\d/g) ?? []).length;
  if (digits / tag.length > 0.35) return null;

  return tag;
}

/** Normalise a whole untrusted tag list: sanitize, de-duplicate, cap. */
export function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = sanitizeTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Normalise the free-text `category` into the key shape `inferProductTypeId` expects. */
function normalizeCategory(raw: unknown): string {
  const key = asText(raw)
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");
  return key || "phone_case";
}

// ─────────────────────────────────────────────────────────────────────────────
// Coercion
// ─────────────────────────────────────────────────────────────────────────────

export type CoercedCopy = {
  copy: GeneratedProductCopy;
  /**
   * Violations in fields with no safe deterministic fallback. The caller must
   * retry generation or fail the product — never persist these.
   */
  blocking: CopyViolation[];
  /** Violations we already fixed by dropping/substituting the value. */
  repaired: CopyViolation[];
};

/**
 * Turn one untrusted model JSON object into a normalised {@link GeneratedProductCopy}
 * plus a report of what was wrong with it.
 *
 * Every field is clamped, whitelisted or defaulted, so the returned copy is
 * always structurally valid; `blocking` tells the caller whether it is also
 * *linguistically* valid enough to persist.
 */
export function coerceProductCopy(raw: Record<string, unknown>): CoercedCopy {
  const blocking: CopyViolation[] = [];
  const repaired: CopyViolation[] = [];

  // Title and description are the listing. They have no safe fallback, so any
  // problem with them is blocking: the caller retries, then fails the product.
  const title = clampWords(asText(raw.title), MAX_TITLE_CHARS);
  const titleViolation =
    scriptViolation("title", title) ??
    (title.length < 8
      ? { field: "title" as const, problem: "is missing or too short", sample: title }
      : null);
  if (titleViolation) blocking.push(titleViolation);

  const description = clampWords(
    typeof raw.description === "string" ? raw.description.trim() : "",
    MAX_DESCRIPTION_CHARS,
  );
  const descriptionViolation =
    scriptViolation("description", description) ??
    (description.length < 40
      ? {
          field: "description" as const,
          problem: "is missing or too short",
          sample: description.slice(0, 80),
        }
      : null);
  if (descriptionViolation) blocking.push(descriptionViolation);

  // Alt text has a safe fallback (the title), so a violation is repairable —
  // unless the title is unusable too, in which case `blocking` already covers it.
  let altText = clampWords(asText(raw.altText) || title, MAX_ALT_TEXT_CHARS);
  const altViolation = scriptViolation("altText", altText);
  if (altViolation) {
    repaired.push(altViolation);
    altText = titleViolation ? "" : title;
  }

  // Materials is a nice-to-have; dropping it costs nothing.
  let materials = clampWords(asText(raw.materials), MAX_MATERIALS_CHARS);
  const materialsViolation = scriptViolation("materials", materials);
  if (materialsViolation) {
    repaired.push(materialsViolation);
    materials = "";
  }

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tags = sanitizeTags(rawTags);
  const droppedForScript = rawTags.find(
    (t): t is string => typeof t === "string" && findForbiddenScript(t) !== null,
  );
  if (droppedForScript) {
    const v = scriptViolation("tags", droppedForScript);
    if (v) repaired.push(v);
  }

  // MagSafe: the boolean only survives when the model also names admissible
  // evidence. This is still just the *provisional* signal — `decideMagSafe`
  // makes the call, and requires an independent verifier pass to confirm.
  const magsafeEvidence = coerceMagSafeEvidence(raw.magsafeEvidence);
  const magsafe =
    raw.magsafe === true && ADMISSIBLE_MAGSAFE_EVIDENCE.has(magsafeEvidence);
  const magsafeConfidence: MagSafeConfidence = !magsafe
    ? "none"
    : raw.magsafeConfidence === "high"
      ? "high"
      : "low";

  // Color is a closed vocabulary. Anything the model invents ("chartreuse",
  // "pastel") is dropped rather than persisted as a new facet value.
  const colors = parseColorFamilies(raw.colors, 4);
  const motifs = parseMotifFamilies(raw.motifs, 4);

  const rawPrice =
    typeof raw.suggestedPriceUsd === "number" &&
    Number.isFinite(raw.suggestedPriceUsd)
      ? raw.suggestedPriceUsd
      : DEFAULT_PRICE_USD;
  const suggestedPriceUsd = Math.min(
    MAX_PRICE_USD,
    Math.max(MIN_PRICE_USD, Math.round(rawPrice * 100) / 100),
  );

  return {
    copy: {
      title,
      description,
      tags,
      category: normalizeCategory(raw.category),
      suggestedPriceUsd,
      altText,
      materials,
      magsafe,
      magsafeConfidence,
      magsafeEvidence,
      colors,
      motifs,
    },
    blocking,
    repaired,
  };
}
