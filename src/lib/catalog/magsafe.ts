/**
 * MagSafe classification — shared decision + copy logic used by the live ingest,
 * the backfill, and the admin review actions, so every path behaves identically.
 *
 * MagSafe is a *feature* (orthogonal to product type) that a vision model can
 * only see when the back of the case is photographed clearly. Because a wrong
 * "MagSafe" badge means a customer buys a case that will not charge, this module
 * is deliberately biased towards false negatives: nothing is auto-applied
 * without an independent, high-confidence verification.
 *
 * ── Why the signal shape is what it is ──────────────────────────────────────
 * An earlier version accepted `{ vision, confidence, textual }` and callers
 * populated `textual` with `hasTextualMagSafe(aiCopy.title)`. The copy prompt
 * *instructed* the model to write "MagSafe" into the title whenever it set
 * `magsafe: true`, so `textual` was just `vision` wearing a hat: one guess was
 * counted as two corroborating signals and every guess auto-confirmed. The
 * review queue never fired once across the whole catalogue.
 *
 * {@link MagSafeSignals} therefore names each input by its *provenance*, not by
 * its medium, so a model-derived value can never masquerade as a human one.
 */

/** Tag that marks a product as MagSafe-compatible — the single source of truth. */
export const MAGSAFE_TAG = "magsafe";

/** Sentence appended to a MagSafe product's description when missing. */
export const MAGSAFE_LINE =
  "MagSafe compatible — snaps to MagSafe chargers and accessories.";

/**
 * The two MagSafe compatibility facets, in display order — the storefront's
 * primary categorisation axis (the /collections index and the nav drawer both
 * lead with them).
 *
 * These are catalog QUERIES, not collections: "Non-MagSafe" has no collection
 * row to link to because it is the *negation* of {@link MAGSAFE_TAG}. Both sides
 * are expressed through the tri-state `magsafe` facet on `/products` (see
 * `ProductQuery`), so they live here — beside the tag they are derived from —
 * rather than being restated by each surface that offers the choice.
 */
export const MAGSAFE_FACETS = [
  {
    id: "magsafe",
    label: "MagSafe",
    /** Value of the tri-state `magsafe` facet this tag selects. */
    magsafe: true,
    accentColor: "var(--primary)",
  },
  {
    id: "non-magsafe",
    label: "Non-MagSafe",
    magsafe: false,
    accentColor: "var(--accent)",
  },
] as const;

/**
 * Catalog URL for one side of the MagSafe facet. Built here rather than stored
 * on {@link MAGSAFE_FACETS} so a facet's label and the query it runs cannot
 * disagree; `/products` parses exactly `"true"` / `"false"`.
 */
export function magsafeFacetHref(magsafe: boolean): string {
  return `/products?magsafe=${magsafe}`;
}

/** How sure the vision model is that the photos show a MagSafe case. */
export type MagSafeConfidence = "high" | "low" | "none";

/**
 * The specific thing the model claims to have seen. Requiring the model to name
 * its evidence (rather than just asserting a boolean) both improves calibration
 * and lets us reject verdicts whose stated evidence is not admissible.
 */
export type MagSafeEvidence =
  /** A distinct circular magnet array moulded into the back/inside of the case. */
  | "magnet_ring_visible"
  /** The literal word "MagSafe" printed on the case, packaging or listing art. */
  | "magsafe_text_visible"
  /** A charger/wallet/stand shown snapped on magnetically, with no clip or strap. */
  | "magsafe_accessory_attached"
  /** No admissible evidence — the default. */
  | "none";

/** Evidence values that may support a positive verdict. */
export const ADMISSIBLE_MAGSAFE_EVIDENCE = new Set<MagSafeEvidence>([
  "magnet_ring_visible",
  "magsafe_text_visible",
  "magsafe_accessory_attached",
]);

const ALL_MAGSAFE_EVIDENCE = new Set<string>([
  ...ADMISSIBLE_MAGSAFE_EVIDENCE,
  "none",
]);

/** Narrow untrusted model output to a known evidence value. */
export function coerceMagSafeEvidence(raw: unknown): MagSafeEvidence {
  return typeof raw === "string" && ALL_MAGSAFE_EVIDENCE.has(raw)
    ? (raw as MagSafeEvidence)
    : "none";
}

/** The result of one strict, temperature-0 MagSafe verification pass. */
export type MagSafeVerdict = {
  magsafe: boolean;
  confidence: MagSafeConfidence;
  evidence: MagSafeEvidence;
};

/** A verdict that asserts nothing — used when verification could not run. */
export const NO_MAGSAFE: MagSafeVerdict = {
  magsafe: false,
  confidence: "none",
  evidence: "none",
};

/**
 * Inputs to {@link decideMagSafe}, named by provenance so the two-signal rule
 * cannot be satisfied by one model reading its own output back.
 */
export type MagSafeSignals = {
  /**
   * A HUMAN asserted MagSafe — a listing manifest, an operator edit, a supplier
   * spec sheet. Authoritative: vision cannot see a magnet ring that the seller
   * simply did not photograph.
   *
   * Never populate this from generated copy.
   */
  human: boolean;
  /**
   * Verdict from the dedicated, temperature-0 verification pass
   * (`verifyMagSafe`). Undefined when verification was skipped or errored.
   */
  verifier?: MagSafeVerdict;
  /**
   * The MagSafe flag that came back from the creative copy pass. It shares a
   * call with title/description generation and is measurably over-eager, so it
   * is treated only as a cheap recall filter: enough to *trigger* verification,
   * never enough to confirm on its own.
   */
  provisional?: boolean;
};

/** What to do with a product's MagSafe status. */
export type MagSafeDecision = "confirmed" | "review" | "none";

/**
 * Route a product to its MagSafe terminal state.
 *
 *  - `confirmed` — auto-apply. A human said so, or the strict verifier saw
 *    unmistakable evidence.
 *  - `review` — plausible but unproven. Queue it (`products.needs_magsafe_review`)
 *    and leave the live copy alone.
 *  - `none` — not MagSafe.
 *
 * Fails closed: with no verifier verdict, a provisional flag can reach `review`
 * at most. There is no path from model output alone to `confirmed`.
 */
export function decideMagSafe(signals: MagSafeSignals): MagSafeDecision {
  const { human, verifier, provisional } = signals;

  if (human) return "confirmed";

  if (verifier) {
    if (!verifier.magsafe) return "none"; // the verifier actively vetoed it
    if (!ADMISSIBLE_MAGSAFE_EVIDENCE.has(verifier.evidence)) return "review";
    return verifier.confidence === "high" ? "confirmed" : "review";
  }

  return provisional ? "review" : "none";
}

/** Matches any spelling of a MagSafe mention: "MagSafe", "Mag Safe", "mag-safe". */
const MAGSAFE_MENTION = /mag\s?-?safe/i;

/** True when any of the given strings mentions MagSafe. */
export function hasTextualMagSafe(
  ...values: (string | null | undefined)[]
): boolean {
  return values.some((v) => !!v && MAGSAFE_MENTION.test(v));
}

/** Collapse the whitespace and dangling punctuation left behind by a removal. */
function tidyAfterRemoval(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[(\[]\s*[)\]]/g, "")
    .replace(/^[\s,;:—–-]+/, "")
    .replace(/[\s,;:—–-]+$/, "")
    .trim();
}

/**
 * Idempotently fold MagSafe into a product's copy: ensure the title and
 * description mention it and the `magsafe` tag is present. Returns the updated
 * fields and whether anything changed (so callers can skip no-op writes).
 *
 * This is the ONLY place MagSafe wording enters product copy. The generation
 * prompt is explicitly forbidden from writing it, which keeps the flag and the
 * prose from becoming circular evidence for one another.
 */
export function applyMagSafeCopy(input: {
  title: string;
  description: string | null;
  tags: string[];
}): {
  title: string;
  description: string;
  tags: string[];
  changed: boolean;
} {
  let title = input.title;
  let description = input.description ?? "";
  const tags = [...input.tags];
  let changed = false;

  if (!/magsafe/i.test(title)) {
    title = `${title}${MAGSAFE_TITLE_SUFFIX}`;
    changed = true;
  }
  if (!/magsafe/i.test(description)) {
    description = description
      ? `${description}\n\n${MAGSAFE_LINE}`
      : MAGSAFE_LINE;
    changed = true;
  }
  if (!tags.includes(MAGSAFE_TAG)) {
    tags.push(MAGSAFE_TAG);
    changed = true;
  }
  return { title, description, tags, changed };
}

/** The exact title suffix {@link applyMagSafeCopy} appends. */
export const MAGSAFE_TITLE_SUFFIX = " — MagSafe";

/**
 * Remove every MagSafe claim from a title: our own appended suffix, the
 * "… with MagSafe" / "(MagSafe)" / "MagSafe-compatible" phrasings, and bare
 * adjectival use ("Clear MagSafe iPhone Case").
 */
function stripMagSafeFromTitle(title: string): string {
  let out = title;
  if (out.endsWith(MAGSAFE_TITLE_SUFFIX)) {
    out = out.slice(0, -MAGSAFE_TITLE_SUFFIX.length);
  }
  out = out
    .replace(/[\s—–-]*[([]\s*mag\s?-?safe[^)\]]*[)\]]/gi, "")
    .replace(/[\s—–-]*\bwith\s+mag\s?-?safe\b(\s+compatib\w*)?/gi, "")
    .replace(/[\s—–-]*\bmag\s?-?safe[\s-]*compatib\w*/gi, "")
    .replace(/\bmag\s?-?safe\b/gi, "");
  return tidyAfterRemoval(out);
}

/**
 * Remove every MagSafe claim from a description: our own appended line, any
 * `#magsafe` hashtag, and any remaining sentence that makes the claim.
 * Paragraph breaks are preserved.
 */
function stripMagSafeFromDescription(description: string): string {
  const withoutHashtags = description
    .replace(MAGSAFE_LINE, "")
    .replace(/#mag\s?-?safe\b/gi, "");

  return withoutHashtags
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !MAGSAFE_MENTION.test(sentence))
        .join(" ")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n")
    .trim();
}

/**
 * Inverse of {@link applyMagSafeCopy}: fully undo a MagSafe classification —
 * drop the `magsafe` tag and remove every MagSafe claim from the copy. Used by
 * "Dismiss" and by the re-validation backfill when the verifier vetoes a
 * product.
 *
 * This strips MagSafe wherever it appears, not just the suffix we appended.
 * Being conservative here was a bug: the old copy prompt wrote "MagSafe" into
 * titles and descriptions itself, so leaving a mid-sentence mention alone left
 * demoted products advertising a feature we had just decided they do not have —
 * a claim the storefront then makes to customers.
 */
export function removeMagSafeCopy(input: {
  title: string;
  description: string | null;
  tags: string[];
}): {
  title: string;
  description: string;
  tags: string[];
  changed: boolean;
} {
  const tags = input.tags.filter((t) => t !== MAGSAFE_TAG);
  const title = stripMagSafeFromTitle(input.title);
  const description = stripMagSafeFromDescription(input.description ?? "");

  const changed =
    tags.length !== input.tags.length ||
    title !== input.title ||
    description !== (input.description ?? "");

  return { title, description, tags, changed };
}
