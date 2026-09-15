"use client";

/**
 * PDP variation pickers.
 *
 * A phone case is sold across the current iPhone lineup and up to six styles.
 * Rendered as one flat wrap of pills — which is what this used to be — that's
 * a stack of tap targets that pushes Add to Bag off the screen and hides the
 * fact that Style is what moves the price.
 *
 * So each axis gets the shape that fits it:
 *
 *  • Model — two tiers. A generation segment (13/14 · 15 · 16 · 17 · 18)
 *    narrows the lineup to a few SKUs, then a tier row picks base / Pro /
 *    Pro Max (a generation that ships without a base model simply omits it).
 *    The shopper knows both halves of their answer before they look, so it
 *    reads as two taps rather than a scan of near-identical strings. Moving
 *    between generations preserves the tier: a Pro Max owner who taps "16"
 *    lands on iPhone 16 Pro Max, not iPhone 16.
 *
 *  • Style — a card grid carrying each bundle's real price. Style *is* the
 *    price axis, and pricing it inline turns a blind choice into a comparison.
 *
 *  • AirPods Model — pills with the repeated "AirPods" prefix stripped, and a
 *    note when the 4/5 shared mould is offered so a shopper with AirPods 5
 *    does not hunt for a chip that isn't there.
 *
 * Any other axis (future product types) falls back to plain pills, so this
 * component stays safe to render for anything the catalogue grows.
 *
 * Both pickers are native radio groups: arrow-key traversal, checked state and
 * grouping come from the platform. The selected look is driven by the
 * `checked` value already flowing through props rather than a `peer-checked`
 * selector — see `OptionCard` for why.
 */

import { useMemo } from "react";
import {
  MODEL_OPTION_NAME,
  STYLE_OPTION_NAME,
  defaultStyleFor,
  groupModelsByGeneration,
  modelTier,
  type IphoneGeneration,
} from "@/lib/pricing";
import {
  AIRPODS_4_5,
  AIRPODS_MODEL_OPTION_NAME,
  AIRPODS_SHARED_FIT_NOTE,
  airpodsChipLabel,
  offersAirpods45,
} from "@/lib/catalog/airpods";
import { cn, formatPrice } from "@/lib/utils";

export type ProductOption = { id: number; name: string; values: string[] };

export function ProductOptions({
  options,
  selected,
  onSelect,
  currency,
  priceForStyle,
}: {
  options: ProductOption[];
  selected: Record<string, string>;
  onSelect: (optionName: string, value: string) => void;
  currency: string;
  /** Supplied only for product types whose price is driven by the style axis. */
  priceForStyle?: (style: string) => number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {options.map((opt) => {
        const shared = {
          optionId: opt.id,
          name: opt.name,
          values: opt.values,
          value: selected[opt.name] ?? "",
          onSelect: (value: string) => onSelect(opt.name, value),
        };

        // An axis with one value isn't a choice. Rendering it as a control
        // invites a tap that can't do anything; the header alone still tells
        // the shopper exactly what they're buying.
        if (opt.values.length <= 1)
          return (
            <div key={opt.id}>
              <FieldHeader
                id={`option-${opt.id}-label`}
                label={opt.name}
                value={shared.value}
                className="mb-0"
              />
              {opt.name === AIRPODS_MODEL_OPTION_NAME ? (
                <AirpodsFitNote values={opt.values} />
              ) : null}
            </div>
          );

        if (opt.name === MODEL_OPTION_NAME)
          return <ModelPicker key={opt.id} {...shared} />;

        if (opt.name === STYLE_OPTION_NAME)
          return (
            <StylePicker
              key={opt.id}
              {...shared}
              currency={currency}
              priceForStyle={priceForStyle}
            />
          );

        if (opt.name === AIRPODS_MODEL_OPTION_NAME)
          return <AirpodsModelPicker key={opt.id} {...shared} />;

        return <ChipPicker key={opt.id} {...shared} />;
      })}
    </div>
  );
}

type PickerProps = {
  optionId: number;
  name: string;
  values: string[];
  value: string;
  onSelect: (value: string) => void;
};

// ─── Model ───────────────────────────────────────────────────────────────────

/** "iPhone 13 / 14" → "13 / 14": the axis label already says "iPhone". */
function generationLabel(group: IphoneGeneration): string {
  return group.label.replace(/^iPhone\s*/i, "");
}

/**
 * Labels for one generation's models: "Standard · Pro · Pro Max". The exact
 * model is already spelled out in the field header, so repeating the numeral
 * here would only echo the generation segment sitting directly above it.
 *
 * Falls back to full names whenever tiers don't identify a group's models
 * uniquely — the case that matters is the "Other models" bucket, where two
 * unrecognized models would both read "Standard".
 */
function tierLabels(models: string[]): string[] {
  const labels = models.map((model) => {
    const tier = modelTier(model);
    if (tier === "pro-max") return "Pro Max";
    if (tier === "pro") return "Pro";
    return "Standard";
  });
  if (new Set(labels).size === labels.length) return labels;
  return models.map((model) => model.replace(/^iPhone\s*/i, "") || model);
}

/**
 * Indexed by how many cards sit in a row — Tailwind needs whole class names,
 * not a computed `grid-cols-${n}`, so every column count the tier row (and
 * generation rows of four or fewer) ever renders is spelled out here.
 */
const GRID_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/**
 * Generation chips have to keep growing (15, 16, 17, 18, …) without crowding
 * "13 / 14" off a phone. Four-or-fewer stay one equal row; five-plus wrap
 * 3-up on small screens and 5-up from `sm`.
 */
function generationGridClass(count: number): string {
  if (count <= 4) return GRID_COLUMNS[count] ?? "grid-cols-4";
  return "grid-cols-3 sm:grid-cols-5";
}

function ModelPicker({ optionId, name, values, value, onSelect }: PickerProps) {
  const labelId = `option-${optionId}-label`;
  const groups = useMemo(() => groupModelsByGeneration(values), [values]);
  const active = groups.find((g) => g.models.includes(value)) ?? groups[0];

  // Keep the shopper's tier when they change generation, so the second tap is
  // usually unnecessary rather than mandatory.
  function selectGeneration(group: IphoneGeneration) {
    const tier = modelTier(value);
    onSelect(group.models.find((m) => modelTier(m) === tier) ?? group.models[0]);
  }

  if (!active) return null;

  const labels = tierLabels(active.models);

  return (
    <div>
      <FieldHeader id={labelId} label={name} value={value} />

      {groups.length > 1 && (
        <div
          role="group"
          aria-label="iPhone series"
          className={cn("grid gap-2", generationGridClass(groups.length))}
        >
          {groups.map((group) => {
            const isActive = group.id === active.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => selectGeneration(group)}
                aria-pressed={isActive}
                aria-label={group.label}
                // Same card look as the tier and style pickers below (border,
                // radius, selected shadow) even though this toggles a step
                // *above* the actual "iPhone Model" value rather than being
                // one of its radio options — the three rows read as one
                // design language only if their chips are styled identically.
                className={cn(
                  "min-h-11 truncate rounded-2xl border px-2 py-2.5 text-center text-sm font-bold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                  isActive
                    ? "chip-shelf border-transparent text-white"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/65 hover:border-[var(--primary)]/60 hover:text-[var(--foreground)]",
                )}
              >
                {generationLabel(group)}
              </button>
            );
          })}
        </div>
      )}

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={cn(
          "grid gap-2",
          // Narrowed products can offer a single tier within a series; a lone
          // chip stranded at a third of the row reads as a rendering fault.
          GRID_COLUMNS[Math.min(active.models.length, 3)] ?? "grid-cols-3",
          groups.length > 1 && "mt-2",
        )}
      >
        {active.models.map((model, i) => (
          <OptionCard
            key={model}
            group={`option-${optionId}`}
            value={model}
            checked={value === model}
            onSelect={onSelect}
            // The chip reads "Standard" but means "iPhone 15", so the spoken
            // name has to carry both: an accessible name that dropped the
            // visible word would leave voice control with nothing to match
            // (WCAG 2.5.3). "Pro" and "Pro Max" are already inside the model
            // name, so they don't get the redundant prefix.
            srLabel={model.includes(labels[i]) ? model : `${labels[i]} — ${model}`}
            className="min-h-11 items-center justify-center py-2 text-center"
          >
            <span className="truncate text-sm font-bold leading-tight">
              {labels[i]}
            </span>
          </OptionCard>
        ))}
      </div>
    </div>
  );
}

// ─── Style ───────────────────────────────────────────────────────────────────

function StylePicker({
  optionId,
  name,
  values,
  value,
  onSelect,
  currency,
  priceForStyle,
}: PickerProps & {
  currency: string;
  priceForStyle?: (style: string) => number;
}) {
  const labelId = `option-${optionId}-label`;
  // Everything is quoted against the style the page opens on — the same one
  // the listing's "from" price advertises — so the numbers here never move
  // when the shopper changes their mind. The running total lives in one place:
  // the headline price above, which tracks the selection.
  const basePrice = priceForStyle?.(defaultStyleFor(values));

  return (
    <div>
      <FieldHeader id={labelId} label={name} value={value} />
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
      >
        {values.map((style) => {
          const note = priceNote(priceForStyle?.(style), basePrice, currency);
          const isSelected = value === style;
          return (
            <OptionCard
              key={style}
              group={`option-${optionId}`}
              value={style}
              checked={isSelected}
              onSelect={onSelect}
              srLabel={note ? `${style}, ${note.spoken}` : style}
              className="min-h-11 flex-row items-center justify-between gap-1 px-2 py-2"
            >
              {/* Wraps rather than truncates: at this leading two lines still
                  fit inside the 44px touch target, and "Case + Grip + Char…"
                  hides exactly the word that justifies the upsell. */}
              <span className="text-xs font-bold leading-tight">{style}</span>
              {note && (
                // Dimmed against the card, but full-strength white once the
                // card is filled with brand pink — white-on-pink is already
                // only ~3:1, and knocking it back with opacity would leave the
                // price barely readable at 11px.
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-bold tabular-nums",
                    // /70 is the lightest this can go and still clear 4.5:1
                    // against the card at 11px.
                    !isSelected && "text-[var(--foreground)]/70",
                  )}
                >
                  {note.label}
                </span>
              )}
            </OptionCard>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What a style costs, in as few characters as will fit beside its name.
 *
 * Upgrades read as the difference ("+$10") — that's the number a shopper is
 * actually weighing, and it keeps the longest labels on one line. Anything at
 * or below the entry price is quoted in full instead: "Charm Only −$12.00"
 * would be arithmetic, where "$12.99" is just the price.
 */
function priceNote(
  price: number | undefined,
  basePrice: number | undefined,
  currency: string,
): { label: string; spoken: string } | null {
  if (price === undefined) return null;
  const full = formatPrice(price, currency);
  if (basePrice === undefined || price <= basePrice)
    return { label: full, spoken: full };

  const delta = trimWholeAmount(formatPrice(price - basePrice, currency));
  return { label: `+${delta}`, spoken: `${full}, ${delta} more` };
}

/** "$10.00" → "$10", leaving amounts that do have cents ("$12.99") alone. */
function trimWholeAmount(formatted: string): string {
  return formatted.replace(/([.,])00\b/, "");
}

// ─── Fallback ────────────────────────────────────────────────────────────────

function ChipPicker({ optionId, name, values, value, onSelect }: PickerProps) {
  const labelId = `option-${optionId}-label`;

  return (
    <div>
      <FieldHeader id={labelId} label={name} value={value} />
      <ChipRow
        optionId={optionId}
        labelId={labelId}
        values={values}
        value={value}
        onSelect={onSelect}
      />
    </div>
  );
}

/**
 * AirPods chips drop the repeated "AirPods" prefix (the axis already says
 * that) and spell out the 4/5 shared mould so a shopper with AirPods 5 does
 * not hunt for a chip that isn't there.
 */
function AirpodsModelPicker({
  optionId,
  name,
  values,
  value,
  onSelect,
}: PickerProps) {
  const labelId = `option-${optionId}-label`;

  return (
    <div>
      <FieldHeader id={labelId} label={name} value={value} />
      <ChipRow
        optionId={optionId}
        labelId={labelId}
        values={values}
        value={value}
        onSelect={onSelect}
        labelFor={airpodsChipLabel}
      />
      <AirpodsFitNote values={values} />
    </div>
  );
}

function ChipRow({
  optionId,
  labelId,
  values,
  value,
  onSelect,
  labelFor,
}: {
  optionId: number;
  labelId: string;
  values: string[];
  value: string;
  onSelect: (value: string) => void;
  labelFor?: (value: string) => string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex flex-wrap gap-2"
    >
      {values.map((option) => (
        <OptionCard
          key={option}
          group={`option-${optionId}`}
          value={option}
          checked={value === option}
          onSelect={onSelect}
          srLabel={option}
          className="items-center justify-center px-4 py-2 text-center"
          rounded="rounded-full"
        >
          <span className="text-sm font-semibold">
            {labelFor ? labelFor(option) : option}
          </span>
        </OptionCard>
      ))}
    </div>
  );
}

function AirpodsFitNote({ values }: { values: readonly string[] }) {
  if (!offersAirpods45(values)) return null;
  return (
    <p className="mt-2 text-xs leading-relaxed text-[var(--foreground)]/55">
      {AIRPODS_SHARED_FIT_NOTE} Pick{" "}
      <span className="font-semibold text-[var(--foreground)]/70">
        {AIRPODS_4_5}
      </span>{" "}
      if you own either.
    </p>
  );
}

// ─── Shared parts ────────────────────────────────────────────────────────────

function FieldHeader({
  id,
  label,
  value,
  className,
}: {
  id: string;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-2 flex items-baseline justify-between gap-3", className)}
    >
      <p id={id} className="text-sm font-bold">
        {label}
      </p>
      {value && (
        <p className="min-w-0 truncate text-sm text-[var(--foreground)]/70">
          {value}
        </p>
      )}
    </div>
  );
}

/**
 * One selectable variation. The radio is visually hidden but still the real
 * control — it owns focus, keyboard traversal and the checked state, so
 * nothing here re-implements what a radio group already does correctly. Only
 * the focus ring reads the input via `peer-focus-visible`; the selected look
 * itself branches on the `checked` prop directly rather than `peer-checked`,
 * since it needs to pick between two different class strings (not just add
 * one), which a CSS-only peer selector can't express as cleanly as the JS
 * that's already tracking the value.
 */
function OptionCard({
  group,
  value,
  checked,
  onSelect,
  srLabel,
  className,
  rounded = "rounded-2xl",
  children,
}: {
  group: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  srLabel: string;
  className?: string;
  rounded?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block h-full cursor-pointer">
      <input
        type="radio"
        name={group}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        aria-label={srLabel}
        className="peer sr-only"
      />
      <span
        className={cn(
          "flex h-full flex-col border transition",
          checked
            ? // `.chip-shelf` paints the fill and its "pressed" shelf as one
              // gradient rather than a fill plus a `box-shadow` copy behind
              // it. These chips size off an `fr` grid track, which is
              // routinely a fractional device-pixel width — enough for the
              // browser to rasterize the fill's rounded corner and the
              // box-shadow's rounded corner a pixel apart, leaving a hairline
              // seam of the page between them. One gradient, one shape, one
              // anti-aliasing pass: nothing left to fall out of alignment.
              "chip-shelf border-transparent text-white"
            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/60",
          "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] peer-focus-visible:ring-offset-2",
          rounded,
          className,
        )}
      >
        {children}
      </span>
    </label>
  );
}
