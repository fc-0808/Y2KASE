"use client";

/**
 * Multi-product listing flag + custom variation editor.
 *
 * Shared by `/admin/products/[id]` and the bulk editor's "Edit individually"
 * workspace. A listing whose photos depict more than one physical product
 * (two cases, a case plus a separately named charm, …) is flagged here, then
 * each product becomes a named Style value with its own price and linked
 * photo — the same contract as the Etsy bulk listing variation editor.
 */
import Image from "next/image";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Image as ImageIcon,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { STYLE_OPTION_NAME } from "@/lib/pricing";
import { priceAxisFor } from "@/lib/catalog/product-types";
import {
  CUSTOM_STYLE_MAX_COUNT,
  CUSTOM_STYLE_MAX_LABEL,
  customStylePricePresets,
  customStylesNeedPhoto,
  emptyCustomStyleDraft,
  isDevicePricePreset,
  pricesMatch,
  suggestedCustomStylePrice,
  taggingStylesFor,
  type CustomStyle,
  type CustomStylePricePreset,
} from "@/lib/catalog/custom-styles";

export type CustomVariationImage = {
  id: number;
  url: string;
  filename: string | null;
};

export function CustomVariationsEditor({
  flagged,
  onFlagChange,
  customStyles,
  onCustomStylesChange,
  images,
  productType,
  currency,
}: {
  flagged: boolean;
  onFlagChange: (flagged: boolean) => void;
  customStyles: CustomStyle[];
  onCustomStylesChange: (next: CustomStyle[]) => void;
  images: CustomVariationImage[];
  productType: string;
  currency: string;
}) {
  const [pickingId, setPickingId] = useState<string | null>(null);
  const axisName = priceAxisFor(productType)?.name ?? STYLE_OPTION_NAME;
  const pricePresets = useMemo(
    () => customStylePricePresets(productType, currency),
    [productType, currency],
  );
  const missingPhotos = useMemo(
    () => customStylesNeedPhoto(customStyles),
    [customStyles],
  );
  const byId = useMemo(
    () => new Map(images.map((image) => [image.id, image])),
    [images],
  );

  function setFlagged(next: boolean) {
    if (!next && customStyles.length > 0) {
      const ok = window.confirm(
        "Turn off the multi-product flag? Custom variations on this listing will be removed.",
      );
      if (!ok) return;
    }
    onFlagChange(next);
  }

  function patch(id: string, patch: Partial<CustomStyle>) {
    onCustomStylesChange(
      customStyles.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= customStyles.length) return;
    const next = [...customStyles];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onCustomStylesChange(next);
  }

  function addRow() {
    if (customStyles.length >= CUSTOM_STYLE_MAX_COUNT) return;
    onCustomStylesChange([
      ...customStyles,
      emptyCustomStyleDraft(productType, currency),
    ]);
  }

  function removeRow(id: string) {
    onCustomStylesChange(customStyles.filter((row) => row.id !== id));
    if (pickingId === id) setPickingId(null);
  }

  function linkPhoto(customId: string, imageId: number | null) {
    onCustomStylesChange(
      customStyles.map((row) => {
        if (row.id === customId) return { ...row, imageId };
        if (imageId != null && row.imageId === imageId) {
          return { ...row, imageId: null };
        }
        return row;
      }),
    );
    setPickingId(null);
  }

  const picking = pickingId
    ? customStyles.find((row) => row.id === pickingId)
    : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Boxes className="h-4 w-4" /> More than one product
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--foreground)]/60">
            Turn this on when the photos show distinct physical products — two
            cases, or a case and a separately named charm. Each one becomes a{" "}
            {axisName} option with its own price and linked photo.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={flagged}
          aria-label="This listing contains more than one product"
          onClick={() => setFlagged(!flagged)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            flagged ? "bg-[var(--primary)]" : "bg-[var(--border)]"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              flagged ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {flagged && (
        <div className="mt-3 space-y-2">
          {missingPhotos.length > 0 && customStyles.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No photo linked to{" "}
              <span className="font-semibold">
                {missingPhotos.length > 2
                  ? `${missingPhotos.slice(0, 2).join(", ")} +${missingPhotos.length - 2} more`
                  : missingPhotos.join(", ")}
              </span>
            </p>
          )}

          {customStyles.length === 0 && (
            <p className="rounded-xl bg-[var(--muted)] px-3 py-2 text-xs text-[var(--foreground)]/60">
              Add a named variation for each product in this listing, then tap
              its photo to link the matching image.
            </p>
          )}

          <ul className="space-y-2">
            {customStyles.map((row, index) => {
              const photo = row.imageId != null ? byId.get(row.imageId) : null;
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center text-[var(--foreground)]/40">
                      <button
                        type="button"
                        onClick={() => move(index, index - 1)}
                        disabled={index === 0}
                        className="rounded p-0.5 hover:text-[var(--primary)] disabled:opacity-30"
                        aria-label="Move variation up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, index + 1)}
                        disabled={index === customStyles.length - 1}
                        className="rounded p-0.5 hover:text-[var(--primary)] disabled:opacity-30"
                        aria-label="Move variation down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPickingId(row.id)}
                      title="Choose the photo buyers see for this variation"
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)] hover:border-[var(--primary)]"
                    >
                      {photo ? (
                        <Image
                          src={photo.url}
                          alt={photo.filename ?? (row.label || "Variation photo")}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-[var(--foreground)]/40">
                          <ImageIcon className="h-5 w-5" />
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          maxLength={CUSTOM_STYLE_MAX_LABEL}
                          placeholder="e.g. Hello Kitty + Charm"
                          value={row.label}
                          onChange={(event) => {
                            const label = event.target.value;
                            const next: Partial<CustomStyle> = { label };
                            // Keep the typed amount if the operator already left
                            // the type's price table; otherwise follow the name.
                            if (
                              !row.price ||
                              isDevicePricePreset(
                                productType,
                                currency,
                                row.price,
                              )
                            ) {
                              next.price = suggestedCustomStylePrice(
                                productType,
                                currency,
                                label,
                              );
                            }
                            patch(row.id, next);
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-[var(--primary)]"
                          aria-label="Custom variation name"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--foreground)]/45 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${row.label || "custom variation"}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <PricePresetPicker
                        presets={pricePresets}
                        value={row.price}
                        currency={currency}
                        onChange={(price) => patch(row.id, { price })}
                        labelledBy={row.label || "custom variation"}
                      />
                      <label className="flex items-center gap-1.5 text-xs text-[var(--foreground)]/55">
                        <span className="font-semibold">{currency}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={Number.isFinite(row.price) ? row.price : ""}
                          onChange={(event) =>
                            patch(row.id, {
                              price: Number(event.target.value),
                            })
                          }
                          className="w-28 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm tabular-nums outline-none focus:border-[var(--primary)]"
                          aria-label={`Price for ${row.label || "custom variation"}`}
                        />
                        {Number.isFinite(row.price) &&
                          row.price > 0 &&
                          !isDevicePricePreset(
                            productType,
                            currency,
                            row.price,
                          ) && (
                            <span className="tabular-nums">
                              {formatPrice(row.price, currency)} custom
                            </span>
                          )}
                      </label>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={addRow}
            disabled={customStyles.length >= CUSTOM_STYLE_MAX_COUNT}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add custom variation
          </button>
        </div>
      )}

      {picking && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose variation photo"
          onClick={() => setPickingId(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">Link a photo</p>
                <p className="truncate text-xs text-[var(--foreground)]/55">
                  {picking.label || "Untitled variation"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickingId(null)}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)]"
                aria-label="Close photo picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {images.length === 0 ? (
                <p className="text-sm text-[var(--foreground)]/55">
                  This listing has no photos yet.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {images.map((image, index) => {
                    const selected = picking.imageId === image.id;
                    return (
                      <li key={image.id}>
                        <button
                          type="button"
                          onClick={() => linkPhoto(picking.id, image.id)}
                          className={`relative aspect-square w-full overflow-hidden rounded-xl border-2 ${
                            selected
                              ? "border-[var(--primary)]"
                              : "border-transparent hover:border-[var(--primary)]/50"
                          }`}
                        >
                          <Image
                            src={image.url}
                            alt={image.filename ?? `Photo ${index + 1}`}
                            fill
                            sizes="120px"
                            className="object-cover"
                          />
                          <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white">
                            {index + 1}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {picking.imageId != null && (
                <button
                  type="button"
                  onClick={() => linkPhoto(picking.id, null)}
                  className="mt-3 text-xs font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
                >
                  Remove photo link
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PricePresetPicker({
  presets,
  value,
  currency,
  onChange,
  labelledBy,
}: {
  presets: readonly CustomStylePricePreset[];
  value: number;
  currency: string;
  onChange: (price: number) => void;
  labelledBy: string;
}) {
  if (presets.length === 0) return null;
  return (
    <div
      role="radiogroup"
      aria-label={`Price for ${labelledBy}, from this device type`}
      className="flex flex-wrap gap-1"
    >
      {presets.map((preset) => {
        const checked = pricesMatch(value, preset.price);
        const also =
          preset.also.length > 0 ? ` · also ${preset.also.join(", ")}` : "";
        return (
          <button
            key={preset.price}
            type="button"
            role="radio"
            aria-checked={checked}
            title={`${preset.label}${also}: ${formatPrice(preset.price, currency)}`}
            onClick={() => onChange(preset.price)}
            className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 ${
              checked
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] text-[var(--foreground)]/70 hover:border-[var(--primary)]"
            }`}
          >
            <span className={checked ? "text-white/80" : "text-[var(--foreground)]/45"}>
              {preset.label}
            </span>{" "}
            <span className="tabular-nums">
              {formatPrice(preset.price, currency)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Offered set the media tagger should use (canonical + custom labels). */
export function mediaTagStyles(
  canonical: readonly string[],
  customStyles: readonly CustomStyle[],
): string[] {
  return taggingStylesFor(canonical, customStyles);
}
