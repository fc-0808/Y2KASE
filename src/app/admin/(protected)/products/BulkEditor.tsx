"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  X,
  Check,
  Loader2,
  Layers,
  Smartphone,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowDownAZ,
  Play,
  ExternalLink,
  Images,
  Users,
  SquarePen,
  TriangleAlert,
  Sparkles,
  Boxes,
  Crop,
} from "lucide-react";
import {
  STYLES,
  AIRPODS_STYLES,
  IPHONE_GENERATIONS,
  IPHONE_MODELS,
  defaultModels,
  defaultModelRangeFromId,
  stylesForAddons,
  addonsFromStyles,
  orderStyles,
  orderModels,
  modelsForGenerationRange,
  summarizeModels,
  normalizeImageStyleTags,
  displayedStylePrices,
  getStylePrice,
  STORE_CURRENCY,
} from "@/lib/pricing";
import { compareFilenamesNatural } from "@/lib/utils";
import { compatibilityAxisFor } from "@/lib/catalog/product-types";
import {
  editorCanonicalStyles,
  hasCompatibilityAxis,
  hasPriceAxis,
  summarizeCompatibility,
} from "@/lib/catalog/offered-options";
import { StyleTagPicker, StyleCoverageHint } from "./StyleTagPicker";
import { StylePriceSelect } from "./StylePriceSelect";
import { DeviceFitPicker } from "./DeviceFitPicker";
import {
  CustomVariationsEditor,
  mediaTagStyles,
} from "./CustomVariationsEditor";
import {
  bulkUpdateProducts,
  getBulkEditProducts,
  bulkSaveProducts,
  type BulkEditProduct,
  type PerProductSave,
} from "./actions";
import {
  setImageVariationTag,
  syncCustomDraftMedia,
  taggingStylesFor,
  validateCustomStylesDraft,
  type CustomStyle,
} from "@/lib/catalog/custom-styles";
import { detectProductImageStyles } from "./[id]/actions";
import { ImageCropStudio } from "./ImageCropStudio";

type Mode = "all" | "each";

type MediaItem =
  | {
      kind: "image";
      id: number;
      url: string;
      filename: string | null;
      styleTags: string[];
      /** Ingested URL once this photo has been cropped. Null while it is original. */
      originalUrl: string | null;
    }
  | { kind: "video"; url: string };

type Draft = {
  isIphoneCase: boolean;
  videoUrl: string | null;
  media: MediaItem[];
  styles: string[];
  models: string[];
  containsMultipleProducts: boolean;
  customStyles: CustomStyle[];
  /** Display strings for canonical bundle prices, keyed by style name. */
  stylePrices: Record<string, string>;
};

export function BulkEditor({
  productIds,
  caseCount,
  onClose,
  onSaved,
}: {
  productIds: number[];
  caseCount: number;
  onClose: () => void;
  onSaved: (result: { ok: boolean; message: string }) => void;
}) {
  const [mode, setMode] = useState<Mode>("all");
  const count = productIds.length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:rounded-3xl">
        {/* header + mode switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-black">Bulk edit variations</h2>
            <p className="text-xs text-[var(--foreground)]/60">
              {count} selected · {caseCount} iPhone case
              {caseCount === 1 ? "" : "s"} — style bundles apply to iPhone
              cases; device fit can be edited per product.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] p-1">
            <ModeTab
              active={mode === "all"}
              onClick={() => setMode("all")}
              icon={<Users className="h-4 w-4" />}
              label="Same for all"
            />
            <ModeTab
              active={mode === "each"}
              onClick={() => setMode("each")}
              icon={<SquarePen className="h-4 w-4" />}
              label="Edit individually"
            />
          </div>

          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--muted)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {mode === "all" ? (
          <SameForAllPanel
            productIds={productIds}
            caseCount={caseCount}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : (
          <IndividualWorkspace
            productIds={productIds}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-[var(--primary)] text-white" : "hover:bg-[var(--card)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE 1 — Same for all (one set of styles/models applied to every selection)
// ─────────────────────────────────────────────────────────────────────────────
function SameForAllPanel({
  productIds,
  caseCount,
  onClose,
  onSaved,
}: {
  productIds: number[];
  caseCount: number;
  onClose: () => void;
  onSaved: (result: { ok: boolean; message: string }) => void;
}) {
  const [doStyles, setDoStyles] = useState(false);
  const [doModels, setDoModels] = useState(false);
  const [styles, setStyles] = useState<string[]>(() =>
    stylesForAddons({ hasGrip: false, hasCharm: false }),
  );
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    displayedStylePrices(STYLES, STORE_CURRENCY),
  );
  const [models, setModels] = useState<string[]>(() => defaultModels());
  const [pending, startTransition] = useTransition();

  const canApply =
    (doStyles || doModels) && (!doModels || models.length > 0) && !pending;

  function handleApply() {
    startTransition(async () => {
      const res = await bulkUpdateProducts({
        productIds,
        ...(doStyles
          ? { styles: { mode: "manual", styles }, stylePrices: prices }
          : {}),
        ...(doModels ? { models: orderModels(models) } : {}),
      });
      onSaved(res);
    });
  }

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {caseCount === 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            None of the selected products are iPhone cases — style and iPhone
            model changes only apply to iPhone cases. Use{" "}
            <span className="font-semibold">Edit individually</span> to change
            AirPods (or other) device fit.
          </p>
        )}

        <SectionCard
          icon={<Layers className="h-4 w-4" />}
          title="Style variations"
          enabled={doStyles}
          onToggle={() => setDoStyles((v) => !v)}
        >
          <StyleVariationPicker
            styles={styles}
            prices={prices}
            currency={STORE_CURRENCY}
            onChange={(next) => {
              setStyles(next);
              setPrices((prev) => fillStylePrices(next, STORE_CURRENCY, prev));
            }}
            onPriceChange={(style, price) =>
              setPrices((prev) => ({ ...prev, [style]: price }))
            }
          />
        </SectionCard>

        <SectionCard
          icon={<Smartphone className="h-4 w-4" />}
          title="iPhone model availability"
          enabled={doModels}
          onToggle={() => setDoModels((v) => !v)}
        >
          <ModelAvailabilityPicker selected={models} onChange={setModels} />
        </SectionCard>
      </div>

      <FooterBar
        onClose={onClose}
        primaryLabel={`Apply to ${productIds.length} product${productIds.length === 1 ? "" : "s"}`}
        onPrimary={handleApply}
        disabled={!canApply}
        pending={pending}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE 2 — Edit individually (master-detail workspace, one Save All)
// ─────────────────────────────────────────────────────────────────────────────
function IndividualWorkspace({
  productIds,
  onClose,
  onSaved,
}: {
  productIds: number[];
  onClose: () => void;
  onSaved: (result: { ok: boolean; message: string }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<number, BulkEditProduct>>({});
  const [order, setOrder] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  // Serialized baseline per product → cheap dirty detection.
  const [baseline, setBaseline] = useState<Record<number, string>>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [cropTarget, setCropTarget] = useState<{
    productId: number;
    imageId: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getBulkEditProducts(productIds)
      .then((rows) => {
        if (cancelled) return;
        // Preserve the operator's selection order.
        const byId = new Map(rows.map((r) => [r.id, r]));
        const ordered = productIds.filter((id) => byId.has(id));
        const nextMeta: Record<number, BulkEditProduct> = {};
        const nextDrafts: Record<number, Draft> = {};
        const nextBaseline: Record<number, string> = {};
        for (const id of ordered) {
          const p = byId.get(id)!;
          nextMeta[id] = p;
          const draft = draftFromProduct(p);
          nextDrafts[id] = draft;
          nextBaseline[id] = serializeDraft(draft);
        }
        setMeta(nextMeta);
        setOrder(ordered);
        setDrafts(nextDrafts);
        setBaseline(nextBaseline);
        setActiveId(ordered[0] ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productIds]);

  const dirtyIds = useMemo(
    () =>
      new Set(
        order.filter(
          (id) => drafts[id] && serializeDraft(drafts[id]) !== baseline[id],
        ),
      ),
    [order, drafts, baseline],
  );

  function updateActive(patch: Partial<Draft>) {
    if (activeId == null) return;
    setDrafts((prev) => ({ ...prev, [activeId]: { ...prev[activeId], ...patch } }));
  }

  function syncMediaToCustom(
    media: MediaItem[],
    previous: CustomStyle[],
    custom: CustomStyle[],
    canonical: string[],
  ): MediaItem[] {
    const images = media.filter(
      (m): m is Extract<MediaItem, { kind: "image" }> => m.kind === "image",
    );
    const tags = syncCustomDraftMedia({
      imageIds: images.map((image) => image.id),
      tagsByImageId: Object.fromEntries(
        images.map((image) => [image.id, image.styleTags]),
      ),
      previous,
      next: custom,
      canonical,
    });
    return media.map((item) =>
      item.kind === "image"
        ? { ...item, styleTags: tags[item.id] ?? [] }
        : item,
    );
  }

  function handleCustomStyles(next: CustomStyle[], flagged = true) {
    if (activeId == null) return;
    const current = drafts[activeId];
    if (!current) return;
    const custom = flagged ? next : [];
    updateActive({
      containsMultipleProducts: flagged,
      customStyles: custom,
      media: syncMediaToCustom(
        current.media,
        current.customStyles,
        custom,
        current.styles,
      ),
    });
  }

  function handleMedia(media: MediaItem[]) {
    if (activeId == null) return;
    const current = drafts[activeId];
    if (!current) return;
    const prevTag = new Map(
      current.media
        .filter(
          (item): item is Extract<MediaItem, { kind: "image" }> =>
            item.kind === "image",
        )
        .map((item) => [item.id, item.styleTags[0] ?? null]),
    );
    const changed = media.find(
      (item) =>
        item.kind === "image" &&
        (item.styleTags[0] ?? null) !== (prevTag.get(item.id) ?? null),
    );
    if (!changed || changed.kind !== "image") {
      updateActive({ media });
      return;
    }
    const images = media.filter(
      (item): item is Extract<MediaItem, { kind: "image" }> =>
        item.kind === "image",
    );
    const result = setImageVariationTag({
      imageId: changed.id,
      style: changed.styleTags[0] ?? null,
      customStyles: current.customStyles,
      imageIds: images.map((image) => image.id),
      tagsByImageId: Object.fromEntries(
        images.map((image) => [image.id, image.styleTags]),
      ),
      offered: taggingStylesFor(current.styles, current.customStyles),
    });
    updateActive({
      media: media.map((item) =>
        item.kind === "image"
          ? { ...item, styleTags: result.tagsByImageId[item.id] ?? [] }
          : item,
      ),
      customStyles: result.customStyles,
    });
  }

  function commitImageEdit(
    productId: number,
    imageId: number,
    next: { url: string; originalUrl: string | null },
  ) {
    setDrafts((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          ...current,
          media: replaceImageBytes(current.media, imageId, next),
        },
      };
    });
    // A crop is already stored. Fold the new URL into the baseline so it
    // does not show up as an unsaved draft, and leave every other edit dirty.
    setBaseline((prev) => {
      const raw = prev[productId];
      if (!raw) return prev;
      try {
        const parsed = JSON.parse(raw) as { media?: MediaItem[] };
        if (!Array.isArray(parsed.media)) return prev;
        parsed.media = replaceImageBytes(parsed.media, imageId, next);
        return { ...prev, [productId]: JSON.stringify(parsed) };
      } catch {
        return prev;
      }
    });
  }

  function selectProduct(id: number) {
    setActiveId(id);
    setCropTarget((current) => (current?.productId === id ? current : null));
  }

  function openCrop(imageId: number) {
    if (activeId == null) return;
    const item = drafts[activeId]?.media.find(
      (m) => m.kind === "image" && m.id === imageId,
    );
    if (!item || item.kind !== "image") return;
    setCropTarget({ productId: activeId, imageId: item.id });
  }

  async function handleSaveAll() {
    if (savingRef.current) return;
    setSaveError(null);
    for (const id of order) {
      if (!dirtyIds.has(id)) continue;
      const draft = drafts[id];
      const productType = meta[id]?.productType;
      if (!draft?.containsMultipleProducts || !productType) continue;
      const validated = validateCustomStylesDraft(draft.customStyles, {
        productType,
      });
      if (!validated.ok) {
        selectProduct(id);
        setSaveError(validated.message);
        return;
      }
    }
    const items: PerProductSave[] = order
      .filter((id) => dirtyIds.has(id))
      .map((id) => toPerProductSave(id, drafts[id]));
    if (items.length === 0) {
      setSaveError("No changes to save.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await bulkSaveProducts(items);
      if (!res.ok) {
        const detail =
          res.failed.length > 0
            ? res.failed.map((failure) => failure.message).join(" ")
            : res.message;
        setSaveError(detail || "Save failed.");
        return;
      }
      onSaved(res);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const cropImage =
    cropTarget == null
      ? null
      : (drafts[cropTarget.productId]?.media.find(
          (item): item is Extract<MediaItem, { kind: "image" }> =>
            item.kind === "image" && item.id === cropTarget.imageId,
        ) ?? null);
  const active = activeId != null ? drafts[activeId] : null;
  const activeMeta = activeId != null ? meta[activeId] : null;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-[var(--foreground)]/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading products…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-red-500">
        {loadError}
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1">
        {/* ── Product list (master) ─────────────────────────────────────── */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-[var(--border)] sm:w-64">
          <ul>
            {order.map((id) => {
              const p = meta[id];
              const d = drafts[id];
              const isActive = id === activeId;
              const isDirty = dirtyIds.has(id);
              return (
                <li key={id}>
                  <button
                    onClick={() => selectProduct(id)}
                    className={`flex w-full items-center gap-2.5 border-b border-[var(--border)] px-3 py-2.5 text-left transition ${
                      isActive
                        ? "bg-[var(--primary)]/8"
                        : "hover:bg-[var(--muted)]/50"
                    }`}
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
                      {d.media.find((m) => m.kind === "image") && (
                        <Image
                          src={
                            (d.media.find((m) => m.kind === "image") as
                              | Extract<MediaItem, { kind: "image" }>
                              | undefined)!.url
                          }
                          alt={p.title}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold">
                        {p.title}
                      </p>
                      <p className="text-[11px] text-[var(--foreground)]/55">
                        {p.productType === "iphone_case"
                          ? summarizeModels(d.models)
                          : hasCompatibilityAxis(p.productType)
                            ? summarizeCompatibility(p.productType, d.models)
                            : p.productTypeLabel}
                      </p>
                    </div>
                    {d.containsMultipleProducts && (
                      <Boxes
                        className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]"
                        aria-label="More than one product"
                      />
                    )}
                    {isDirty && (
                      <span
                        title="Unsaved changes"
                        className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Active product editor (detail) ────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {active && activeMeta ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-1 text-base font-black">
                    {activeMeta.title}
                  </h3>
                  <p className="text-xs text-[var(--foreground)]/55">
                    /{activeMeta.slug} ·{" "}
                    {active.media.filter((m) => m.kind === "image").length}{" "}
                    images
                    {active.videoUrl ? " · 1 video" : ""}
                  </p>
                </div>
                <Link
                  href={`/products/${activeMeta.slug}`}
                  target="_blank"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  View <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {activeMeta.mediaWarning && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{activeMeta.mediaWarning}</p>
                </div>
              )}

              <CustomVariationsEditor
                flagged={active.containsMultipleProducts}
                onFlagChange={(flagged) =>
                  handleCustomStyles(
                    flagged ? active.customStyles : [],
                    flagged,
                  )
                }
                customStyles={active.customStyles}
                onCustomStylesChange={(next) => handleCustomStyles(next, true)}
                images={active.media
                  .filter(
                    (item): item is Extract<MediaItem, { kind: "image" }> =>
                      item.kind === "image",
                  )
                  .map((item) => ({
                    id: item.id,
                    url: item.url,
                    filename: item.filename,
                  }))}
                productType={activeMeta.productType}
                currency={activeMeta.currency}
                onEditPhoto={(image) => openCrop(image.id)}
              />

              {activeMeta.productType === "iphone_case" ? (
                <>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] p-3.5">
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                        <Layers className="h-4 w-4" /> Style variations
                      </p>
                      <StyleVariationPicker
                        styles={active.styles}
                        prices={active.stylePrices}
                        currency={activeMeta.currency}
                        requireCaseOnly={active.customStyles.length === 0}
                        onChange={(styles) => {
                          const offered = taggingStylesFor(
                            styles,
                            active.customStyles,
                          );
                          updateActive({
                            styles,
                            stylePrices: fillStylePrices(
                              styles,
                              activeMeta.currency,
                              active.stylePrices,
                            ),
                            media: active.media.map((m) =>
                              m.kind === "image"
                                ? {
                                    ...m,
                                    styleTags: normalizeImageStyleTags(
                                      m.styleTags,
                                      offered,
                                    ),
                                  }
                                : m,
                            ),
                          });
                        }}
                        onPriceChange={(style, price) =>
                          updateActive({
                            stylePrices: { ...active.stylePrices, [style]: price },
                          })
                        }
                      />
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] p-3.5">
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                        <Smartphone className="h-4 w-4" /> iPhone models
                      </p>
                      <ModelAvailabilityPicker
                        selected={active.models}
                        onChange={(models) => updateActive({ models })}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {hasPriceAxis(activeMeta.productType) && (
                    <div className="rounded-2xl border border-[var(--border)] p-3.5">
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                        <Layers className="h-4 w-4" /> Style variations
                      </p>
                      <StyleVariationPicker
                        styles={active.styles}
                        prices={active.stylePrices}
                        allowGrip={false}
                        currency={activeMeta.currency}
                        requireCaseOnly={active.customStyles.length === 0}
                        onChange={(styles) => {
                          const offered = taggingStylesFor(
                            styles,
                            active.customStyles,
                          );
                          updateActive({
                            styles,
                            stylePrices: fillStylePrices(
                              styles,
                              activeMeta.currency,
                              active.stylePrices,
                            ),
                            media: active.media.map((m) =>
                              m.kind === "image"
                                ? {
                                    ...m,
                                    styleTags: normalizeImageStyleTags(
                                      m.styleTags,
                                      offered,
                                    ),
                                  }
                                : m,
                            ),
                          });
                        }}
                        onPriceChange={(style, price) =>
                          updateActive({
                            stylePrices: { ...active.stylePrices, [style]: price },
                          })
                        }
                      />
                    </div>
                  )}
                  {hasCompatibilityAxis(activeMeta.productType) ? (
                    <div className="rounded-2xl border border-[var(--border)] p-3.5">
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                        <Smartphone className="h-4 w-4" />{" "}
                        {compatibilityAxisFor(activeMeta.productType)?.name ??
                          "Device fit"}
                      </p>
                      <p className="mb-2.5 text-xs text-[var(--foreground)]/60">
                        Which devices this listing ships for. Shoppers pick one;
                        the price stays the same.
                      </p>
                      <DeviceFitPicker
                        productType={activeMeta.productType}
                        selected={active.models}
                        onChange={(models) => updateActive({ models })}
                      />
                    </div>
                  ) : (
                    !hasPriceAxis(activeMeta.productType) &&
                    active.customStyles.length === 0 && (
                      <p className="rounded-xl bg-[var(--muted)] px-3 py-2 text-xs text-[var(--foreground)]/60">
                        This product has no style or device-fit axes — only media
                        order can be edited here, unless you flag it as more than
                        one product and add named variations.
                      </p>
                    )
                  )}
                </>
              )}

              <div className="rounded-2xl border border-[var(--border)] p-3.5">
                <MediaOrderEditor
                  productId={activeId!}
                  media={active.media}
                  styles={mediaTagStyles(
                    hasPriceAxis(activeMeta.productType) ? active.styles : [],
                    active.customStyles,
                  )}
                  preserveLabels={new Set(
                    active.customStyles.map((row) => row.label),
                  )}
                  preserveImageIds={
                    new Set(
                      active.customStyles
                        .map((row) => row.imageId)
                        .filter((id): id is number => id != null),
                    )
                  }
                  onChange={handleMedia}
                  onCrop={openCrop}
                />
              </div>
            </div>
          ) : (
            <p className="py-24 text-center text-sm text-[var(--foreground)]/60">
              Select a product to edit.
            </p>
          )}
        </div>
      </div>

      {cropTarget && cropImage && (
        <ImageCropStudio
          productId={cropTarget.productId}
          imageId={cropImage.id}
          url={cropImage.url}
          filename={cropImage.filename}
          originalUrl={cropImage.originalUrl}
          onClose={() => setCropTarget(null)}
          onApplied={(next) =>
            commitImageEdit(cropTarget.productId, cropImage.id, next)
          }
        />
      )}

      <FooterBar
        onClose={onClose}
        primaryLabel={
          saving
            ? `Saving ${dirtyIds.size}…`
            : `Save ${dirtyIds.size} change${dirtyIds.size === 1 ? "" : "s"}`
        }
        onPrimary={() => void handleSaveAll()}
        disabled={dirtyIds.size === 0 || saving}
        pending={saving}
        error={saveError}
        note={
          dirtyIds.size > 0
            ? `${dirtyIds.size} product${dirtyIds.size === 1 ? "" : "s"} edited`
            : undefined
        }
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Style picker
// ─────────────────────────────────────────────────────────────────────────────
function fillStylePrices(
  styles: readonly string[],
  currency: string,
  current: Record<string, string>,
): Record<string, string> {
  const next = { ...current };
  for (const style of styles) {
    if (!next[style]) next[style] = getStylePrice(style, currency).toFixed(2);
  }
  return next;
}

function StyleVariationPicker({
  styles,
  prices,
  onChange,
  onPriceChange,
  allowGrip = true,
  currency = STORE_CURRENCY,
  requireCaseOnly = true,
}: {
  styles: string[];
  prices: Record<string, string>;
  onChange: (styles: string[]) => void;
  onPriceChange: (style: string, price: string) => void;
  allowGrip?: boolean;
  currency?: string;
  /** When false, Case Only may be turned off (a custom variation carries the listing). */
  requireCaseOnly?: boolean;
}) {
  const addons = useMemo(() => addonsFromStyles(styles), [styles]);
  const manualStyles = allowGrip ? STYLES : AIRPODS_STYLES;

  function setAddons(next: { hasGrip: boolean; hasCharm: boolean }) {
    onChange(
      stylesForAddons({
        hasGrip: allowGrip ? next.hasGrip : false,
        hasCharm: next.hasCharm,
      }),
    );
  }
  function toggleManual(style: string) {
    const next = styles.includes(style)
      ? styles.filter((s) => s !== style)
      : [...styles, style];
    if (requireCaseOnly) {
      const withCase = next.includes("Case Only") ? next : [...next, "Case Only"];
      onChange(orderStyles(withCase));
      return;
    }
    onChange(orderStyles(next));
  }

  return (
    <>
      <p className="text-xs text-[var(--foreground)]/60">
        Pick which add-ons ship, then choose a price for each bundle. A price
        left at the catalog default stays on the shared table.
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {allowGrip && (
          <Toggle
            label="Includes grip"
            checked={addons.hasGrip}
            onChange={(v) =>
              setAddons({ hasGrip: v, hasCharm: addons.hasCharm })
            }
          />
        )}
        <Toggle
          label="Includes charm"
          checked={addons.hasCharm}
          onChange={(v) =>
            setAddons({
              hasGrip: allowGrip ? addons.hasGrip : false,
              hasCharm: v,
            })
          }
        />
      </div>

      <div className="mt-2.5 rounded-xl bg-[var(--muted)] p-2.5">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--foreground)]/40">
          Offered styles
        </p>
        <ul className="space-y-1.5">
          {styles.map((s) => (
            <li key={s} className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-[11px] font-semibold">{s}</span>
              <label className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--foreground)]/45">
                <span>{currency}</span>
                <StylePriceSelect
                  style={s}
                  currency={currency}
                  value={prices[s] ?? ""}
                  onChange={(price) => onPriceChange(s, price)}
                />
              </label>
            </li>
          ))}
        </ul>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--primary)]">
          Customize manually
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {manualStyles.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={styles.includes(s)}
                disabled={s === "Case Only" && requireCaseOnly}
                onChange={() => toggleManual(s)}
              />
              {s}
            </label>
          ))}
        </div>
      </details>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: iPhone model picker
// ─────────────────────────────────────────────────────────────────────────────
function ModelAvailabilityPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  const [rangeFrom, setRangeFrom] = useState(defaultModelRangeFromId);
  const [rangeTo, setRangeTo] = useState(
    IPHONE_GENERATIONS[IPHONE_GENERATIONS.length - 1].id,
  );
  const set = useMemo(() => new Set(selected), [selected]);

  function toggleModel(model: string) {
    const next = new Set(set);
    if (next.has(model)) next.delete(model);
    else next.add(model);
    onChange(orderModels([...next]));
  }
  function toggleGeneration(models: string[], on: boolean) {
    const next = new Set(set);
    for (const m of models) {
      if (on) next.add(m);
      else next.delete(m);
    }
    onChange(orderModels([...next]));
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--muted)] p-2.5">
        <span className="text-xs font-semibold">Range</span>
        <select
          value={rangeFrom}
          onChange={(e) => setRangeFrom(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
        >
          {IPHONE_GENERATIONS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <span className="text-xs">to</span>
        <select
          value={rangeTo}
          onChange={(e) => setRangeTo(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
        >
          {IPHONE_GENERATIONS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange(modelsForGenerationRange(rangeFrom, rangeTo))}
          className="rounded-full bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-white hover:opacity-90"
        >
          Set
        </button>
        <button
          type="button"
          onClick={() => onChange([...IPHONE_MODELS])}
          className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)]"
        >
          All
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {IPHONE_GENERATIONS.map((gen) => {
          const have = gen.models.filter((m) => set.has(m)).length;
          const allOn = have === gen.models.length;
          return (
            <div
              key={gen.id}
              className="rounded-xl border border-[var(--border)] p-2"
            >
              <label className="flex items-center gap-1.5 border-b border-[var(--border)] pb-1.5 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = have > 0 && !allOn;
                  }}
                  onChange={() => toggleGeneration(gen.models, !allOn)}
                />
                {gen.label}
              </label>
              <div className="mt-1.5 space-y-1">
                {gen.models.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-1.5 text-[11px]"
                  >
                    <input
                      type="checkbox"
                      checked={set.has(m)}
                      onChange={() => toggleModel(m)}
                    />
                    <span className="truncate">{m.replace("iPhone ", "")}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs font-semibold text-[var(--foreground)]/70">
        {selected.length === 0
          ? "⚠ Select at least one model"
          : `${summarizeModels(selected)} · ${selected.length} model${selected.length === 1 ? "" : "s"}`}
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Media order + per-image style tagging
// ─────────────────────────────────────────────────────────────────────────────
function MediaOrderEditor({
  productId,
  media,
  styles,
  onChange,
  preserveLabels,
  preserveImageIds,
  onCrop,
}: {
  productId: number;
  media: MediaItem[];
  styles: string[];
  onChange: (media: MediaItem[]) => void;
  onCrop: (imageId: number) => void;
  /** Style tags that Detect must not overwrite (linked custom variations). */
  preserveLabels?: ReadonlySet<string>;
  /** Photos a custom row already owns — Detect must not retag them. */
  preserveImageIds?: ReadonlySet<number>;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMessage, setDetectMessage] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= media.length || from === to) return;
    const next = [...media];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }
  function sortByFilename() {
    const videoIdx = media.findIndex((m) => m.kind === "video");
    const imgs = media.filter(
      (m): m is Extract<MediaItem, { kind: "image" }> => m.kind === "image",
    );
    imgs.sort((a, b) => compareFilenamesNatural(a.filename, b.filename));
    const out: MediaItem[] = [...imgs];
    if (videoIdx >= 0) out.splice(Math.min(videoIdx, out.length), 0, media[videoIdx]);
    onChange(out);
  }
  /** Single-select: assigning a style replaces the image's previous one. */
  function setImageStyle(imageId: number, styleTags: string[]) {
    onChange(
      media.map((m) =>
        m.kind === "image" && m.id === imageId ? { ...m, styleTags } : m,
      ),
    );
  }

  async function detectStyles() {
    setDetecting(true);
    setDetectMessage(null);
    try {
      const res = await detectProductImageStyles(productId);
      setDetectMessage({ ok: res.ok, message: res.message });
      if (!res.ok) return;
      onChange(
        media.map((m) => {
          if (m.kind !== "image") return m;
          if (preserveImageIds?.has(m.id)) return m;
          if (m.styleTags[0] && preserveLabels?.has(m.styleTags[0])) return m;
          const tags = res.tags[m.id];
          if (!tags) return m;
          return {
            ...m,
            styleTags: normalizeImageStyleTags(tags, styles),
          };
        }),
      );
    } catch (err) {
      setDetectMessage({
        ok: false,
        message: err instanceof Error ? err.message : "Detection failed.",
      });
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Images className="h-4 w-4" /> Media order &amp; per-image styles
          </p>
          {styles.length > 0 && (
            <StyleCoverageHint
              styles={styles}
              tagsByImage={media
                .filter(
                  (m): m is Extract<MediaItem, { kind: "image" }> =>
                    m.kind === "image",
                )
                .map((m) => m.styleTags)}
            />
          )}
          {detectMessage && (
            <p
              className={`mt-1 text-[11px] font-semibold ${
                detectMessage.ok ? "text-green-600" : "text-red-500"
              }`}
            >
              {detectMessage.message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5">
          {styles.length > 0 && (
            <button
              type="button"
              onClick={detectStyles}
              disabled={detecting}
              className="flex items-center justify-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-50"
            >
              {detecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {detecting ? "Detecting…" : "Detect"}
            </button>
          )}
          <button
            type="button"
            onClick={sortByFilename}
            className="flex items-center justify-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)]"
          >
            <ArrowDownAZ className="h-3.5 w-3.5" /> Sort
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {media.map((item, index) => {
          const key =
            item.kind === "video" ? `video-${item.url}` : `img-${item.id}`;
          return (
            <li
              key={key}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex gap-2.5 rounded-xl border p-2 transition ${
                dragIndex === index
                  ? "border-[var(--primary)] opacity-60"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-0.5 text-[var(--foreground)]/40">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  className="rounded p-0.5 hover:text-[var(--primary)] disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <GripVertical className="h-3.5 w-3.5 cursor-grab" />
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === media.length - 1}
                  className="rounded p-0.5 hover:text-[var(--primary)] disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
                {item.kind === "video" ? (
                  <>
                    <video
                      src={item.url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/30">
                      <Play className="h-4 w-4 fill-white text-white" />
                    </span>
                  </>
                ) : (
                  <Image
                    src={item.url}
                    alt={item.filename ?? "Product image"}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
                <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                {item.kind === "image" && (
                  <button
                    type="button"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCrop(item.id);
                    }}
                    className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-white text-[var(--foreground)] shadow ring-1 ring-black/10"
                    aria-label={`Crop ${item.filename ?? "photo"}`}
                    title="Crop and rotate"
                  >
                    <Crop className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {item.kind === "video" ? (
                  <p className="text-xs font-semibold">
                    Product video
                    <span className="ml-1.5 font-normal text-[var(--foreground)]/50">
                      (plays in this slot)
                    </span>
                  </p>
                ) : (
                  <>
                    <p className="truncate text-[11px] text-[var(--foreground)]/50">
                      {item.filename ?? `image #${item.id}`}
                    </p>
                    {styles.length > 0 && (
                      <div className="mt-1">
                        <StyleTagPicker
                          size="sm"
                          styles={styles}
                          value={item.styleTags}
                          label={item.filename ?? `image #${item.id}`}
                          onChange={(styleTags) =>
                            setImageStyle(item.id, styleTags)
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared small UI
// ─────────────────────────────────────────────────────────────────────────────
function FooterBar({
  onClose,
  primaryLabel,
  onPrimary,
  disabled,
  pending,
  note,
  error,
}: {
  onClose: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  disabled: boolean;
  pending: boolean;
  note?: string;
  error?: string | null;
}) {
  return (
    <div className="border-t border-[var(--border)] px-5 py-4">
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
          >
            Cancel
          </button>
          {note && (
            <span className="text-xs text-[var(--foreground)]/55">{note}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled}
          className="flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        enabled
          ? "border-[var(--primary)] bg-[var(--primary)]/[0.03]"
          : "border-[var(--border)]"
      }`}
    >
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="h-4 w-4"
        />
        <span className="flex items-center gap-1.5 font-bold">
          {icon}
          {title}
        </span>
      </label>
      {enabled && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:border-[var(--primary)]"
    >
      {label}
      <span
        className={`relative h-5 w-9 rounded-full transition ${
          checked ? "bg-[var(--primary)]" : "bg-[var(--border)]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft helpers
// ─────────────────────────────────────────────────────────────────────────────
function draftFromProduct(p: BulkEditProduct): Draft {
  const isIphoneCase = p.productType === "iphone_case";
  const priced = hasPriceAxis(p.productType);
  const styles = priced
    ? editorCanonicalStyles(
        p.productType,
        p.availableStyles,
        p.customStyles.length,
      )
    : [];
  const customStyles = p.customStyles;
  const tagStyles = taggingStylesFor(styles, customStyles);
  // Legacy rows can carry several tags per image (the classifier used to tag
  // inclusively). Collapse on the way in so the control never renders two
  // active pills; the baseline is taken from the normalized draft below, so
  // this doesn't flag every such product as unsaved the moment it loads.
  const imgs: MediaItem[] = p.images.map((i) => ({
    kind: "image",
    id: i.id,
    url: i.url,
    filename: i.filename,
    styleTags: normalizeImageStyleTags(i.styleTags, tagStyles),
    originalUrl: i.originalUrl,
  }));
  let media = imgs;
  if (p.videoUrl) {
    const slot = Math.max(0, Math.min(p.videoPosition ?? 1, imgs.length));
    media = [
      ...imgs.slice(0, slot),
      { kind: "video", url: p.videoUrl },
      ...imgs.slice(slot),
    ];
  }
  return {
    isIphoneCase,
    videoUrl: p.videoUrl,
    media,
    styles,
    models: p.availableModels,
    containsMultipleProducts: p.containsMultipleProducts,
    customStyles: p.customStyles,
    stylePrices: displayedStylePrices(
      isIphoneCase ? STYLES : AIRPODS_STYLES,
      p.currency,
      p.stylePrices,
    ),
  };
}

function replaceImageBytes(
  media: MediaItem[],
  imageId: number,
  next: { url: string; originalUrl: string | null },
): MediaItem[] {
  return media.map((item) =>
    item.kind === "image" && item.id === imageId
      ? { ...item, url: next.url, originalUrl: next.originalUrl }
      : item,
  );
}

function serializeDraft(d: Draft): string {
  return JSON.stringify({
    media: d.media,
    styles: d.styles,
    models: d.models,
    containsMultipleProducts: d.containsMultipleProducts,
    customStyles: d.customStyles,
    stylePrices: d.stylePrices,
  });
}

function toPerProductSave(productId: number, d: Draft): PerProductSave {
  const imageOrder = d.media
    .filter((m): m is Extract<MediaItem, { kind: "image" }> => m.kind === "image")
    .map((m) => m.id);
  const videoIdx = d.media.findIndex((m) => m.kind === "video");
  const videoSlot =
    videoIdx === -1
      ? null
      : d.media.slice(0, videoIdx).filter((m) => m.kind === "image").length;
  const styleTags: Record<number, string[]> = {};
  for (const m of d.media) {
    if (m.kind === "image") styleTags[m.id] = m.styleTags;
  }
  return {
    productId,
    imageOrder,
    videoSlot,
    styleTags,
    availableStyles: d.styles,
    availableModels: d.models,
    containsMultipleProducts: d.containsMultipleProducts,
    customStyles: d.customStyles,
    stylePrices: d.stylePrices,
  };
}
