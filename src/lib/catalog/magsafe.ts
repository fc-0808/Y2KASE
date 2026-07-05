/**
 * MagSafe classification — shared decision + copy logic used by the live ingest,
 * the backfill, and the admin review actions, so every path behaves identically.
 *
 * MagSafe is a *feature* (orthogonal to product type). To avoid mislabelling a
 * case as MagSafe on a single weak guess, we require TWO corroborating signals
 * before auto-applying it; an isolated low-confidence vision guess is parked in
 * a review queue (`products.needs_magsafe_review`) for a human to confirm.
 */

/** Sentence appended to a MagSafe product's description when missing. */
export const MAGSAFE_LINE =
  "MagSafe compatible — snaps to MagSafe chargers and accessories.";

/** How sure the vision model is that the photos show a MagSafe case. */
export type MagSafeConfidence = "high" | "low" | "none";

/** What to do with a product's MagSafe status. */
export type MagSafeDecision = "confirmed" | "review" | "none";

/**
 * Combine the available signals into a decision:
 *  - `confirmed` — auto-apply MagSafe. Requires either TWO signals (vision says
 *    yes AND a textual mention in title/folder), a single HIGH-confidence visual
 *    (a clearly-visible magnetic ring / MagSafe label), or an authoritative
 *    human/AI-written title that already says MagSafe.
 *  - `review` — a lone low-confidence vision guess. Queue it; don't touch copy.
 *  - `none` — not MagSafe.
 */
export function decideMagSafe(signals: {
  vision: boolean;
  confidence: MagSafeConfidence;
  textual: boolean;
}): MagSafeDecision {
  const { vision, confidence, textual } = signals;
  if (vision && textual) return "confirmed"; // two independent signals
  if (vision && confidence === "high") return "confirmed"; // strong single visual
  if (textual && !vision) return "confirmed"; // title explicitly says MagSafe
  if (vision) return "review"; // lone low-confidence guess
  return "none";
}

/** True when any of the given strings mentions MagSafe. */
export function hasTextualMagSafe(
  ...values: (string | null | undefined)[]
): boolean {
  return values.some((v) => !!v && /mag\s?-?safe/i.test(v));
}

/**
 * Idempotently fold MagSafe into a product's copy: ensure the title and
 * description mention it and the `magsafe` tag is present. Returns the updated
 * fields and whether anything changed (so callers can skip no-op writes).
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
    title = `${title} — MagSafe`;
    changed = true;
  }
  if (!/magsafe/i.test(description)) {
    description = description
      ? `${description}\n\n${MAGSAFE_LINE}`
      : MAGSAFE_LINE;
    changed = true;
  }
  if (!tags.includes("magsafe")) {
    tags.push("magsafe");
    changed = true;
  }
  return { title, description, tags, changed };
}

/** The exact title suffix {@link applyMagSafeCopy} appends. */
export const MAGSAFE_TITLE_SUFFIX = " — MagSafe";

/**
 * Inverse of {@link applyMagSafeCopy}: remove the MagSafe classification we
 * added — strip the appended title suffix + description line and drop the
 * `magsafe` tag. Used by "Dismiss" so a false positive is fully undone.
 * Only removes OUR markers, so a title that genuinely contained MagSafe
 * mid-sentence is left intact (the tag/collection still get cleared by caller).
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
  let title = input.title;
  let description = input.description ?? "";
  const tags = input.tags.filter((t) => t !== "magsafe");
  let changed = tags.length !== input.tags.length;

  if (title.endsWith(MAGSAFE_TITLE_SUFFIX)) {
    title = title.slice(0, -MAGSAFE_TITLE_SUFFIX.length).trimEnd();
    changed = true;
  }
  if (description.includes(MAGSAFE_LINE)) {
    description = description
      .replace(MAGSAFE_LINE, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    changed = true;
  }
  return { title, description, tags, changed };
}
