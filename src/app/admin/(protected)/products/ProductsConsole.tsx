"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Search,
  Check,
  X,
  Smartphone,
  Layers,
  Eye,
  EyeOff,
  Star,
  CheckSquare,
  Square,
  Video,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Loader2,
  FolderTree,
  CopyCheck,
  Magnet,
  Wand2,
  Sparkles,
  Tags,
  Eraser,
  Image as ImageIcon,
} from "lucide-react";
import { IPHONE_GENERATIONS, summarizeModels } from "@/lib/pricing";
import type { AdminProductOverview } from "@/lib/products";
import type { AdminCollectionOption } from "@/lib/collections";
import { deviceOfProductType, deviceProductTypes } from "@/lib/catalog/devices";
import type { TitleHealth } from "@/lib/catalog/listing-title-service";
import type { BrandOption } from "@/lib/catalog/brands";
import {
  classificationNeedsAction,
  type ClassificationHealth,
} from "@/lib/catalog/classification-health";
import { ClassificationCell } from "./ClassificationCell";
import { BrandManager } from "./BrandManager";
import {
  bulkUpdateProducts,
  bulkDeleteProducts,
  bulkRepairTitles,
  bulkRewriteTitles,
  adoptTitleBrand,
  purgeUnsupportedCollections,
  publishProduct,
  unpublishProduct,
  setFeatured,
  assignProductsToCollection,
  removeProductsFromCollection,
  bulkSetMagsafe,
  syncCollectionTaxonomy,
  type BulkUpdatePayload,
} from "./actions";
import { BulkEditor } from "./BulkEditor";
import {
  DeviceNavBar,
  type DeviceSelection,
  type DeviceCounts,
} from "./ProductsDeviceNav";
import { CollectionNavBar } from "./ProductsCollectionNav";

type StatusFilter = "all" | "draft" | "active" | "archived";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "active", label: "Live" },
  { id: "archived", label: "Archived" },
];

export function ProductsConsole({
  products,
  collectionOptions,
  initialCollectionId,
  magsafeReviewCount = 0,
  thumbnailReviewCount = 0,
  missingCollections = [],
  titleHealth = {},
  classification = {},
  brandOptions = [],
}: {
  products: AdminProductOverview[];
  collectionOptions: AdminCollectionOption[];
  initialCollectionId?: number;
  magsafeReviewCount?: number;
  thumbnailReviewCount?: number;
  /** Taxonomy nodes defined in config but absent from the database. */
  missingCollections?: { slug: string; name: string }[];
  /** Keyed by product id; only products with a defective title appear. */
  titleHealth?: Record<number, TitleHealth>;
  /** Keyed by product id; every product has an entry. */
  classification?: Record<number, ClassificationHealth>;
  /** The brand registry, for the inline classification editor. */
  brandOptions?: BrandOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deviceFilter, setDeviceFilter] = useState<DeviceSelection>("all");
  const [collectionFilter, setCollectionFilter] = useState<number | "all">(
    initialCollectionId &&
      collectionOptions.some((c) => c.id === initialCollectionId)
      ? initialCollectionId
      : "all",
  );
  const [titleIssuesOnly, setTitleIssuesOnly] = useState(false);
  const [brandIssuesOnly, setBrandIssuesOnly] = useState(false);
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    ids: number[];
    label: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const counts = useMemo(() => {
    const c = { all: products.length, draft: 0, active: 0, archived: 0 };
    for (const p of products) {
      if (p.status === "draft") c.draft += 1;
      else if (p.status === "active") c.active += 1;
      else if (p.status === "archived") c.archived += 1;
    }
    return c;
  }, [products]);

  // Live product count per device, keyed by device id — derived from each
  // product's `productType` via the shared device taxonomy. Powers the rail.
  const deviceCounts = useMemo<DeviceCounts>(() => {
    const counts: DeviceCounts = {};
    for (const p of products) {
      const device = deviceOfProductType(p.productType);
      if (device) counts[device.id] = (counts[device.id] ?? 0) + 1;
    }
    return counts;
  }, [products]);

  // The set of product types the active device maps to (empty = match all).
  const activeDeviceTypes = useMemo<Set<string>>(() => {
    if (deviceFilter === "all") return new Set();
    return new Set(deviceProductTypes(deviceFilter) ?? []);
  }, [deviceFilter]);

  // Collection filter is hierarchy-aware: selecting a brand (e.g. Sanrio) also
  // matches products tagged only under its characters. We expand the selection
  // to itself + all descendant ids using the parent links in the options.
  const collectionMatchIds = useMemo<Set<number> | null>(() => {
    if (collectionFilter === "all") return null;
    const childrenOf = new Map<number, number[]>();
    for (const o of collectionOptions) {
      if (o.parentId == null) continue;
      const arr = childrenOf.get(o.parentId) ?? [];
      arr.push(o.id);
      childrenOf.set(o.parentId, arr);
    }
    const ids = new Set<number>();
    const stack = [collectionFilter];
    while (stack.length) {
      const id = stack.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      for (const child of childrenOf.get(id) ?? []) stack.push(child);
    }
    return ids;
  }, [collectionFilter, collectionOptions]);

  // Everything except the brand facet — so brand pill counts can reflect the
  // active device / status / search scope without the brand filter masking it.
  const baseForCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (titleIssuesOnly && !titleHealth[p.id]) return false;
      if (brandIssuesOnly) {
        const state = classification[p.id]?.state;
        if (!state || !classificationNeedsAction(state)) return false;
      }
      if (activeDeviceTypes.size > 0 && !activeDeviceTypes.has(p.productType))
        return false;
      if (
        q &&
        !(p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [
    products,
    statusFilter,
    titleIssuesOnly,
    titleHealth,
    brandIssuesOnly,
    classification,
    activeDeviceTypes,
    query,
  ]);

  // Products whose identity is actively wrong — a contradicted brand, a
  // supplier name in the IP field, or a leftover brand collection.
  const brandErrorCount = useMemo(
    () =>
      products.filter((p) => {
        const state = classification[p.id]?.state;
        return state !== undefined && classificationNeedsAction(state);
      }).length,
    [products, classification],
  );

  // Titles making a false claim — a wrong device range or a contradicted brand.
  // Counted over the whole catalog, not the current view, because the badge is
  // a call to action rather than a description of what's on screen.
  const titleErrorCount = useMemo(
    () =>
      products.filter((p) => titleHealth[p.id]?.severity === "error").length,
    [products, titleHealth],
  );

  // Brand/character counts scoped to the current view, hierarchy-aware (a brand
  // tallies products in it or any of its characters). Each count therefore
  // equals the table size you'd get by selecting that pill.
  const collectionCounts = useMemo<Map<number, number>>(() => {
    const childrenOf = new Map<number, number[]>();
    for (const o of collectionOptions) {
      if (o.parentId == null) continue;
      const arr = childrenOf.get(o.parentId) ?? [];
      arr.push(o.id);
      childrenOf.set(o.parentId, arr);
    }
    const closure = (rootId: number) => {
      const set = new Set<number>();
      const stack = [rootId];
      while (stack.length) {
        const id = stack.pop()!;
        if (set.has(id)) continue;
        set.add(id);
        for (const child of childrenOf.get(id) ?? []) stack.push(child);
      }
      return set;
    };
    const counts = new Map<number, number>();
    for (const o of collectionOptions) {
      const set = closure(o.id);
      let n = 0;
      for (const p of baseForCollections) {
        if (p.collectionIds.some((id) => set.has(id))) n += 1;
      }
      counts.set(o.id, n);
    }
    return counts;
  }, [collectionOptions, baseForCollections]);

  const filtered = useMemo(() => {
    if (!collectionMatchIds) return baseForCollections;
    return baseForCollections.filter((p) =>
      p.collectionIds.some((id) => collectionMatchIds.has(id)),
    );
  }, [baseForCollections, collectionMatchIds]);

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function flash(result: { ok: boolean; message: string }) {
    setToast(result);
    if (result.ok) setTimeout(() => setToast(null), 3500);
  }

  // ── Quick per-selection status actions (no editor needed) ──────────────────
  function runBulk(payload: Omit<BulkUpdatePayload, "productIds">) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkUpdateProducts({ productIds: ids, ...payload });
      flash(res);
      if (res.ok) {
        clearSelection();
        router.refresh();
      }
    });
  }

  // ── Bulk collection membership (add / remove) ──────────────────────────────
  function runCollection(collectionId: number, mode: "add" | "remove") {
    const ids = [...selected];
    if (ids.length === 0 || !collectionId) return;
    startTransition(async () => {
      const res =
        mode === "add"
          ? await assignProductsToCollection(ids, collectionId)
          : await removeProductsFromCollection(ids, collectionId);
      flash(res);
      if (res.ok) {
        clearSelection();
        router.refresh();
      }
    });
  }

  // ── Rebuild titles from product data (deterministic, no AI) ───────────────
  function runTitleRepair() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkRepairTitles(ids);
      flash(res);
      if (res.ok && res.changed > 0) {
        clearSelection();
        router.refresh();
      }
    });
  }

  // ── Vision AI rewrite — always available for the current selection ────────
  function runTitleRewrite() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkRewriteTitles(ids);
      flash(res);
      if (res.ok && res.changed > 0) {
        clearSelection();
        router.refresh();
      }
    });
  }

  // ── Reclassify from the title, where the title knows better ───────────────
  function runAdoptTitleBrand() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await adoptTitleBrand(ids);
      flash(res);
      if (res.ok && res.changed > 0) {
        clearSelection();
        router.refresh();
      }
    });
  }

  // ── Drop brand collections nothing about the product supports ─────────────
  function runPurgeCollections() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await purgeUnsupportedCollections(ids);
      flash(res);
      if (res.ok && res.changed > 0) {
        clearSelection();
        router.refresh();
      }
    });
  }

  // ── Push the config taxonomy into the collections table ───────────────────
  function runTaxonomySync() {
    startTransition(async () => {
      const res = await syncCollectionTaxonomy();
      flash(res);
      if (res.ok) router.refresh();
    });
  }

  // ── Bulk MagSafe override (operator knows the spec; vision can't see it) ───
  function runMagsafe(magsafe: boolean) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkSetMagsafe(ids, magsafe);
      flash(res);
      if (res.ok) {
        clearSelection();
        router.refresh();
      }
    });
  }

  // ── Result handler for the bulk editor modal (both modes) ──────────────────
  function handleSaved(result: { ok: boolean; message: string }) {
    flash(result);
    if (result.ok) {
      setEditorOpen(false);
      clearSelection();
      router.refresh();
    }
  }

  // ── Delete flow (single row or bulk), always behind a confirmation ─────────
  function confirmDelete() {
    if (!deleteTarget) return;
    const ids = deleteTarget.ids;
    startTransition(async () => {
      const res = await bulkDeleteProducts(ids);
      flash(res);
      setDeleteTarget(null);
      if (res.ok) {
        clearSelection();
        router.refresh();
      }
    });
  }

  const selectedProducts = useMemo(
    () => products.filter((p) => selected.has(p.id)),
    [products, selected],
  );
  // Stable reference while the modal is open (selection can't change behind it),
  // so the per-product workspace's data-fetch effect won't re-run and wipe edits.
  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedCaseCount = selectedProducts.filter(
    (p) => p.productType === "iphone_case",
  ).length;
  // How many of the selection the deterministic repair would actually change,
  // so the button can say what it will do instead of promising a no-op.
  const selectedRepairableTitles = selectedProducts.filter(
    (p) => titleHealth[p.id]?.repairable,
  ).length;
  const selectedMisfiled = selectedProducts.filter(
    (p) => (classification[p.id]?.unsupportedSlugs.length ?? 0) > 0,
  ).length;
  // Rows whose title names an IP the stored classification doesn't match — the
  // ones "Use title brand" would actually move.
  const selectedAdoptable = selectedProducts.filter((p) => {
    const health = classification[p.id];
    if (!health?.titleReadsAs) return false;
    return (
      health.titleReadsAs !== (health.characterName ?? health.brandName)
    );
  }).length;

  // The collection the bulk picker should land on: the selection's own brand /
  // character, not the first node in the taxonomy tree (which is almost always
  // Sanrio and has nothing to do with a selected Miffy row).
  const suggestedCollectionId = useMemo(
    () =>
      preferredCollectionId(
        selectedIds,
        classification,
        collectionOptions,
      ),
    [selectedIds, classification, collectionOptions],
  );

  // Only label each row with its device type when it's actually ambiguous — i.e.
  // the unfiltered list spans more than one device. Inside a single-device view
  // (or a single-device catalog) the type is implied by the active nav pill, so
  // the badge is noise. Keeps rows clean as the catalog grows past iPhone cases.
  const showTypeBadge =
    deviceFilter === "all" && Object.keys(deviceCounts).length > 1;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <BrandManager
        open={brandManagerOpen}
        onClose={() => setBrandManagerOpen(false)}
      />
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Product Admin</h1>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Browse the catalog by device, review drafts, and bulk-edit
            variations &amp; availability — every product&apos;s state at a
            glance.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {titleErrorCount > 0 && (
            <button
              type="button"
              onClick={() => setTitleIssuesOnly((on) => !on)}
              title="Titles that claim a device range or a character the product doesn't match"
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${
                titleIssuesOnly
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <TriangleAlert className="h-4 w-4" /> Title issues
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${
                  titleIssuesOnly ? "bg-white text-red-600" : "bg-red-500 text-white"
                }`}
              >
                {titleErrorCount}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setBrandManagerOpen(true)}
            title="Add, rename or remove the brands and characters products can be classified into"
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Tags className="h-4 w-4" /> Brands
          </button>
          {brandErrorCount > 0 && (
            <button
              type="button"
              onClick={() => setBrandIssuesOnly((on) => !on)}
              title="Products whose brand field, title and collections disagree"
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${
                brandIssuesOnly
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
              }`}
            >
              <Tags className="h-4 w-4" /> Wrong brand
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${
                  brandIssuesOnly
                    ? "bg-white text-orange-600"
                    : "bg-orange-500 text-white"
                }`}
              >
                {brandErrorCount}
              </span>
            </button>
          )}
          {magsafeReviewCount > 0 && (
            <Link
              href="/admin/products/magsafe-review"
              className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-semibold text-amber-700 hover:bg-amber-100"
            >
              <Magnet className="h-4 w-4" /> MagSafe review
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[11px] text-white">
                {magsafeReviewCount}
              </span>
            </Link>
          )}
          <Link
            href="/admin/products/thumbnails"
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <ImageIcon className="h-4 w-4" /> Thumbnails
            {thumbnailReviewCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 text-[11px] text-white">
                {thumbnailReviewCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/products/duplicates"
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <CopyCheck className="h-4 w-4" /> Find duplicates
          </Link>
          <span className="rounded-full bg-[var(--muted)] px-3 py-1 font-semibold">
            {counts.all} products
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
            {counts.draft} drafts
          </span>
        </div>
      </div>

      {/* ── Taxonomy drift ──────────────────────────────────────────────── */}
      {missingCollections.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm text-amber-800">
            <span className="font-bold">
              {missingCollections.length} collection
              {missingCollections.length === 1 ? "" : "s"} missing:
            </span>{" "}
            {missingCollections.map((c) => c.name).join(", ")}. They exist in the
            taxonomy config but not in the database, so they can&apos;t be
            assigned or browsed yet.
          </p>
          <button
            onClick={runTaxonomySync}
            disabled={pending}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-600 px-3.5 py-1.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderTree className="h-4 w-4" />
            )}
            Sync taxonomy
          </button>
        </div>
      )}

      {/* ── Device navigation bar — the primary "shop by device" axis ───── */}
      <DeviceNavBar
        counts={deviceCounts}
        total={counts.all}
        active={deviceFilter}
        onSelect={setDeviceFilter}
      />

      {/* ── Brand / character navigation — the marketing browse axis ─────── */}
      {collectionOptions.length > 0 && (
        <CollectionNavBar
          options={collectionOptions}
          counts={collectionCounts}
          active={collectionFilter}
          onSelect={setCollectionFilter}
        />
      )}

      {/* ── Toolbar: search + status filter ─────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:min-w-[260px] sm:flex-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or slug…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--primary)] sm:w-72"
          />
        </div>
        <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                statusFilter === tab.id
                  ? "bg-[var(--primary)] text-white"
                  : "hover:bg-[var(--muted)]"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-60">
                {tab.id === "all" ? counts.all : counts[tab.id]}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={toggleAllFiltered}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)]"
        >
          {allFilteredSelected ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {allFilteredSelected ? "Deselect all" : "Select all"}
          <span className="opacity-60">({filteredIds.length})</span>
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        {/* Column headers (md+) */}
        <div className="hidden grid-cols-[40px_minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.4fr)_120px] items-center gap-3 border-b border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--foreground)]/50 md:grid">
          <span />
          <span>Product</span>
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> Variations
          </span>
          <span className="flex items-center gap-1">
            <Smartphone className="h-3.5 w-3.5" /> Device fit
          </span>
          <span className="text-right">Actions</span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-[var(--foreground)]/60">
            No products match your filters.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                selected={selected.has(p.id)}
                showTypeBadge={showTypeBadge}
                titleHealth={titleHealth[p.id] ?? null}
                classification={classification[p.id] ?? null}
                brandOptions={brandOptions}
                collectionOptions={collectionOptions}
                onToggle={() => toggleOne(p.id)}
                pending={pending}
                onPublishToggle={() =>
                  startTransition(async () => {
                    if (p.status === "active") await unpublishProduct(p.id);
                    else await publishProduct(p.id);
                  })
                }
                onFeatureToggle={() =>
                  startTransition(async () => {
                    await setFeatured(p.id, !p.featured);
                  })
                }
                onDelete={() =>
                  setDeleteTarget({ ids: [p.id], label: p.title })
                }
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
            toast.ok ? "bg-green-600 text-white" : "bg-red-500 text-white"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {toast.ok ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {toast.message}
          </span>
        </div>
      )}

      {/* ── Sticky bulk action bar ──────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <span className="flex items-center gap-2 text-sm font-bold">
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[var(--primary)] px-2 text-white">
                {selected.size}
              </span>
              selected
            </span>
            <button
              onClick={clearSelection}
              className="text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
            >
              Clear
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {collectionOptions.length > 0 && (
                <CollectionAssignControl
                  key={suggestedCollectionId || "none"}
                  options={collectionOptions}
                  suggestedId={suggestedCollectionId}
                  pending={pending}
                  onApply={runCollection}
                />
              )}
              <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background)] p-1">
                <Magnet className="ml-1.5 h-4 w-4 text-[var(--foreground)]/40" />
                <button
                  onClick={() => runMagsafe(true)}
                  disabled={pending}
                  title="Mark selected as MagSafe"
                  className="rounded-full bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  MagSafe
                </button>
                <button
                  onClick={() => runMagsafe(false)}
                  disabled={pending}
                  title="Remove MagSafe from selected"
                  className="rounded-full px-2 py-1 text-xs font-bold text-[var(--foreground)]/60 hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
              <button
                onClick={runTitleRewrite}
                disabled={pending}
                title={`Rewrite ${selected.size} title${selected.size === 1 ? "" : "s"} from product photos with vision AI, using each product's current brand. Takes a few seconds per product.`}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Regenerate titles
              </button>
              <button
                onClick={runTitleRepair}
                disabled={pending || selectedRepairableTitles === 0}
                title={
                  selectedRepairableTitles === 0
                    ? "No selected title can be rebuilt from product data alone — use Regenerate titles for a vision rewrite."
                    : `Quick-fix ${selectedRepairableTitles} title${selectedRepairableTitles === 1 ? "" : "s"} from brand, variants and MagSafe. Free, no AI.`
                }
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-40"
              >
                <Wand2 className="h-4 w-4" /> Quick fix
                {selectedRepairableTitles > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[11px] text-white">
                    {selectedRepairableTitles}
                  </span>
                )}
              </button>
              <button
                onClick={runAdoptTitleBrand}
                disabled={pending || selectedAdoptable === 0}
                title={
                  selectedAdoptable === 0
                    ? "No selected title names a brand that differs from its current classification."
                    : `Set ${selectedAdoptable} product${selectedAdoptable === 1 ? "" : "s"} to the character their own title names, and re-file them.`
                }
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-40"
              >
                <Tags className="h-4 w-4" /> Use title brand
                {selectedAdoptable > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[11px] text-white">
                    {selectedAdoptable}
                  </span>
                )}
              </button>
              <button
                onClick={runPurgeCollections}
                disabled={pending || selectedMisfiled === 0}
                title={
                  selectedMisfiled === 0
                    ? "Every brand collection in this selection is supported."
                    : `Remove brand collections that ${selectedMisfiled} selected product${selectedMisfiled === 1 ? "" : "s"} should not be in. Genre and feature collections are untouched.`
                }
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-40"
              >
                <Eraser className="h-4 w-4" /> Unfile
                {selectedMisfiled > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[11px] text-white">
                    {selectedMisfiled}
                  </span>
                )}
              </button>
              <button
                onClick={() => runBulk({ status: "active" })}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-50"
              >
                <Eye className="h-4 w-4" /> Publish
              </button>
              <button
                onClick={() => runBulk({ status: "draft" })}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-50"
              >
                <EyeOff className="h-4 w-4" /> Unpublish
              </button>
              <button
                onClick={() =>
                  setDeleteTarget({
                    ids: selectedIds,
                    label: `${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"}`,
                  })
                }
                disabled={pending}
                className="flex items-center gap-1.5 rounded-full border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
              <button
                onClick={() => setEditorOpen(true)}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                <SlidersHorizontal className="h-4 w-4" /> Edit variations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk editor modal ───────────────────────────────────────────── */}
      {editorOpen && (
        <BulkEditor
          productIds={selectedIds}
          caseCount={selectedCaseCount}
          onClose={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmDeleteDialog
          label={deleteTarget.label}
          count={deleteTarget.ids.length}
          pending={pending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Destructive-action confirmation. Deletion is irreversible, so we always make
// the operator confirm and clearly state the media-cleanup consequence.
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmDeleteDialog({
  label,
  count,
  pending,
  onCancel,
  onConfirm,
}: {
  label: string;
  count: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black">
              Delete {count === 1 ? "product" : `${count} products`}?
            </h2>
            <p className="mt-1 text-sm text-[var(--foreground)]/65">
              {count === 1 ? (
                <>
                  <span className="font-semibold text-[var(--foreground)]">
                    {label}
                  </span>{" "}
                  will be permanently removed.
                </>
              ) : (
                <>
                  <span className="font-semibold text-[var(--foreground)]">
                    {label}
                  </span>{" "}
                  will be permanently removed.
                </>
              )}{" "}
              Their images and videos are also deleted from storage. This
              can&apos;t be undone.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete{count > 1 ? ` ${count}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One product row — the at-a-glance state panel for a single product.
// ─────────────────────────────────────────────────────────────────────────────
function ProductRow({
  product,
  selected,
  showTypeBadge,
  titleHealth,
  classification,
  brandOptions,
  collectionOptions,
  onToggle,
  pending,
  onPublishToggle,
  onFeatureToggle,
  onDelete,
}: {
  product: AdminProductOverview;
  selected: boolean;
  /** Show the device-type chip only when the list spans multiple devices. */
  showTypeBadge: boolean;
  /** Set when this title fails the listing-title contract. */
  titleHealth: TitleHealth | null;
  /** This product's identity verdict, or null before the audit has loaded. */
  classification: ClassificationHealth | null;
  brandOptions: BrandOption[];
  collectionOptions: AdminCollectionOption[];
  onToggle: () => void;
  pending: boolean;
  onPublishToggle: () => void;
  onFeatureToggle: () => void;
  onDelete: () => void;
}) {
  const isCase = product.productType === "iphone_case";
  return (
    <li
      className={`grid grid-cols-[40px_1fr] items-start gap-3 px-3 py-3 transition md:grid-cols-[40px_minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.4fr)_120px] md:items-center ${
        selected ? "bg-[var(--primary)]/5" : "hover:bg-[var(--muted)]/40"
      }`}
    >
      {/* checkbox */}
      <button
        onClick={onToggle}
        className="grid h-9 w-9 place-items-center self-center text-[var(--foreground)]/50 hover:text-[var(--primary)]"
        aria-label={selected ? "Deselect" : "Select"}
      >
        {selected ? (
          <CheckSquare className="h-5 w-5 text-[var(--primary)]" />
        ) : (
          <Square className="h-5 w-5" />
        )}
      </button>

      {/* product identity */}
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href={`/admin/products/${product.id}`}
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)]"
        >
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="64px"
              className="object-cover"
            />
          )}
          {product.hasVideo && (
            <span
              title="Has product video"
              className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white"
            >
              <Video className="h-2.5 w-2.5" />
            </span>
          )}
        </Link>
        <div className="min-w-0">
          <p className="flex items-start gap-1.5 font-semibold leading-snug">
            <Link
              href={`/admin/products/${product.id}`}
              className="break-words hover:text-[var(--primary)] hover:underline"
            >
              {product.title}
            </Link>
            {product.featured && (
              <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-[var(--accent)] text-[var(--accent)]" />
            )}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={product.status} />
            {titleHealth && (
              <TitleHealthBadge
                productId={product.id}
                health={titleHealth}
              />
            )}
            {showTypeBadge && (
              <ClassBadge title="Product type">
                {product.productTypeLabel}
              </ClassBadge>
            )}
            {product.isMagsafe && (
              <ClassBadge
                tone="indigo"
                title="MagSafe compatible"
                icon={<Magnet className="h-3 w-3" />}
              >
                MagSafe
              </ClassBadge>
            )}
            {product.needsMagsafeReview && (
              <ClassBadge
                tone="amber"
                title="MagSafe detected with low confidence — needs review"
                icon={<Magnet className="h-3 w-3" />}
              >
                Review
              </ClassBadge>
            )}
          </p>
          {classification && (
            <ClassificationCell
              productId={product.id}
              health={classification}
              brandOptions={brandOptions}
              collectionOptions={collectionOptions}
            />
          )}
        </div>
      </div>

      {/* variations */}
      <div className="col-start-2 min-w-0 md:col-start-auto">
        {!isCase ? (
          <span className="text-xs italic text-[var(--foreground)]/40">—</span>
        ) : product.availableStyles.length === 0 ? (
          <span className="text-xs italic text-[var(--foreground)]/40">
            not set
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {product.availableStyles.map((s) => (
              <span
                key={s}
                className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-semibold"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* device fit */}
      <div className="col-start-2 min-w-0 md:col-start-auto">
        {!isCase ? (
          <span className="text-xs italic text-[var(--foreground)]/40">—</span>
        ) : (
          <ModelBadges models={product.availableModels} />
        )}
      </div>

      {/* actions */}
      <div className="col-start-2 flex items-center justify-start gap-1 md:col-start-auto md:justify-end">
        <Link
          href={`/admin/products/${product.id}`}
          className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary)] hover:text-white"
        >
          Manage
        </Link>
        <button
          onClick={onFeatureToggle}
          disabled={pending}
          title={product.featured ? "Unfeature" : "Feature"}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)] disabled:opacity-40"
        >
          <Star
            className={`h-4 w-4 ${product.featured ? "fill-[var(--accent)] text-[var(--accent)]" : ""}`}
          />
        </button>
        <button
          onClick={onPublishToggle}
          disabled={pending}
          title={product.status === "active" ? "Unpublish" : "Publish"}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)] disabled:opacity-40"
        >
          {product.status === "active" ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          title="Delete product"
          className="grid h-8 w-8 place-items-center rounded-full text-red-500 hover:bg-red-50 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline collection assignment for the bulk bar: pick a collection, then add or
// remove the current selection from it.
// ─────────────────────────────────────────────────────────────────────────────
function CollectionAssignControl({
  options,
  suggestedId,
  pending,
  onApply,
}: {
  options: AdminCollectionOption[];
  /** Pre-select the collection that matches the current selection's brand. */
  suggestedId: number;
  pending: boolean;
  onApply: (collectionId: number, mode: "add" | "remove") => void;
}) {
  const initial =
    suggestedId && options.some((c) => c.id === suggestedId)
      ? suggestedId
      : (options[0]?.id ?? 0);
  const [value, setValue] = useState<number>(initial);
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background)] p-1">
      <FolderTree className="ml-1.5 h-4 w-4 text-[var(--foreground)]/40" />
      <select
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        disabled={pending}
        title="Defaults to the brand/character of the selected product(s)"
        className="max-w-[180px] bg-transparent py-1 text-sm font-semibold outline-none"
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {"\u00A0".repeat(c.depth * 2)}
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => value && onApply(value, "add")}
        disabled={pending || !value}
        title="Add selection to this collection"
        className="rounded-full bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        Add
      </button>
      <button
        onClick={() => value && onApply(value, "remove")}
        disabled={pending || !value}
        title="Remove selection from this collection"
        className="rounded-full px-2 py-1 text-xs font-bold text-[var(--foreground)]/60 hover:bg-[var(--muted)] disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}

/**
 * The collection id the bulk bar should open on for the current selection.
 *
 * Character beats brand (Miffy over Sanrio). When several products are
 * selected, majority wins; ties fall through to the first vote so the picker
 * still reflects *something* about the selection rather than the taxonomy root.
 */
function preferredCollectionId(
  selectedIds: number[],
  classification: Record<number, ClassificationHealth>,
  options: AdminCollectionOption[],
): number {
  if (selectedIds.length === 0 || options.length === 0) {
    return options[0]?.id ?? 0;
  }

  const votes = new Map<number, number>();
  for (const id of selectedIds) {
    const pick = collectionIdForHealth(classification[id], options);
    if (pick == null) continue;
    votes.set(pick, (votes.get(pick) ?? 0) + 1);
  }

  if (votes.size === 0) return options[0]?.id ?? 0;

  let bestId = options[0]?.id ?? 0;
  let bestCount = -1;
  for (const [collectionId, count] of votes) {
    if (count > bestCount) {
      bestId = collectionId;
      bestCount = count;
    }
  }
  return bestId;
}

/** One product → its most specific brand/character collection, if any. */
function collectionIdForHealth(
  health: ClassificationHealth | undefined,
  options: AdminCollectionOption[],
): number | null {
  if (!health) return null;

  const bySlug = new Map(options.map((o) => [o.slug, o]));
  const filed = health.brandSlugs
    .map((slug) => bySlug.get(slug))
    .filter((o): o is AdminCollectionOption => Boolean(o));

  // Character identity wins over a parent brand filing. A Miffy product that
  // happens to also sit under Sanrio must still open the picker on Miffy —
  // otherwise the bulk bar looks like it forgot what you selected.
  if (health.characterName) {
    const named = options.find(
      (o) => o.kind === "character" && o.name === health.characterName,
    );
    if (named) return named.id;
  }

  const filedCharacter = filed.find((o) => o.kind === "character");
  if (filedCharacter) return filedCharacter.id;

  if (health.brandName) {
    const named = options.find(
      (o) => o.kind === "brand" && o.name === health.brandName,
    );
    if (named) return named.id;
  }

  const filedBrand = filed.find((o) => o.kind === "brand");
  if (filedBrand) return filedBrand.id;

  return null;
}

/**
 * A small, dot-led status pill. Uses buyer-facing wording ("Live") that matches
 * the status tabs, with a calm ring + tint per state for instant scannability.
 */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; dot: string; cls: string }> = {
    active: {
      label: "Live",
      dot: "bg-green-500",
      cls: "bg-green-50 text-green-700 ring-green-600/20",
    },
    draft: {
      label: "Draft",
      dot: "bg-amber-500",
      cls: "bg-amber-50 text-amber-700 ring-amber-600/20",
    },
    archived: {
      label: "Archived",
      dot: "bg-gray-400",
      cls: "bg-gray-100 text-gray-600 ring-gray-500/20",
    },
  };
  const s = map[status] ?? {
    label: status,
    dot: "bg-gray-400",
    cls: "bg-[var(--muted)] text-[var(--foreground)]/60 ring-black/5",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ring-1 ring-inset ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/**
 * A neutral classification pill (product type, MagSafe, review flags). Shares
 * the exact shape/size of StatusBadge so the whole row reads as one tidy, legible
 * row of tags rather than a jumble of mismatched chips.
 */
function ClassBadge({
  children,
  tone = "neutral",
  icon,
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "indigo" | "amber";
  icon?: React.ReactNode;
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[var(--muted)] text-[var(--foreground)]/65 ring-black/5",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * The row's entry point into title repair.
 *
 * A title advertising an iPhone the product doesn't fit looks exactly like a
 * correct one in a list, so the defect has to announce itself here — with the
 * reason on hover and a direct link to the panel that fixes it. Without this,
 * the only way to find a bad title is to open all 112 products.
 */
function TitleHealthBadge({
  productId,
  health,
}: {
  productId: number;
  health: TitleHealth;
}) {
  const error = health.severity === "error";
  return (
    <Link
      href={`/admin/products/${productId}`}
      title={`${health.details.join("\n")}\n\nOpen to fix.`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
        error
          ? "bg-red-50 text-red-700 ring-red-600/20 hover:bg-red-100"
          : "bg-amber-50 text-amber-700 ring-amber-600/20 hover:bg-amber-100"
      }`}
    >
      <TriangleAlert className="h-3 w-3" />
      {error ? "Title wrong" : "Title weak"}
    </Link>
  );
}

/** Compact per-generation availability badges, e.g. 14·3  15·3  16·3  17·3. */
function ModelBadges({ models }: { models: string[] }) {
  if (models.length === 0) {
    return (
      <span className="text-xs italic text-[var(--foreground)]/40">
        not set
      </span>
    );
  }
  const set = new Set(models);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--foreground)]/70">
        {summarizeModels(models)}
      </span>
      <div className="flex flex-wrap gap-1">
        {IPHONE_GENERATIONS.map((gen) => {
          const have = gen.models.filter((m) => set.has(m)).length;
          const total = gen.models.length;
          const state =
            have === 0 ? "none" : have === total ? "full" : "partial";
          return (
            <span
              key={gen.id}
              title={`${gen.label}: ${have}/${total}`}
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                state === "full"
                  ? "bg-[var(--primary)] text-white"
                  : state === "partial"
                    ? "border border-[var(--primary)] text-[var(--primary)]"
                    : "bg-[var(--muted)] text-[var(--foreground)]/35"
              }`}
            >
              {gen.id}
              {state === "partial" && `·${have}`}
            </span>
          );
        })}
      </div>
    </div>
  );
}
