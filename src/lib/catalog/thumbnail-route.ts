/**
 * Which thumbnail engine a product is allowed to spend money on.
 *
 * Nano Banana Pro (the generative cleanup) is billed per output image — about
 * $0.09 at 1K or 2K on KIE, and 1K is not cheaper than 2K. The final file is a
 * 1024px WebP, so the bill is not buying resolution we keep. It is buying a
 * repaint. A repaint is the right tool when a hand, a prop, or a scene has to
 * disappear. It is the wrong tool when a gallery already contains a clean
 * product on a plain white backdrop: Sharp can trim and center that shot, the
 * pixels stay the supplier's, and the charge is zero.
 *
 * The gate fails open toward the generative engine. A vision outage, a low
 * score, or a backdrop we are not willing to trim all still take the paid
 * path, which is the previous behavior. Skipping Pro is allowed only when both
 * the classifier and the pixel probe agree.
 *
 * Pure: no Sharp, no network. Safe to import from the light admin module.
 */

export const RETRIES_EXHAUSTED_MARK = "[retries exhausted]";

/**
 * Floor for the free path. The scorer's own rubric puts `clean_product` at
 * 0.8–1.0 and `has_props` up to 0.6, so 0.6 would let a propped shot through.
 */
export const LOCAL_FRAMING_MIN_SCORE = 0.8;

export type ThumbnailEngine = "local" | "generative";

export type FramingScore = {
  score: number;
  category: string;
  cleanProductShot: boolean;
};

/** How many times a system failure may run before Generate all leaves it. */
export function maxAutoAttempts(): number {
  const v = Number(process.env.THUMBNAIL_MAX_ATTEMPTS);
  return Number.isFinite(v) && v >= 1 && v <= 5 ? Math.floor(v) : 2;
}

/**
 * Escape hatch. "true" bills Nano Banana Pro for every product, which is the
 * pre-cascade behavior. Anything else (including unset) keeps the free path.
 */
export function forceGenerativeThumbnails(): boolean {
  return process.env.THUMBNAIL_FORCE_GENERATIVE === "true";
}

/**
 * The classifier's half of the free-path gate. A hand-held shot can sit on a
 * perfectly white backdrop and still must not be trimmed — the hand is part
 * of the foreground. Both the category and the boolean are required because
 * a model will occasionally set one without the other.
 */
export function prefersLocalFraming(score: FramingScore | undefined): boolean {
  if (!score) return false;
  return (
    score.category === "clean_product" &&
    score.cleanProductShot === true &&
    score.score >= LOCAL_FRAMING_MIN_SCORE
  );
}

export function thumbnailEngine(input: {
  score: FramingScore | undefined;
  backdropTrimmable: boolean;
  forceGenerative?: boolean;
}): ThumbnailEngine {
  if (input.forceGenerative) return "generative";
  if (input.backdropTrimmable && prefersLocalFraming(input.score)) return "local";
  return "generative";
}

/** Sentence stored on a locally framed proposal, after the vision note. */
export function localFrameReason(seen: string | null | undefined): string {
  const note = "Framed locally from the clean shot — no generative edit.";
  const clean = seen?.trim();
  if (!clean || clean === "unscored") return note;
  return `${clean} ${note}`;
}

function stripAttemptMarks(message: string): string {
  return message
    .replaceAll(RETRIES_EXHAUSTED_MARK, "")
    .replace(/\[attempt \d+\/\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function attemptSoFar(previous: string | null | undefined): number {
  if (!previous) return 0;
  if (previous.includes(RETRIES_EXHAUSTED_MARK)) return maxAutoAttempts();
  const match = previous.match(/\[attempt (\d+)\/\d+\]/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The reason written when a generation does not produce a proposal.
 *
 * `permanent` (no photos, every photo unreadable) exhausts immediately — a
 * second call cannot succeed until a person uploads something. Transient
 * provider faults get {@link maxAutoAttempts} tries, then the same mark, so
 * Generate all stops re-billing them. A manual Regenerate still works; it does
 * not consult this counter.
 */
export function nextAutoFailureReason(
  previous: string | null | undefined,
  message: string,
  permanent: boolean,
): string {
  const clean = stripAttemptMarks(message) || "Generation failed.";
  const next = attemptSoFar(previous) + 1;
  if (permanent || next >= maxAutoAttempts()) {
    return `${clean} ${RETRIES_EXHAUSTED_MARK}`;
  }
  return `${clean} [attempt ${next}/${maxAutoAttempts()}]`;
}
