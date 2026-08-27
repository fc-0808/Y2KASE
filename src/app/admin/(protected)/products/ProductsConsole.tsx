"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  const bulkBarRef = useRef<HTMLDivElement>(null);
  const hasSelection = selected.size > 0;

  // Reserve exactly the space claimed by the fixed bulk-action bar. Its height
  // varies substantially as actions wrap on narrow screens, so a fixed padding
  // would either hide the final rows or waste space. The shared variable also
  // keeps global fixed UI (for example, support) above this page-owned bar.
  useEffect(() => {
    const bar = bulkBarRef.current;
    if (!bar || !hasSelection) return;

    const root = document.documentElement;
    const publishHeight = () => {
      root.style.setProperty("--bottom-bar-h", `${bar.offsetHeight}px`);
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(bar);

    return () => {
      observer.disconnect();
      root.style.removeProperty("--bottom-bar-h");
    };
  }, [hasSelection]);

  const counts = useMemo(() => {
    const c = { all: products.length, draft: 0, active: 0, archived: 0 };
    for (const p of products) {
      if (p.status === "draft") c.draft += 1;
      else if (p.status === "active") c.active += 1;
      else if (p.status === "archived") c.archived += 1;
    }
    return c;
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

  // Shared scope for both taxonomy facets. Device and collection membership
  // are applied separately below, so each facet can show the result count a
  // user would get without its own current selection masking alternatives.
  const commonFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (titleIssuesOnly && !titleHealth[p.id]) return false;
      if (brandIssuesOnly) {
        const state = classification[p.id]?.state;
        if (!state || !classificationNeedsAction(state)) return false;
      }
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
    query,
  ]);

  // Everything except the collection facet.
  const baseForCollections = useMemo(() => {
    if (activeDeviceTypes.size === 0) return commonFiltered;
    return commonFiltered.filter((p) => activeDeviceTypes.has(p.productType));
  }, [activeDeviceTypes, commonFiltered]);

  // Everything except the device facet.
  const baseForDevices = useMemo(() => {
    if (!collectionMatchIds) return commonFiltered;
    return commonFiltered.filter((p) =>
      p.collectionIds.some((id) => collectionMatchIds.has(id)),
    );
  }, [collectionMatchIds, commonFiltered]);

  const deviceCounts = useMemo<DeviceCounts>(() => {
    const scopedCounts: DeviceCounts = {};
    for (const p of baseForDevices) {
      const device = deviceOfProductType(p.productType);
      if (device) {
        scopedCounts[device.id] = (scopedCounts[device.id] ?? 0) + 1;
      }
    }
    return scopedCounts;
  }, [baseForDevices]);

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
  const hasActiveFilters =
    query.trim().length > 0 ||
    statusFilter !== "all" ||
    deviceFilter !== "all" ||
    collectionFilter !== "all" ||
    titleIssuesOnly ||
    brandIssuesOnly;

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setDeviceFilter("all");
    setCollectionFilter("all");
    setTitleIssuesOnly(false);
    setBrandIssuesOnly(false);
  }

  return (
    <div className="mx-auto w-full max-w-400 px-4 py-8 sm:px-6 lg:px-8">
      <BrandManager
        open={brandManagerOpen}
        onClose={() => setBrandManagerOpen(false)}
      />
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-sans text-2xl font-bold tracking-tight">
              Products
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Manage catalog content, availability, and product health.
            </p>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-foreground/55">
            <span>
              <strong className="font-bold tabular-nums text-foreground">
                {counts.all}
              </strong>{" "}
              total
            </span>
            <span>
              <strong className="font-bold tabular-nums text-emerald-700">
                {counts.active}
              </strong>{" "}
              live
            </span>
            <span>
              <strong className="font-bold tabular-nums text-amber-700">
                {counts.draft}
              </strong>{" "}
              drafts
            </span>
          </p>
        </div>

        <div
          role="group"
          className="mt-4 flex flex-wrap items-center gap-2"
          aria-label="Product tools"
        >
          {titleErrorCount > 0 && (
            <button
              type="button"
              onClick={() => setTitleIssuesOnly((on) => !on)}
              aria-pressed={titleIssuesOnly}
              title="Titles that claim a device range or a character the product doesn't match"
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                titleIssuesOnly
                  ? "border-red-400 bg-red-100 text-red-800"
                  : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <TriangleAlert className="h-4 w-4" /> Title issues
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${
                  titleIssuesOnly
                    ? "bg-red-700 text-white"
                    : "bg-red-500 text-white"
                }`}
              >
                {titleErrorCount}
              </span>
            </button>
          )}
          {brandErrorCount > 0 && (
            <button
              type="button"
              onClick={() => setBrandIssuesOnly((on) => !on)}
              aria-pressed={brandIssuesOnly}
              title="Products whose brand field, title and collections disagree"
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                brandIssuesOnly
                  ? "border-orange-400 bg-orange-100 text-orange-800"
                  : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
              }`}
            >
              <Tags className="h-4 w-4" /> Wrong brand
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${
                  brandIssuesOnly
                    ? "bg-orange-700 text-white"
                    : "bg-orange-600 text-white"
                }`}
              >
                {brandErrorCount}
              </span>
            </button>
          )}
          {magsafeReviewCount > 0 && (
            <Link
              href="/admin/products/magsafe-review"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Magnet className="h-4 w-4" /> MagSafe review
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-200 px-1 text-[11px] text-amber-900">
                {magsafeReviewCount}
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setBrandManagerOpen(true)}
            title="Add, rename or remove the brands and characters products can be classified into"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground/70 transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Tags className="h-4 w-4" /> Brand registry
          </button>
          <Link
            href="/admin/products/thumbnails"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground/70 transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ImageIcon className="h-4 w-4" /> Thumbnails
            {thumbnailReviewCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-soft px-1 text-[11px] text-foreground">
                {thumbnailReviewCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/products/duplicates"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground/70 transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CopyCheck className="h-4 w-4" /> Find duplicates
          </Link>
        </div>
      </header>

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

      {/* ── Catalog facets ───────────────────────────────────────────────── */}
      <section
        aria-label="Catalog filters"
        className="mb-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <DeviceNavBar
          counts={deviceCounts}
          total={baseForDevices.length}
          active={deviceFilter}
          onSelect={setDeviceFilter}
        />
        {collectionOptions.length > 0 && (
          <CollectionNavBar
            options={collectionOptions}
            counts={collectionCounts}
            total={baseForCollections.length}
            active={collectionFilter}
            onSelect={setCollectionFilter}
          />
        )}
      </section>

      {/* ── Toolbar: search + status filter ─────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="search"
            aria-label="Search products by title or slug"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or slug…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm outline-none transition placeholder:text-foreground/35 focus:border-primary focus:ring-2 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear product search"
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-foreground/40 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div
            role="group"
            aria-label="Filter products by status"
            className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1"
          >
            {STATUS_TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                aria-pressed={statusFilter === tab.id}
                className={`min-h-8 rounded-md px-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  statusFilter === tab.id
                    ? "bg-primary-soft text-foreground shadow-sm"
                    : "text-foreground/65 hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 tabular-nums opacity-55">
                  {tab.id === "all" ? counts.all : counts[tab.id]}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleAllFiltered}
            disabled={filteredIds.length === 0}
            aria-pressed={allFilteredSelected}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground/70 transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allFilteredSelected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {allFilteredSelected ? "Deselect all" : "Select all"}
            <span className="tabular-nums opacity-55">
              ({filteredIds.length})
            </span>
          </button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Column headers (xl+); narrower admin shells use labeled card rows. */}
        <div className="hidden grid-cols-[40px_minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.4fr)_120px] items-center gap-3 border-b border-border bg-muted/60 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-foreground/50 xl:grid">
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
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <Search className="mb-3 h-6 w-6 text-foreground/30" />
            <p className="text-sm font-semibold text-foreground/70">
              {hasActiveFilters
                ? "No products match these filters."
                : "No products are available yet."}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground/70 transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
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
          style={{
            bottom: "calc(var(--bottom-bar-h, 0px) + 1rem)",
          }}
          className={`fixed left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
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
      {hasSelection && (
        <div
          ref={bulkBarRef}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 shadow-[0_-12px_32px_-24px_rgba(52,32,59,0.45)] backdrop-blur lg:left-64"
        >
          <div className="mx-auto flex max-w-400 flex-wrap items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
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
      className={`grid grid-cols-[40px_1fr] items-start gap-3 px-3 py-3.5 transition xl:grid-cols-[40px_minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.4fr)_120px] xl:items-center ${
        selected ? "bg-primary/5" : "hover:bg-muted/40"
      }`}
    >
      {/* checkbox */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className="grid h-9 w-9 place-items-center self-center rounded-lg text-foreground/50 transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${selected ? "Deselect" : "Select"} ${product.title}`}
      >
        {selected ? (
          <CheckSquare className="h-5 w-5 text-primary" />
        ) : (
          <Square className="h-5 w-5" />
        )}
      </button>

      {/* product identity */}
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href={`/admin/products/${product.id}`}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              className="wrap-break-word rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {product.title}
            </Link>
            {product.featured && (
              <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-accent text-accent" />
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
      <div className="col-start-2 min-w-0 xl:col-start-auto">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-foreground/40 xl:hidden">
          Variations
        </p>
        {!isCase ? (
          <span className="text-xs italic text-foreground/40">—</span>
        ) : product.availableStyles.length === 0 ? (
          <span className="text-xs italic text-foreground/40">
            not set
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {product.availableStyles.map((s) => (
              <span
                key={s}
                className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* device fit */}
      <div className="col-start-2 min-w-0 xl:col-start-auto">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-foreground/40 xl:hidden">
          Device fit
        </p>
        {!isCase ? (
          <span className="text-xs italic text-foreground/40">—</span>
        ) : (
          <ModelBadges models={product.availableModels} />
        )}
      </div>

      {/* actions */}
      <div className="col-start-2 flex items-center justify-start gap-1 xl:col-start-auto xl:justify-end">
        <Link
          href={`/admin/products/${product.id}`}
          className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold transition hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Manage
        </Link>
        <button
          type="button"
          onClick={onFeatureToggle}
          disabled={pending}
          title={product.featured ? "Unfeature" : "Feature"}
          aria-label={product.featured ? "Unfeature product" : "Feature product"}
          className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <Star
            className={`h-4 w-4 ${product.featured ? "fill-accent text-accent" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={onPublishToggle}
          disabled={pending}
          title={product.status === "active" ? "Unpublish" : "Publish"}
          aria-label={
            product.status === "active" ? "Unpublish product" : "Publish product"
          }
          className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          {product.status === "active" ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          title="Delete product"
          aria-label="Delete product"
          className="grid h-8 w-8 place-items-center rounded-lg text-red-500 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40"
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
