"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
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
} from "lucide-react";
import {
  STYLES,
  IPHONE_GENERATIONS,
  IPHONE_MODELS,
  stylesForAddons,
  addonsFromStyles,
  orderStyles,
  orderModels,
  modelsForGenerationRange,
  summarizeModels,
} from "@/lib/pricing";
import { compareFilenamesNatural } from "@/lib/utils";
import {
  bulkUpdateProducts,
  getBulkEditProducts,
  bulkSaveProducts,
  type BulkEditProduct,
  type PerProductSave,
} from "./actions";

type Mode = "all" | "each";

type MediaItem =
  | {
      kind: "image";
      id: number;
      url: string;
      filename: string | null;
      styleTags: string[];
    }
  | { kind: "video"; url: string };

type Draft = {
  isIphoneCase: boolean;
  videoUrl: string | null;
  media: MediaItem[];
  styles: string[];
  models: string[];
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:rounded-3xl">
        {/* header + mode switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-black">Bulk edit variations</h2>
            <p className="text-xs text-[var(--foreground)]/60">
              {count} selected · {caseCount} iPhone case
              {caseCount === 1 ? "" : "s"}
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
  const [models, setModels] = useState<string[]>(() => [...IPHONE_MODELS]);
  const [pending, startTransition] = useTransition();

  const canApply =
    (doStyles || doModels) && (!doModels || models.length > 0) && !pending;

  function handleApply() {
    startTransition(async () => {
      const res = await bulkUpdateProducts({
        productIds,
        ...(doStyles ? { styles: { mode: "manual", styles } } : {}),
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
            None of the selected products are iPhone cases — style and model
            changes only apply to iPhone cases.
          </p>
        )}

        <SectionCard
          icon={<Layers className="h-4 w-4" />}
          title="Style variations"
          enabled={doStyles}
          onToggle={() => setDoStyles((v) => !v)}
        >
          <StyleVariationPicker styles={styles} onChange={setStyles} />
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
  const [pending, startTransition] = useTransition();

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

  function handleSaveAll() {
    const items: PerProductSave[] = order
      .filter((id) => dirtyIds.has(id))
      .map((id) => toPerProductSave(id, drafts[id]));
    if (items.length === 0) {
      onSaved({ ok: false, message: "No changes to save." });
      return;
    }
    startTransition(async () => {
      const res = await bulkSaveProducts(items);
      onSaved(res);
    });
  }

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
                    onClick={() => setActiveId(id)}
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
                          : p.productTypeLabel}
                      </p>
                    </div>
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

              {activeMeta.productType === "iphone_case" ? (
                <>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] p-3.5">
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                        <Layers className="h-4 w-4" /> Style variations
                      </p>
                      <StyleVariationPicker
                        styles={active.styles}
                        onChange={(styles) => {
                          const allowed = new Set(styles);
                          updateActive({
                            styles,
                            media: active.media.map((m) =>
                              m.kind === "image"
                                ? {
                                    ...m,
                                    styleTags: m.styleTags.filter((s) =>
                                      allowed.has(s),
                                    ),
                                  }
                                : m,
                            ),
                          });
                        }}
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
                <p className="rounded-xl bg-[var(--muted)] px-3 py-2 text-xs text-[var(--foreground)]/60">
                  This isn&apos;t an iPhone case — only media order can be edited
                  here. Style and model variations don&apos;t apply.
                </p>
              )}

              <div className="rounded-2xl border border-[var(--border)] p-3.5">
                <MediaOrderEditor
                  media={active.media}
                  styles={active.isIphoneCase ? active.styles : []}
                  onChange={(media) => updateActive({ media })}
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

      <FooterBar
        onClose={onClose}
        primaryLabel={`Save ${dirtyIds.size} change${dirtyIds.size === 1 ? "" : "s"}`}
        onPrimary={handleSaveAll}
        disabled={dirtyIds.size === 0 || pending}
        pending={pending}
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
function StyleVariationPicker({
  styles,
  onChange,
}: {
  styles: string[];
  onChange: (styles: string[]) => void;
}) {
  const addons = useMemo(() => addonsFromStyles(styles), [styles]);

  function setAddons(next: { hasGrip: boolean; hasCharm: boolean }) {
    onChange(stylesForAddons(next));
  }
  function toggleManual(style: string) {
    const next = styles.includes(style)
      ? styles.filter((s) => s !== style)
      : [...styles, style];
    const withCase = next.includes("Case Only") ? next : [...next, "Case Only"];
    onChange(orderStyles(withCase));
  }

  return (
    <>
      <p className="text-xs text-[var(--foreground)]/60">
        Pick which add-ons ship — offered styles and the price update
        automatically.
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Toggle
          label="Includes grip"
          checked={addons.hasGrip}
          onChange={(v) => setAddons({ hasGrip: v, hasCharm: addons.hasCharm })}
        />
        <Toggle
          label="Includes charm"
          checked={addons.hasCharm}
          onChange={(v) => setAddons({ hasGrip: addons.hasGrip, hasCharm: v })}
        />
      </div>

      <div className="mt-2.5 rounded-xl bg-[var(--muted)] p-2.5">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--foreground)]/40">
          Offered styles
        </p>
        <div className="flex flex-wrap gap-1.5">
          {styles.map((s) => (
            <span
              key={s}
              className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[11px] font-semibold"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--primary)]">
          Customize manually
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {STYLES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={styles.includes(s)}
                disabled={s === "Case Only"}
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
  const [rangeFrom, setRangeFrom] = useState(IPHONE_GENERATIONS[0].id);
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

      <div className="mt-2.5 grid grid-cols-2 gap-2">
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
  media,
  styles,
  onChange,
}: {
  media: MediaItem[];
  styles: string[];
  onChange: (media: MediaItem[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
  function toggleTag(imageId: number, style: string) {
    onChange(
      media.map((m) => {
        if (m.kind !== "image" || m.id !== imageId) return m;
        const has = m.styleTags.includes(style);
        return {
          ...m,
          styleTags: has
            ? m.styleTags.filter((s) => s !== style)
            : orderStyles([...m.styleTags, style]),
        };
      }),
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Images className="h-4 w-4" /> Media order &amp; per-image styles
        </p>
        <button
          type="button"
          onClick={sortByFilename}
          className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)]"
        >
          <ArrowDownAZ className="h-3.5 w-3.5" /> Sort
        </button>
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
                    {styles.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {styles.map((style) => {
                          const active = item.styleTags.includes(style);
                          return (
                            <button
                              key={style}
                              type="button"
                              onClick={() => toggleTag(item.id, style)}
                              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                                active
                                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                  : "border-[var(--border)] hover:border-[var(--primary)]"
                              }`}
                            >
                              {style}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {styles.length > 0 && item.styleTags.length === 0 && (
                      <p className="mt-1 text-[10px] text-[var(--foreground)]/50">
                        Universal — shown for every style.
                      </p>
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
}: {
  onClose: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  disabled: boolean;
  pending: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
      <div className="flex items-center gap-3">
        <button
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
  const imgs: MediaItem[] = p.images.map((i) => ({
    kind: "image",
    id: i.id,
    url: i.url,
    filename: i.filename,
    styleTags: i.styleTags,
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
    isIphoneCase: p.productType === "iphone_case",
    videoUrl: p.videoUrl,
    media,
    styles: orderStyles(
      p.availableStyles.length ? p.availableStyles : ["Case Only"],
    ),
    models: p.availableModels,
  };
}

function serializeDraft(d: Draft): string {
  return JSON.stringify({ media: d.media, styles: d.styles, models: d.models });
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
  };
}
