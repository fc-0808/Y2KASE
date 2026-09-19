"use client";

/**
 * Per-image style assignment, shared by the single-product editor
 * (`/admin/products/[id]`) and the bulk editor's "Edit individually" mode.
 *
 * A photo depicts one physical configuration, so this is a single-select
 * control, not a set of independent toggles — see the "Per-image style tagging"
 * notes in `@/lib/pricing`. Picking a style therefore *replaces* whatever the
 * image was assigned to instead of adding to it.
 *
 * "Universal" is a real, selectable option rather than the absence of a
 * selection: it keeps exactly one choice active at all times, which is what
 * makes the group a genuine radio group (predictable roving focus, no hidden
 * "click the active pill again to clear it" gesture to discover).
 */

import { useRef } from "react";
import {
  imageStyleTag,
  styleTagsFor,
  normalizeImageStyleTags,
} from "@/lib/pricing";

/** Stands in for `null` — a radio option needs a non-empty key. */
const UNIVERSAL = "__universal__";

const SIZES = {
  sm: { pill: "px-1.5 py-0.5 text-[10px]", gap: "gap-1" },
  md: { pill: "px-2 py-0.5 text-[11px]", gap: "gap-1.5" },
} as const;

export function StyleTagPicker({
  styles,
  value,
  onChange,
  label,
  size = "md",
}: {
  /** The styles this product offers, in canonical order. */
  styles: readonly string[];
  /** Currently stored tags. Normalized on read, so any legacy value is safe. */
  value: readonly string[];
  /** Emits the stored form: `[]` for universal, else one style. */
  onChange: (styleTags: string[]) => void;
  /** Identifies the image for screen readers, e.g. its filename. */
  label: string;
  size?: keyof typeof SIZES;
}) {
  const selected = imageStyleTag(value, styles);
  const options: string[] = [UNIVERSAL, ...styles];
  // Always resolves: an unrecognized or dropped tag reads as universal (0).
  const activeIndex = selected ? options.indexOf(selected) : 0;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { pill, gap } = SIZES[size];

  function select(option: string) {
    onChange(styleTagsFor(option === UNIVERSAL ? null : option, styles));
  }

  /** Arrow keys move focus *and* selection, per the WAI-ARIA radio pattern. */
  function moveTo(index: number) {
    const next = (index + options.length) % options.length;
    select(options[next]);
    refs.current[next]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        moveTo(index - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(options.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      role="radiogroup"
      aria-label={`Style shown in ${label}`}
      className={`flex flex-wrap ${gap}`}
    >
      {options.map((option, index) => {
        const isUniversal = option === UNIVERSAL;
        const checked = index === activeIndex;
        return (
          <button
            key={option}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            // Roving tabindex: the group is one tab stop, arrows do the rest.
            tabIndex={checked ? 0 : -1}
            title={
              isUniversal
                ? "Not tied to a variation — an angle, detail or lifestyle shot."
                : `This photo shows ${option}`
            }
            onClick={() => select(option)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`rounded-full border font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 ${pill} ${
              checked
                ? isUniversal
                  ? // Muted when checked so real assignments stay scannable
                    // down a column of a dozen images.
                    "border-[var(--foreground)]/25 bg-[var(--foreground)]/10 text-[var(--foreground)]/70"
                  : "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] text-[var(--foreground)]/70 hover:border-[var(--primary)]"
            }`}
          >
            {isUniversal ? "Universal" : option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Flags offered styles that no photo represents yet. With one style per image,
 * coverage is the thing that's easy to get wrong — an unassigned style falls
 * back to whatever slide the gallery is already on, so the shopper switches
 * variation and sees no change.
 */
export function StyleCoverageHint({
  styles,
  tagsByImage,
}: {
  styles: readonly string[];
  /** Every image's tags, in any (even legacy multi-tag) form. */
  tagsByImage: readonly (readonly string[])[];
}) {
  const covered = new Set<string>(
    tagsByImage.flatMap((tags) => normalizeImageStyleTags(tags, styles)),
  );
  const missing = styles.filter((style) => !covered.has(style));
  if (missing.length === 0) return null;

  // A freshly ingested product has nothing assigned yet — naming all six
  // styles there is noise, so say it once and keep the header readable.
  const everything = missing.length === styles.length;
  const listed =
    missing.length > 3
      ? `${missing.slice(0, 3).join(", ")} +${missing.length - 3} more`
      : missing.join(", ");

  return (
    <p className="text-[11px] text-[var(--foreground)]/55">
      {everything ? (
        "No photo is assigned to a style yet"
      ) : (
        <>
          No photo assigned to{" "}
          <span className="font-semibold text-[var(--foreground)]/75">
            {listed}
          </span>
        </>
      )}
    </p>
  );
}
