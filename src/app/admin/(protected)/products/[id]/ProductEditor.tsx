"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  GripVertical,
  Play,
  ArrowUp,
  ArrowDown,
  Check,
  ExternalLink,
  ArrowDownAZ,
} from "lucide-react";
import {
  STYLES,
  stylesForAddons,
  addonsFromStyles,
  orderStyles,
  normalizeImageStyleTags,
} from "@/lib/pricing";
import { compareFilenamesNatural } from "@/lib/utils";
import type { BrandOption } from "@/lib/catalog/brands";
import type { TitleIssue } from "@/lib/catalog/listing-title";
import { StyleTagPicker, StyleCoverageHint } from "../StyleTagPicker";
import { BrandReassignmentCard, type BrandState } from "./BrandReassignmentCard";
import { ColorEditorCard } from "./ColorEditorCard";
import { MotifEditorCard } from "./MotifEditorCard";
import { ListingTitleEditor } from "./ListingTitleEditor";
import { saveProduct, type SaveProductPayload } from "./actions";
import type { ColorFamilySlug } from "@/lib/catalog/colors";
import type { MotifFamilySlug } from "@/lib/catalog/motifs";

type ImageInput = {
  id: number;
  url: string;
  filename: string | null;
  styleTags: string[];
};

type MediaItem =
  | {
      kind: "image";
      id: number;
      url: string;
      filename: string | null;
      styleTags: string[];
    }
  | { kind: "video"; url: string };

export function ProductEditor({
  productId,
  title,
  titleIssues,
  slug,
  status,
  isIphoneCase,
  videoUrl,
  videoPosition,
  brand,
  brandOptions,
  filedIn,
  images,
  availableStyles: initialStyles,
  colors,
  colorsLocked,
  motifs,
  motifsLocked,
}: {
  productId: number;
  title: string;
  /** Audit of the stored title against the product's own data. */
  titleIssues: TitleIssue[];
  slug: string;
  status: string;
  isIphoneCase: boolean;
  videoUrl: string | null;
  videoPosition: number | null;
  brand: BrandState;
  brandOptions: BrandOption[];
  filedIn: string[];
  images: ImageInput[];
  availableStyles: string[];
  colors: ColorFamilySlug[];
  colorsLocked: boolean;
  motifs: MotifFamilySlug[];
  motifsLocked: boolean;
}) {
  // ── Available styles: stored as a set, edited via grip/charm toggles ───────
  // Declared first because the offered set decides which per-image tags below
  // are still valid.
  const [styles, setStyles] = useState<string[]>(() =>
    orderStyles(initialStyles.length ? initialStyles : ["Case Only"]),
  );
  const addons = useMemo(() => addonsFromStyles(styles), [styles]);
  // Only phone cases have a Style axis; everything else is media-order only.
  const tagStyles = isIphoneCase ? styles : [];

  // ── Media list: images in saved order with the video spliced into its slot ──
  const [media, setMedia] = useState<MediaItem[]>(() => {
    // Legacy rows can carry several tags per image; collapse to the single
    // configuration the photo shows so the control never renders two actives.
    const imgs: MediaItem[] = images.map((i) => ({
      kind: "image",
      id: i.id,
      url: i.url,
      filename: i.filename,
      styleTags: normalizeImageStyleTags(i.styleTags, styles),
    }));
    if (!videoUrl) return imgs;
    const slot = Math.max(0, Math.min(videoPosition ?? 1, imgs.length));
    return [...imgs.slice(0, slot), { kind: "video", url: videoUrl }, ...imgs.slice(slot)];
  });
  const [advanced, setAdvanced] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  // ── Reordering ─────────────────────────────────────────────────────────────
  function move(from: number, to: number) {
    if (to < 0 || to >= media.length || from === to) return;
    setMedia((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function handleDrop(to: number) {
    if (dragIndex === null) return;
    move(dragIndex, to);
    setDragIndex(null);
  }

  function sortImagesByFilename() {
    setMedia((prev) => {
      const videoIdx = prev.findIndex((m) => m.kind === "video");
      const imgs = prev.filter((m): m is Extract<MediaItem, { kind: "image" }> => m.kind === "image");
      imgs.sort((a, b) => compareFilenamesNatural(a.filename, b.filename));
      const out: MediaItem[] = [...imgs];
      if (videoIdx >= 0) {
        const slot = Math.min(videoIdx, out.length);
        out.splice(slot, 0, prev[videoIdx]);
      }
      return out;
    });
  }

  // ── Per-image style tagging ────────────────────────────────────────────────
  /** Single-select: assigning a style replaces the image's previous one. */
  function setImageStyle(imageId: number, styleTags: string[]) {
    setMedia((prev) =>
      prev.map((m) =>
        m.kind === "image" && m.id === imageId ? { ...m, styleTags } : m,
      ),
    );
  }

  /**
   * Re-point every image at the new offered set. Normalizing rather than
   * filtering means an image assigned to a style that's no longer sold falls
   * back to universal instead of keeping a dangling tag.
   */
  function applyStyles(nextStyles: string[]) {
    setStyles(nextStyles);
    setMedia((prev) =>
      prev.map((m) =>
        m.kind === "image"
          ? { ...m, styleTags: normalizeImageStyleTags(m.styleTags, nextStyles) }
          : m,
      ),
    );
  }

  // ── Variations (available styles) ──────────────────────────────────────────
  function setAddons(next: { hasGrip: boolean; hasCharm: boolean }) {
    applyStyles(stylesForAddons(next));
  }

  function toggleStyleManual(style: string) {
    const next = styles.includes(style)
      ? styles.filter((s) => s !== style)
      : orderStyles([...styles, style]);
    // "Case Only" is mandatory — every product has a bare case.
    applyStyles(
      next.includes("Case Only") ? next : orderStyles([...next, "Case Only"]),
    );
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  function handleSave() {
    const imageOrder = media
      .filter((m): m is Extract<MediaItem, { kind: "image" }> => m.kind === "image")
      .map((m) => m.id);
    const videoIdx = media.findIndex((m) => m.kind === "video");
    const videoSlot =
      videoIdx === -1
        ? null
        : media.slice(0, videoIdx).filter((m) => m.kind === "image").length;
    const styleTags: Record<number, string[]> = {};
    for (const m of media) {
      if (m.kind === "image") styleTags[m.id] = m.styleTags;
    }

    const payload: SaveProductPayload = {
      productId,
      imageOrder,
      videoSlot,
      styleTags,
      availableStyles: styles,
    };

    startTransition(async () => {
      const res = await saveProduct(payload);
      setResult(res);
      if (res.ok) setTimeout(() => setResult(null), 2500);
    });
  }

  const imageCount = media.filter((m) => m.kind === "image").length;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      {/* ── Media manager ─────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Media order</h2>
            <p className="text-sm text-[var(--foreground)]/60">
              Drag to reorder. The first image is the listing thumbnail. Assign
              each photo to the one style it shows.
            </p>
            {tagStyles.length > 0 && (
              <StyleCoverageHint
                styles={tagStyles}
                tagsByImage={media
                  .filter(
                    (m): m is Extract<MediaItem, { kind: "image" }> =>
                      m.kind === "image",
                  )
                  .map((m) => m.styleTags)}
              />
            )}
          </div>
          <button
            onClick={sortImagesByFilename}
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)]"
          >
            <ArrowDownAZ className="h-4 w-4" /> Sort by filename
          </button>
        </div>

        <ul className="space-y-2">
          {media.map((item, index) => {
            const key = item.kind === "video" ? `video-${item.url}` : `img-${item.id}`;
            return (
              <li
                key={key}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => setDragIndex(null)}
                className={`flex gap-3 rounded-2xl border bg-[var(--card)] p-3 transition ${
                  dragIndex === index
                    ? "border-[var(--primary)] opacity-60"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-1 text-[var(--foreground)]/40">
                  <button
                    type="button"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    className="rounded p-0.5 hover:text-[var(--primary)] disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <GripVertical className="h-4 w-4 cursor-grab" />
                  <button
                    type="button"
                    onClick={() => move(index, index + 1)}
                    disabled={index === media.length - 1}
                    className="rounded p-0.5 hover:text-[var(--primary)] disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)]">
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
                        <Play className="h-5 w-5 fill-white text-white" />
                      </span>
                    </>
                  ) : (
                    <Image
                      src={item.url}
                      alt={item.filename ?? "Product image"}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  )}
                  <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  {item.kind === "video" ? (
                    <p className="text-sm font-semibold">
                      Product video
                      <span className="ml-2 font-normal text-[var(--foreground)]/50">
                        (plays in this slot)
                      </span>
                    </p>
                  ) : (
                    <>
                      <p className="truncate text-xs text-[var(--foreground)]/50">
                        {item.filename ?? `image #${item.id}`}
                      </p>
                      {tagStyles.length > 0 && (
                        <div className="mt-1.5">
                          <StyleTagPicker
                            styles={tagStyles}
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
      </section>

      {/* ── Sidebar: product info + variations + save ─────────────────────── */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40">
            {status}
          </p>
          <ListingTitleEditor
            productId={productId}
            title={title}
            issues={titleIssues}
          />
          <p className="mt-1 text-sm text-[var(--foreground)]/50">
            {imageCount} image{imageCount === 1 ? "" : "s"}
            {videoUrl ? " · 1 video" : ""}
          </p>
          <Link
            href={`/products/${slug}`}
            target="_blank"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline"
          >
            View on store <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <BrandReassignmentCard
          productId={productId}
          current={brand}
          options={brandOptions}
          filedIn={filedIn}
        />

        <ColorEditorCard
          productId={productId}
          initialColors={colors}
          locked={colorsLocked}
        />

        <MotifEditorCard
          productId={productId}
          initialMotifs={motifs}
          locked={motifsLocked}
        />

        {isIphoneCase && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-bold">Style variations</h2>
            <p className="mt-1 text-xs text-[var(--foreground)]/60">
              Pick which add-ons this product ships with. The available styles
              update automatically.
            </p>

            <div className="mt-3 space-y-2">
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

            <div className="mt-3 rounded-xl bg-[var(--muted)] p-2.5">
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

            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="mt-3 text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              {advanced ? "Hide manual override" : "Customize styles manually"}
            </button>
            {advanced && (
              <div className="mt-2 space-y-1">
                {STYLES.map((s) => (
                  <label
                    key={s}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={styles.includes(s)}
                      disabled={s === "Case Only"}
                      onChange={() => toggleStyleManual(s)}
                    />
                    {s}
                    {s === "Case Only" && (
                      <span className="text-[11px] text-[var(--foreground)]/40">
                        (always)
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <button
            onClick={handleSave}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-3 font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          {result && (
            <p
              className={`mt-2 flex items-center justify-center gap-1 text-sm font-semibold ${
                result.ok ? "text-green-600" : "text-red-500"
              }`}
            >
              {result.ok && <Check className="h-4 w-4" />}
              {result.message}
            </p>
          )}
        </div>
      </aside>
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
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
