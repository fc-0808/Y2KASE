/**
 * AirPods fit registry — the compatibility axis for `airpod_case`.
 *
 * iPhone cases live in `pricing.ts` because the model list sits next to the
 * style/price table. AirPods styles share that same table (the charm trio
 * only — no grip); the mould list lives here so fit aliases cannot drift.
 * The product-type config in `airpod-case.ts` reads both. One source of
 * truth: ingest, the PDP, the backfill, FAQ copy and support AI all import
 * from this file.
 *
 * Shared moulds are a single selectable value, matching the existing
 * `"AirPods 1 / 2"` convention. AirPods 4 and AirPods 5 have the same
 * dimensions, so they are one chip — `"AirPods 4 / 5"` — not two SKUs that
 * happen to ship the same shell.
 */

/** Option axis name — the `product_options.name` value in the DB. */
export const AIRPODS_MODEL_OPTION_NAME = "AirPods Model";

/**
 * Canonical value for the AirPods 4 / AirPods 5 shared mould.
 *
 * Never store `"AirPods 4"` or `"AirPods 5"` as their own option values:
 * those are aliases of this string (see {@link canonicalizeAirpodsModel}).
 */
export const AIRPODS_4_5 = "AirPods 4 / 5";

/**
 * Shopper-facing sentence for the shared 4/5 mould. FAQ, PDP and support
 * copy interpolate this so the claim cannot drift.
 */
export const AIRPODS_SHARED_FIT_NOTE =
  "AirPods 4 and AirPods 5 share a case.";

/**
 * Selectable AirPods fits, newest / highest-intent first.
 *
 * Pro is a different shell from the numbered AirPods line. 4 and 5 are one
 * mould; 1 and 2 are one mould. A listing may offer a subset (a Pro-only
 * case must not grow a 4/5 chip just because 5 launched).
 *
 * AirPods Max is not in this catalogue yet — see
 * {@link AIRPODS_UNAVAILABLE_MODELS}.
 */
export const AIRPODS_MODELS = [
  "AirPods Pro 3",
  "AirPods Pro 2",
  AIRPODS_4_5,
  "AirPods 3",
  "AirPods 1 / 2",
] as const;

export type AirpodsModel = (typeof AIRPODS_MODELS)[number];

/**
 * Fits we do not sell. Dropped on canonicalize / normalize so a leftover DB
 * chip, a hand-edited extra, or a stale ISR payload cannot put Max back on
 * the picker. Re-add the value to {@link AIRPODS_MODELS} (and remove it here)
 * when a Max shell actually ships.
 */
export const AIRPODS_UNAVAILABLE_MODELS = ["AirPods Max"] as const;

const AIRPODS_MODEL_SET = new Set<string>(AIRPODS_MODELS);
const AIRPODS_UNAVAILABLE_SET = new Set<string>(AIRPODS_UNAVAILABLE_MODELS);

/**
 * Fold whitespace / slash / ampersand noise so `"AirPods 4/5"` and
 * `"AirPods 4 / 5"` compare as the same token stream.
 */
function compactAirpodsToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s/&]+/g, " ")
    .trim();
}

/**
 * True when a stored or typed value names the AirPods 4 and/or 5 mould,
 * including the historical `"AirPods 4"` chip and a shopper typing
 * `"AirPods 5"`.
 *
 * Pro / 3 / 1 / 2 must never match: `"AirPods Pro 2"` contains a `2`
 * but is a different shell, and `"AirPods 1 / 2"` is the other shared mould.
 */
function isAirpods45Alias(raw: string): boolean {
  const compact = compactAirpodsToken(raw);
  return (
    compact === "airpods 4" ||
    compact === "airpods 5" ||
    compact === "airpods 4 5" ||
    compact === "airpods 5 4" ||
    compact === "airpods 4 and 5" ||
    compact === "airpods 5 and 4"
  );
}

/**
 * Map a stored or typed AirPods model onto the canonical chip label.
 *
 * Unrecognized values pass through so a hand-edited row cannot lose a fit
 * the listing actually sells.
 */
export function canonicalizeAirpodsModel(raw: string): string {
  const folded = raw.trim().replace(/\s+/g, " ");
  if (!folded) return folded;
  if (AIRPODS_UNAVAILABLE_SET.has(folded)) return "";
  if (AIRPODS_MODEL_SET.has(folded)) return folded;
  if (isAirpods45Alias(folded)) return AIRPODS_4_5;
  return folded;
}

/**
 * Sort an offered set into master order, then append anything the master
 * list has never heard of (a future mould, a hand edit) so it stays pickable.
 */
export function orderAirpodsModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = AIRPODS_MODELS.filter((model) => {
    if (!models.includes(model) || seen.has(model)) return false;
    seen.add(model);
    return true;
  });
  for (const model of models) {
    if (!model || seen.has(model) || AIRPODS_UNAVAILABLE_SET.has(model)) {
      continue;
    }
    seen.add(model);
    ordered.push(model);
  }
  return ordered;
}

/** The full default axis written onto a newly ingested AirPods case. */
export function defaultAirpodsModels(): string[] {
  return [...AIRPODS_MODELS];
}

/**
 * Canonicalize aliases, collapse the 4/5 mould to one value, and restore
 * master order.
 *
 * Additive on the shared mould only: a list that already names 4 or 5
 * becomes `"AirPods 4 / 5"`; a Pro-only list stays Pro-only. An empty list
 * stays empty — callers that mean "give this listing the full lineup" pass
 * {@link defaultAirpodsModels} themselves (the backfill, when the axis is
 * missing).
 */
export function extendAirpodsSharedFits(models: readonly string[]): string[] {
  const canonical: string[] = [];
  const seen = new Set<string>();
  for (const raw of models) {
    const model = canonicalizeAirpodsModel(raw);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    canonical.push(model);
  }
  return orderAirpodsModels(canonical);
}

/**
 * The model a product page opens on: first offered value in master order
 * (Pro 3 when the full lineup is present). Launch traffic for a numbered
 * AirPods still finds 4/5 on the chip row; Pro owners land on Pro.
 */
export function defaultAirpodsModelFor(models: readonly string[]): string {
  const ordered = orderAirpodsModels(models.map(canonicalizeAirpodsModel));
  if (ordered.length > 0) return ordered[0] ?? "";
  return AIRPODS_MODELS[0] ?? "";
}

/** Chip label with the axis name stripped — `"AirPods 4 / 5"` → `"4 / 5"`. */
export function airpodsChipLabel(value: string): string {
  return value.replace(/^AirPods\s+/i, "").trim() || value;
}

export function offersAirpods45(models: readonly string[]): boolean {
  return models.some((model) => canonicalizeAirpodsModel(model) === AIRPODS_4_5);
}

// Fail fast at module load if the canonical 4/5 chip drifts out of the master list.
if (process.env.NODE_ENV !== "production") {
  if (!AIRPODS_MODEL_SET.has(AIRPODS_4_5)) {
    throw new Error(
      `AIRPODS_MODELS is missing the shared mould ${JSON.stringify(AIRPODS_4_5)}`,
    );
  }
  if (AIRPODS_MODEL_SET.has("AirPods 4") || AIRPODS_MODEL_SET.has("AirPods 5")) {
    throw new Error(
      'AIRPODS_MODELS must not list "AirPods 4" or "AirPods 5" as their own chips — they share a mould',
    );
  }
  for (const retired of AIRPODS_UNAVAILABLE_MODELS) {
    if (AIRPODS_MODEL_SET.has(retired)) {
      throw new Error(
        `AIRPODS_MODELS must not list unavailable mould ${JSON.stringify(retired)}`,
      );
    }
  }
}
