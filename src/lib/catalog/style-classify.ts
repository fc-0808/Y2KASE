/**
 * Per-image Style tagging — the prompt and the offered-set resolution.
 *
 * A photo shows one physical configuration. The vision model names that
 * configuration; {@link normalizeImageStyleTags} then collapses the answer
 * onto the styles this listing actually sells. iPhone cases can ship a grip;
 * AirPods cases never do. One shared classifier with a type-specific rubric
 * is how a phone-case prompt stopped tagging every AirPods photo as universal.
 *
 * Pure — safe to unit-test without a provider.
 */
import {
  AIRPODS_STYLES,
  STYLES,
  normalizeImageStyleTags,
  orderStyles,
} from "../pricing";
import { normalizeOfferedPriceValues } from "./offered-options";
import { priceAxisFor } from "./product-types";

export type StyleClassifyKind = "iphone" | "airpods" | "generic";

export type StyleClassifyContext = {
  productType?: string;
  offeredStyles?: readonly string[];
};

/** Which visual rubric to send, given the listing. */
export function styleClassifyKind(
  productType?: string,
  offered: readonly string[] = [],
): StyleClassifyKind {
  if (productType === "airpod_case") return "airpods";
  if (productType === "iphone_case") return "iphone";
  const hasGrip = offered.some((style) => /grip/i.test(style));
  const hasCharm = offered.some((style) => /charm/i.test(style));
  if (!hasGrip && hasCharm) return "airpods";
  if (hasGrip) return "iphone";
  return "generic";
}

/**
 * The exact strings the model may return, in canonical order.
 *
 * Unknown / grip values cannot hitch onto an AirPods listing because the
 * type's price axis is the allow-list.
 */
export function resolvedOfferedStyles(
  productType?: string,
  offered?: readonly string[],
): string[] {
  if (productType) {
    const stored = normalizeOfferedPriceValues(productType, offered ?? []);
    if (stored.length > 0) return stored;
    const axis = priceAxisFor(productType);
    if (axis && axis.values.length > 0) return [...axis.values];
  }
  if (offered && offered.length > 0) {
    const known = orderStyles(offered);
    return known.length > 0 ? known : [...offered];
  }
  return [...STYLES];
}

/**
 * Positional label sent to the model (`img_1`, `img_2`, …).
 *
 * Long supplier filenames (UUIDs, Chinese stems) are a transcription trap —
 * the model looks at the photo, then misspells the key, and the lookup misses
 * so the photo stays universal. Short monotonic labels cannot be misspelled.
 */
export function styleClassifyLabel(index: number): string {
  return `img_${index + 1}`;
}

function foldLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/\.[a-z0-9]+$/i, "");
}

/**
 * Read the model's answer for one image. Prefers the positional label, then
 * the caller filename / stem, so a model that ignores instructions and keys
 * by the original name still lands.
 */
export function classifiedRawFor(
  parsed: Record<string, unknown>,
  label: string,
  filename?: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(parsed, label)) {
    return parsed[label];
  }
  const folded = new Map<string, unknown>();
  for (const [key, value] of Object.entries(parsed)) {
    folded.set(foldLookupKey(key), value);
  }
  const byLabel = folded.get(foldLookupKey(label));
  if (byLabel !== undefined) return byLabel;
  if (!filename) return undefined;
  const byFile = folded.get(foldLookupKey(filename));
  if (byFile !== undefined) return byFile;
  return undefined;
}

/** Fold a style string so "Case + Charm", "case+charm" and "case and charm" meet. */
export function foldStyleToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\band\b/g, "+")
    .replace(/[^a-z0-9+]+/g, "")
    .replace(/\++/g, "+");
}

const UNIVERSAL_ANSWERS = new Set([
  "null",
  "none",
  "n/a",
  "na",
  "universal",
  "unknown",
  "unclear",
  "unidentifiable",
]);

/**
 * Map a free-text model answer onto one offered style, or null when the
 * model declined / named something this listing does not sell.
 */
export function matchOfferedStyle(
  raw: string,
  offered: readonly string[],
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (UNIVERSAL_ANSWERS.has(trimmed.toLowerCase())) return null;
  const exact = offered.find((style) => style === trimmed);
  if (exact) return exact;
  const folded = foldStyleToken(trimmed);
  if (!folded) return null;
  return offered.find((style) => foldStyleToken(style) === folded) ?? null;
}

function extractStyleStrings(raw: unknown): string[] {
  if (raw == null || raw === false) return [];
  if (typeof raw === "string") return [raw];
  if (typeof raw === "number" || typeof raw === "boolean") return [];
  if (Array.isArray(raw)) return raw.flatMap(extractStyleStrings);
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["style", "value", "label", "name"] as const) {
      if (typeof record[key] === "string") return [record[key]];
    }
  }
  return [];
}

/** Collapse a model answer onto the listing's offered set (at most one tag). */
export function coerceClassifiedStyle(
  raw: unknown,
  offered: readonly string[],
): string[] {
  const candidates = extractStyleStrings(raw)
    .map((tag) => matchOfferedStyle(tag, offered))
    .filter((tag): tag is string => tag != null);
  return normalizeImageStyleTags(candidates, offered);
}

/**
 * System prompt for the vision classifier.
 *
 * The valid-value list is always the listing's offered set — never the full
 * iPhone six — so an AirPods photo cannot be labelled "Case + Grip".
 */
export function buildStyleClassifyPrompt(context: StyleClassifyContext = {}): string {
  const offered = resolvedOfferedStyles(context.productType, context.offeredStyles);
  const kind = styleClassifyKind(context.productType, offered);
  const list = offered.map((style) => `- "${style}"`).join("\n");
  const rubric =
    kind === "airpods"
      ? AIRPODS_RUBRIC
      : kind === "iphone"
        ? iphoneRubric(offered)
        : GENERIC_RUBRIC;

  return `You classify product photos for a kawaii accessories store. Respond in English only.
For EACH image (identified by its img_N label), name the ONE configuration it shows.

Valid style values (use EXACT strings, nothing else):
${list}

${rubric}

If none of those configurations is identifiable — packaging, a texture close-up, a lifestyle shot with the product obscured, two different products, or you cannot tell — return null. Do not guess. Do not invent a style that is not in the list above.

Images in the user message are labelled img_1, img_2, … in the order they appear. Return STRICT JSON keyed by those labels: { "img_1": "Style" | null, "img_2": "Style" | null, ... }
Keys must match the labels exactly. No markdown.`;
}

const AIRPODS_RUBRIC = `This listing is an AirPods / AirPods Pro CASE, not a phone case. There is never a pop grip or MagSafe grip. Never output a grip style.

What counts as a charm on this product:
- a dangling character, plush, bead, crystal, bow or fruit charm
- a metal ring clip / keyring attached to the case
- a wrist strap, beaded lanyard, tassel or chain

What is NOT a charm:
- the case's own moulded loop, hinge, lid or charging-port cutout
- AirPods earbuds sitting in the open case
- a person's fingers, rings or unrelated jewelry

Rules:
- Exactly one value per image: the configuration physically present, counting every accessory attached to the case.
- "Case + Charm": the case is visible AND a charm / ring / strap / lanyard is attached to it or clearly presented as part of the same configuration.
- "Case Only": the case is the product in the photo, with no charm / ring / strap / lanyard attached.
- "Charm Only": the charm / strap / keychain is the subject and the case is absent or only a tiny unreadable fragment. A photo of the case with a charm hanging off it is "Case + Charm", never "Charm Only".`;

function iphoneRubric(offered: readonly string[]): string {
  const hasGrip = offered.some((style) => /grip/i.test(style));
  const hasCharm = offered.some((style) => /charm/i.test(style));
  const lines = [
    "This listing is a phone case. Count every accessory that is physically present.",
    "Exactly one value per image.",
  ];
  if (hasGrip && hasCharm) {
    lines.push(
      'A case shown with BOTH a grip and a charm is "Case + Grip + Charm", never a subset.',
    );
  }
  lines.push('Phone case with no grip or charm → "Case Only".');
  if (hasGrip) {
    lines.push('A pop grip / stand on its own → "Grip Only".');
  }
  if (hasCharm) {
    lines.push('A charm or strap on its own → "Charm Only".');
  }
  if (!hasGrip) {
    lines.push("This listing does not ship a grip. Never output a grip style.");
  }
  return lines.join("\n");
}

const GENERIC_RUBRIC = `Count every accessory physically present in the photo. Exactly one value per image — the configuration shown, not a subset of it.`;

/** Default AirPods offered set, for callers that only know the type id. */
export function defaultAirpodsOfferedStyles(): string[] {
  return [...AIRPODS_STYLES];
}
