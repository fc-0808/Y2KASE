"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Check,
  Flag,
  SkipForward,
  Sparkles,
  Loader2,
  Wand2,
  ExternalLink,
  Pencil,
  RefreshCw,
  Clock,
  Rocket,
  StopCircle,
  X,
  Upload,
  Crop,
  Eraser,
  Globe,
  Undo2,
  Redo2,
  ChevronDown,
} from "lucide-react";
import {
  generateThumbnailProposals,
  generateThumbnailProposal,
  approveThumbnailProposal,
  decideThumbnailProposal,
  aiCleanupThumbnail,
  aiRemoveThumbnailArtifact,
  bulkApproveThumbnails,
  bulkDecideThumbnails,
  bulkRegenerateThumbnails,
  adjustThumbnailCrop,
  removeThumbnailBackground,
  restorePreviousThumbnail,
  redoThumbnail,
  readThumbnailReviewCard,
} from "../actions";
import type { ThumbnailQueueStats } from "@/lib/admin/thumbnails";
import {
  THUMBNAIL_SCOPES,
  SCOPE_LABELS,
  DEFAULT_THUMBNAIL_SCOPE,
  type ThumbnailScope,
} from "@/lib/admin/thumbnail-scope";
import {
  PRODUCT_PAGE_LINK_ATTRS,
  adminProductEditorHref,
  productPageHref,
  productPageLinkLabel,
} from "@/lib/catalog/product-page";
import { RETRIES_EXHAUSTED_MARK } from "@/lib/catalog/thumbnail-route";
import { ThumbnailCropModal } from "./ThumbnailCropModal";

type Item = {
  productId: number;
  slug: string;
  title: string;
  /** `active` | `draft`. Drafts aren't on the storefront yet. */
  productStatus: string;
  currentUrl: string | null;
  proposalUrl: string;
  /** Replaced previews Previous can restore. */
  previousCount: number;
  /** Previews Redo can bring back after Previous. */
  nextCount: number;
  score: number | null;
  category: string | null;
  reason: string | null;
};
type FlaggedItem = Omit<Item, "proposalUrl"> & { proposalUrl: string | null };
type BasicItem = Pick<
  Item,
  "productId" | "slug" | "title" | "productStatus" | "currentUrl"
>;

type ActionResult = { ok: boolean; message: string };
type BulkResult = ActionResult & { processed: number; published?: number };

const isDraft = (item: { productStatus: string }) =>
  item.productStatus === "draft";

function approveActionLabel(publishDrafts: boolean, draft: boolean): string {
  return publishDrafts && draft ? "Approve & publish" : "Approve";
}

type ProductLinkItem = Pick<
  BasicItem,
  "productId" | "slug" | "title" | "productStatus"
>;

/**
 * Title + photos open the shopper page (live PDP, or the authenticated draft
 * preview). Actions stay outside this link so Approve / Generate never
 * navigate. New tab keeps the review queue (selection, bulk progress) intact.
 */
function ProductIdentityLink({
  item,
  children,
}: {
  item: ProductLinkItem;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={productPageHref(item)}
      {...PRODUCT_PAGE_LINK_ATTRS}
      title={productPageLinkLabel(item.productStatus)}
      className="group/product block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-inset"
    >
      {children}
    </Link>
  );
}

function ProductTitle({ item }: { item: ProductLinkItem }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="line-clamp-2 text-sm font-bold group-hover/product:text-[var(--primary)]">
        {item.title}
      </span>
      {isDraft(item) && <DraftChip />}
      <ExternalLink
        className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]/35 group-hover/product:text-[var(--primary)]"
        aria-hidden
      />
    </span>
  );
}

type ReviewCard = NonNullable<
  Awaited<ReturnType<typeof readThumbnailReviewCard>>
>;

type ThumbJob = {
  id: number;
  productId: number;
  title: string;
  label: string;
  state: "queued" | "running" | "done" | "error";
  message: string;
  /** Newest thumbnail once the action has written one. */
  previewUrl: string | null;
};

type GeneratedProduct = {
  productId: number;
  title: string;
  ok: boolean;
  message: string;
  proposalUrl: string | null;
};

function jobStillOpen(job: ThumbJob) {
  return job.state === "running" || job.state === "queued";
}

type ReviewBucket = ReviewCard["bucket"] | "absent";

function locateBucket(
  productId: number,
  items: { productId: number }[],
  flagged: { productId: number }[],
  approved: { productId: number }[],
  pending: { productId: number }[],
): ReviewBucket {
  if (items.some((item) => item.productId === productId)) return "proposed";
  if (flagged.some((item) => item.productId === productId)) return "flagged";
  if (approved.some((item) => item.productId === productId)) return "approved";
  if (pending.some((item) => item.productId === productId)) return "pending";
  return "absent";
}

function statKey(
  bucket: ReviewCard["bucket"],
): "proposed" | "flagged" | "approved" | "pending" | "skipped" {
  if (bucket === "hidden") return "skipped";
  return bucket;
}

/**
 * Cards the operator just finished stay on the snapshot we read after the
 * write. A later page refresh can still be from an earlier in-flight action,
 * and that payload must not put the old thumbnail back.
 */
function projectThumbnailBoard(args: {
  items: Item[];
  flagged: FlaggedItem[];
  approved: BasicItem[];
  pending: BasicItem[];
  stats: ThumbnailQueueStats;
  patches: Map<number, ReviewCard>;
}): {
  items: Item[];
  flagged: FlaggedItem[];
  approved: BasicItem[];
  pending: BasicItem[];
  stats: ThumbnailQueueStats;
} {
  const { items, flagged, approved, pending, stats, patches } = args;
  if (patches.size === 0) return { items, flagged, approved, pending, stats };

  const nextItems = items.filter((item) => !patches.has(item.productId));
  const nextFlagged = flagged.filter((item) => !patches.has(item.productId));
  const nextApproved = approved.filter((item) => !patches.has(item.productId));
  const nextPending = pending.filter((item) => !patches.has(item.productId));
  const nextStats: ThumbnailQueueStats = { ...stats };

  const freshItems: Item[] = [];
  const freshFlagged: FlaggedItem[] = [];
  const freshApproved: BasicItem[] = [];
  const freshPending: BasicItem[] = [];

  for (const card of patches.values()) {
    const from = locateBucket(card.productId, items, flagged, approved, pending);
    if (from !== "absent" && from !== card.bucket) {
      const fromKey = statKey(from);
      const toKey = statKey(card.bucket);
      nextStats[fromKey] = Math.max(0, nextStats[fromKey] - 1);
      nextStats[toKey] += 1;
    }

    if (card.bucket === "proposed" && card.proposalUrl) {
      freshItems.push({
        productId: card.productId,
        slug: card.slug,
        title: card.title,
        productStatus: card.productStatus,
        currentUrl: card.currentUrl,
        proposalUrl: card.proposalUrl,
        previousCount: card.previousCount,
        nextCount: card.nextCount,
        score: card.score,
        category: card.category,
        reason: card.reason,
      });
    } else if (card.bucket === "flagged") {
      freshFlagged.push({
        productId: card.productId,
        slug: card.slug,
        title: card.title,
        productStatus: card.productStatus,
        currentUrl: card.currentUrl,
        proposalUrl: card.proposalUrl,
        previousCount: card.previousCount,
        nextCount: card.nextCount,
        score: card.score,
        category: card.category,
        reason: card.reason,
      });
    } else if (card.bucket === "approved") {
      freshApproved.push({
        productId: card.productId,
        slug: card.slug,
        title: card.title,
        productStatus: card.productStatus,
        currentUrl: card.currentUrl,
      });
    } else if (card.bucket === "pending") {
      freshPending.push({
        productId: card.productId,
        slug: card.slug,
        title: card.title,
        productStatus: card.productStatus,
        currentUrl: card.currentUrl,
      });
    }
  }

  return {
    items: [...freshItems, ...nextItems],
    flagged: [...freshFlagged, ...nextFlagged],
    approved: [...freshApproved, ...nextApproved],
    pending: [...freshPending, ...nextPending],
    stats: nextStats,
  };
}

export function ThumbnailsReview({
  scope,
  scopeCounts,
  items,
  flagged,
  approved,
  pending,
  stats,
}: {
  scope: ThumbnailScope;
  scopeCounts: Record<ThumbnailScope, number>;
  items: Item[];
  flagged: FlaggedItem[];
  approved: BasicItem[];
  pending: BasicItem[];
  stats: ThumbnailQueueStats;
}) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [jobs, setJobs] = useState<ThumbJob[]>([]);
  const [patches, setPatches] = useState<Map<number, ReviewCard>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batch, setBatch] = useState(5);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [adjust, setAdjust] = useState<Item | null>(null);

  const stopRef = useRef(false);
  const jobsRef = useRef<ThumbJob[]>([]);
  const jobSeq = useRef(0);
  /** Job ids created by Generate / Generate all, so cleanup doesn't touch a per-card Generate. */
  const batchJobIds = useRef<Set<number>>(new Set());
  const refreshQueued = useRef(false);
  const refreshActive = useRef(false);
  const refreshToken = useRef(0);
  const sawRefresh = useRef(false);
  const refreshingRef = useRef(false);
  const settleRef = useRef<() => void>(() => {});
  const [auto, setAuto] = useState({ running: false, done: 0, total: 0 });
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0, verb: "" });
  // Always starts off. A previous visit must not publish drafts on the next open.
  const [publishDraftsOnApprove, setPublishDrafts] = useState(false);

  const globalBusy = auto.running || bulk.running;
  const busyIds = useMemo(() => {
    const ids = new Set<number>();
    for (const job of jobs) if (jobStillOpen(job)) ids.add(job.productId);
    return ids;
  }, [jobs]);

  const board = useMemo(
    () => projectThumbnailBoard({ items, flagged, approved, pending, stats, patches }),
    [items, flagged, approved, pending, stats, patches],
  );

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  // One refresh at a time. A refresh that started before a later write finished
  // used to land last and put the old thumbnail back on screen.
  const pumpRefresh = useCallback(() => {
    if (refreshActive.current || !refreshQueued.current) return;
    refreshQueued.current = false;
    refreshActive.current = true;
    const token = ++refreshToken.current;
    startRefresh(() => {
      router.refresh();
    });
    // If the refresh transition never flips to pending, don't leave the queue stuck.
    window.setTimeout(() => {
      if (refreshToken.current !== token) return;
      if (refreshingRef.current) return;
      settleRef.current();
    }, 1500);
  }, [router, startRefresh]);

  const settleRefresh = useCallback(() => {
    if (!refreshActive.current) return;
    refreshActive.current = false;
    pumpRefresh();
  }, [pumpRefresh]);

  useEffect(() => {
    settleRef.current = settleRefresh;
  }, [settleRefresh]);

  const scheduleRefresh = useCallback(() => {
    refreshQueued.current = true;
    pumpRefresh();
  }, [pumpRefresh]);

  useEffect(() => {
    if (refreshing) {
      sawRefresh.current = true;
      return;
    }
    // Ignore the first paint. Settling before a refresh has actually started
    // would mark the in-flight reload as finished.
    if (!sawRefresh.current) return;
    sawRefresh.current = false;
    settleRefresh();
  }, [refreshing, settleRefresh]);

  useEffect(() => {
    if (jobs.length === 0 || jobs.some((job) => jobStillOpen(job))) return;
    const timer = window.setTimeout(() => {
      jobsRef.current = [];
      setJobs([]);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [jobs]);

  function flash(result: ActionResult) {
    setToast(result);
    if (result.ok) setTimeout(() => setToast(null), 3500);
  }

  function titleFor(productId: number) {
    return (
      items.find((item) => item.productId === productId)?.title ??
      flagged.find((item) => item.productId === productId)?.title ??
      approved.find((item) => item.productId === productId)?.title ??
      pending.find((item) => item.productId === productId)?.title ??
      patches.get(productId)?.title ??
      `Product #${productId}`
    );
  }

  function pushJob(job: ThumbJob) {
    const running = jobsRef.current.some((item) => jobStillOpen(item));
    const next = running ? [...jobsRef.current, job] : [job];
    jobsRef.current = next;
    setJobs(next);
  }

  function updateJob(id: number, patch: Partial<ThumbJob>) {
    const next = jobsRef.current.map((job) =>
      job.id === id ? { ...job, ...patch } : job,
    );
    jobsRef.current = next;
    setJobs(next);
  }

  async function revealCard(productId: number): Promise<ReviewCard | null> {
    try {
      const snap = await readThumbnailReviewCard(productId);
      if (!snap) return null;
      setPatches((prev) => {
        const next = new Map(prev);
        next.set(productId, snap);
        return next;
      });
      return snap;
    } catch {
      // The queued refresh still reconciles the board if this read fails.
      return null;
    }
  }

  // ── Selection helpers ──────────────────────────────────────────────────
  const proposedIds = useMemo(
    () => new Set(board.items.map((i) => i.productId)),
    [board.items],
  );
  const flaggedIds = useMemo(
    () => new Set(board.flagged.map((i) => i.productId)),
    [board.flagged],
  );

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function setSection(ids: number[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }
  const clearSelection = () => setSelected(new Set());

  const sel = useMemo(() => [...selected], [selected]);
  const regenIds = sel;
  const approveIds = sel.filter((id) => proposedIds.has(id));
  const approveDraftCount = board.items.filter(
    (i) => selected.has(i.productId) && isDraft(i),
  ).length;
  const flagIds = sel.filter((id) => proposedIds.has(id) || flaggedIds.has(id));
  const skipIds = sel.filter((id) => proposedIds.has(id) || flaggedIds.has(id));

  // ── Single-item action (per-item busy; other cards stay clickable) ─────
  function run(
    productId: number,
    label: string,
    fn: () => Promise<ActionResult>,
  ) {
    // Generate all keeps running in the background. Only a product still in
    // that run, or a bulk action, is locked — finished thumbnails stay usable.
    if (bulk.running) return;
    if (jobsRef.current.some((job) => job.productId === productId && jobStillOpen(job))) {
      return;
    }
    const id = ++jobSeq.current;
    pushJob({
      id,
      productId,
      title: titleFor(productId),
      label,
      state: "running",
      message: "",
      previewUrl: null,
    });
    void (async () => {
      let result: ActionResult;
      try {
        result = await fn();
      } catch (err) {
        result = {
          ok: false,
          message: err instanceof Error ? err.message : "Failed.",
        };
      }
      if (!result.ok) {
        flash(
          result.message.trim()
            ? result
            : { ok: false, message: `${label} failed.` },
        );
      } else if (!result.message.trim()) {
        result = { ok: true, message: `${label} complete.` };
      }
      const snap = await revealCard(productId);
      updateJob(id, {
        state: result.ok ? "done" : "error",
        message: result.message,
        previewUrl: snap?.proposalUrl ?? snap?.currentUrl ?? null,
      });
      scheduleRefresh();
    })();
  }
  const busy = (id: number) => busyIds.has(id);
  const activityLabel = (id: number) =>
    jobs.find((job) => job.productId === id && jobStillOpen(job))?.label ?? null;
  const highlighted = (id: number) =>
    jobs.some((job) => job.productId === id && job.state === "done");

  function writeJobs(next: ThumbJob[]) {
    jobsRef.current = next;
    setJobs(next);
  }

  /** Same order Generate all uses: never-started products, then automatic retries. */
  function nextGenerateTargets(limit: number) {
    const open = new Set(
      jobsRef.current.filter((job) => jobStillOpen(job)).map((job) => job.productId),
    );
    const pending = [...board.pending].sort((a, b) => a.productId - b.productId);
    const retryable = [...board.flagged]
      .filter(
        (item) =>
          !item.proposalUrl && !(item.reason ?? "").includes(RETRIES_EXHAUSTED_MARK),
      )
      .sort((a, b) => a.productId - b.productId);
    return [...pending, ...retryable]
      .filter((item) => !open.has(item.productId))
      .slice(0, limit)
      .map((item) => ({ productId: item.productId, title: item.title }));
  }

  function beginGenerate(
    targets: { productId: number; title: string }[],
    runNow: number,
  ) {
    if (targets.length === 0) return;
    const incoming: ThumbJob[] = targets.map((target, index) => {
      const id = ++jobSeq.current;
      batchJobIds.current.add(id);
      return {
        id,
        productId: target.productId,
        title: target.title,
        label: "Generate",
        state: index < runNow ? "running" : "queued",
        message: "",
        previewUrl: null,
      };
    });
    writeJobs([...jobsRef.current, ...incoming]);
  }

  function dropOpenBatch() {
    writeJobs(
      jobsRef.current.filter((job) => {
        if (!batchJobIds.current.has(job.id) || !jobStillOpen(job)) return true;
        batchJobIds.current.delete(job.id);
        return false;
      }),
    );
  }

  function failOpenGenerate(message: string) {
    writeJobs(
      jobsRef.current.flatMap((job) => {
        if (!batchJobIds.current.has(job.id) || !jobStillOpen(job)) return [job];
        batchJobIds.current.delete(job.id);
        if (job.state === "queued") return [];
        return [{ ...job, state: "error" as const, message }];
      }),
    );
  }

  async function settleGenerated(products: GeneratedProduct[]) {
    const next = jobsRef.current.map((job) => ({ ...job }));
    for (const product of products) {
      const job = next.find(
        (item) =>
          item.productId === product.productId &&
          item.label === "Generate" &&
          jobStillOpen(item),
      );
      if (job) {
        batchJobIds.current.delete(job.id);
        job.state = product.ok ? "done" : "error";
        job.message = product.message;
        job.title = product.title || job.title;
        job.previewUrl = product.proposalUrl;
      } else {
        next.push({
          id: ++jobSeq.current,
          productId: product.productId,
          title: product.title || `Product #${product.productId}`,
          label: "Generate",
          state: product.ok ? "done" : "error",
          message: product.message,
          previewUrl: product.proposalUrl,
        });
      }
    }
    writeJobs(next);
    await Promise.all(products.map((product) => revealCard(product.productId)));
  }

  function markNextGenerateRunning(count: number) {
    let left = count;
    writeJobs(
      jobsRef.current.map((job) => {
        if (left > 0 && batchJobIds.current.has(job.id) && job.state === "queued") {
          left -= 1;
          return { ...job, state: "running" as const };
        }
        return job;
      }),
    );
  }

  // ── Manual thumbnail upload (multipart route; no server-action size limit) ─
  function uploadThumbnail(productId: number, file: File) {
    run(productId, "Upload", async () => {
      const fd = new FormData();
      fd.append("productId", String(productId));
      fd.append("file", file);
      const res = await fetch("/api/admin/thumbnails/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as ActionResult | null;
      return json ?? { ok: false, message: "Upload failed." };
    });
  }

  // ── Generate the pending queue (client-orchestrated batches) ───────────
  const remaining = board.stats.pending + board.stats.retryable;

  function generateOnce() {
    if (globalBusy || remaining === 0) return;
    beginGenerate(nextGenerateTargets(batch), batch);
    startTransition(async () => {
      const res = await generateThumbnailProposals(batch, scope);
      if (!res.ok) failOpenGenerate(res.message);
      else await settleGenerated(res.products);
      dropOpenBatch();
      flash(res);
      scheduleRefresh();
    });
  }
  async function generateAll() {
    stopRef.current = false;
    if (remaining === 0 || globalBusy) return;
    beginGenerate(nextGenerateTargets(remaining), batch);
    setAuto({ running: true, done: 0, total: remaining });
    let done = 0;
    try {
      while (!stopRef.current) {
        const res = await generateThumbnailProposals(batch, scope);
        if (!res.ok) {
          failOpenGenerate(res.message);
          flash(res);
          break;
        }
        await settleGenerated(res.products);
        done += res.changed;
        setAuto({ running: true, done, total: Math.max(remaining, done) });
        scheduleRefresh();
        // Failures are re-flagged and stay eligible only until their automatic
        // attempts are used up. A batch that proposes nothing cannot make
        // progress on the next call either, so stop instead of re-billing it.
        if (res.proposed === 0) break;
        if (!stopRef.current) markNextGenerateRunning(batch);
      }
      flash({
        ok: true,
        message: stopRef.current
          ? `Stopped after generating ${done}.`
          : `Done — generated ${done} thumbnail(s).`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed.";
      failOpenGenerate(message);
      flash({ ok: false, message });
    } finally {
      dropOpenBatch();
      setAuto((a) => ({ ...a, running: false }));
      scheduleRefresh();
    }
  }

  // ── Bulk action over a selection (chunked, with progress + stop) ───────
  async function runBulk(
    ids: number[],
    serverFn: (chunk: number[]) => Promise<BulkResult>,
    chunkSize: number,
    verb: string,
  ) {
    if (ids.length === 0) return;
    stopRef.current = false;
    setBulk({ running: true, done: 0, total: ids.length, verb });
    let done = 0;
    let published = 0;
    // A chunk can succeed as a request while some of its products don't. Keep
    // the server's explanation so the closing toast says why, instead of a count
    // that quietly disagrees with the selection.
    let shortfall: string | null = null;
    try {
      for (let i = 0; i < ids.length && !stopRef.current; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const res = await serverFn(chunk);
        if (!res.ok) {
          flash(res);
          break;
        }
        if (res.processed < chunk.length) shortfall = res.message;
        done += res.processed;
        published += res.published ?? 0;
        setBulk({ running: true, done, total: ids.length, verb });
        const snaps = await Promise.all(
          chunk.map(async (id) => {
            try {
              return await readThumbnailReviewCard(id);
            } catch {
              return null;
            }
          }),
        );
        setPatches((prev) => {
          const next = new Map(prev);
          for (const snap of snaps) {
            if (snap) next.set(snap.productId, snap);
          }
          return next;
        });
        scheduleRefresh();
      }
      flash(
        shortfall
          ? { ok: false, message: shortfall }
          : {
              ok: true,
              message:
                published > 0
                  ? `${verb} ${done} · published ${published} draft${published === 1 ? "" : "s"}.`
                  : `${verb} ${done}.`,
            },
      );
    } catch (err) {
      flash({ ok: false, message: err instanceof Error ? err.message : "Bulk failed." });
    } finally {
      setBulk({ running: false, done: 0, total: 0, verb: "" });
      clearSelection();
      scheduleRefresh();
    }
  }

  const empty =
    board.items.length === 0 &&
    board.flagged.length === 0 &&
    board.approved.length === 0 &&
    board.pending.length === 0;

  return (
    <div className="space-y-8 pb-24">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-3 z-20 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-3 shadow-[0_10px_30px_-24px_rgba(120,60,120,0.5)] backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScopeTabs scope={scope} counts={scopeCounts} disabled={globalBusy} />

          {auto.running ? (
            <ProgressControl
              label={`Generating ${auto.done}/${auto.total}…`}
              onStop={() => (stopRef.current = true)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]/70">
                Batch
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={batch}
                  onChange={(e) =>
                    setBatch(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                  }
                  className="w-14 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-center"
                />
              </label>
              <button
                onClick={generateOnce}
                disabled={transitionPending || globalBusy || remaining === 0}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--primary)]/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {transitionPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate {batch}
              </button>
              <button
                onClick={generateAll}
                disabled={transitionPending || globalBusy || remaining === 0}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white shadow-[0_4px_0_#d62f88] transition active:translate-y-0.5 active:shadow-[0_1px_0_#d62f88] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Rocket className="h-4 w-4" /> Generate all ({remaining})
              </button>
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          <StatPill label="Not started" value={board.stats.pending} tone="muted" />
          <StatPill label="To review" value={board.stats.proposed} tone="primary" />
          <StatPill label="Approved" value={board.stats.approved} tone="green" />
          <StatPill label="Flagged" value={board.stats.flagged} tone="amber" />
          <StatPill label="Skipped" value={board.stats.skipped} tone="muted" />
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--foreground)]/45">
          <Clock className="h-3.5 w-3.5" />
          Clean shots on plain white are framed locally at no image-model cost.
          Hands, props, and scenes still use Nano Banana Pro (~45s, in
          parallel). Generate all tries a failed product at most twice, then
          leaves it under Needs attention. Counts follow the selected scope. Approving
          a thumbnail never publishes a draft unless you turn on “Publish
          drafts on approve.”
        </p>
        <PublishDraftsToggle
          checked={publishDraftsOnApprove}
          onChange={setPublishDrafts}
          disabled={bulk.running}
        />
        <JobProgress
          jobs={jobs}
          onDismiss={() => {
            jobsRef.current = [];
            setJobs([]);
          }}
        />
      </div>

      {empty && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-20 text-center">
          <p className="text-lg font-bold">Nothing to review right now</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
            {board.stats.pending > 0
              ? `Click “Generate all” to process the ${board.stats.pending} pending product(s).`
              : "Every active product has been processed. 🎉"}
          </p>
        </div>
      )}

      {/* ── To review ────────────────────────────────────────────────────── */}
      {board.items.length > 0 && (
        <section>
          <SectionHeader
            title="To review"
            count={board.stats.proposed}
            subtitle={`Compare the proposed thumbnail against the current one, then approve, regenerate, flag, or skip. Previous restores the last generated thumbnail; Redo brings that newer one back. Tick cards to act in bulk.${
              board.stats.proposed > board.items.length
                ? ` Showing the first ${board.items.length} of ${board.stats.proposed}.`
                : ""
            }`}
            allSelected={board.items.every((i) => selected.has(i.productId))}
            onToggleAll={(on) =>
              setSection(
                board.items.filter((i) => !busy(i.productId)).map((i) => i.productId),
                on,
              )
            }
            disabled={bulk.running}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {board.items.map((item) => (
              <ProposalCard
                key={item.productId}
                item={item}
                busy={busy(item.productId)}
                activityLabel={activityLabel(item.productId)}
                highlighted={highlighted(item.productId)}
                disabled={bulk.running}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={bulk.running || busy(item.productId)}
                onApprove={() =>
                  run(
                    item.productId,
                    approveActionLabel(publishDraftsOnApprove, isDraft(item)),
                    () =>
                      approveThumbnailProposal(
                        item.productId,
                        publishDraftsOnApprove,
                      ),
                  )
                }
                publishDraftsOnApprove={publishDraftsOnApprove}
                onCleanup={() =>
                  run(item.productId, "Regenerate", () => aiCleanupThumbnail(item.productId))
                }
                onPrevious={() =>
                  run(item.productId, "Previous", () =>
                    restorePreviousThumbnail(item.productId),
                  )
                }
                onRedo={() =>
                  run(item.productId, "Redo", () => redoThumbnail(item.productId))
                }
                onFlag={() =>
                  run(item.productId, "Flag", () => decideThumbnailProposal(item.productId, "flagged"))
                }
                onSkip={() =>
                  run(item.productId, "Skip", () => decideThumbnailProposal(item.productId, "skipped"))
                }
                onUpload={(f) => uploadThumbnail(item.productId, f)}
                onAdjust={() => setAdjust(item)}
                onRemoveBg={() =>
                  run(item.productId, "Remove BG", () => removeThumbnailBackground(item.productId))
                }
                onRemoveTag={() =>
                  run(item.productId, "Remove Tag", () => aiRemoveThumbnailArtifact(item.productId))
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Needs attention (flagged) ────────────────────────────────────── */}
      {board.flagged.length > 0 && (
        <section>
          <SectionHeader
            title="Needs attention"
            count={board.stats.flagged}
            subtitle={`Generation didn't produce a usable result. Automatic retries stop after two attempts — use Regenerate (Nano Banana Pro) or upload a photo.${
              board.stats.flagged > board.flagged.length
                ? ` Showing the first ${board.flagged.length} of ${board.stats.flagged}.`
                : ""
            }`}
            allSelected={board.flagged.every((i) => selected.has(i.productId))}
            onToggleAll={(on) =>
              setSection(
                board.flagged.filter((i) => !busy(i.productId)).map((i) => i.productId),
                on,
              )
            }
            disabled={bulk.running}
          />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {board.flagged.map((item) => (
              <FlaggedCard
                key={item.productId}
                item={item}
                busy={busy(item.productId)}
                activityLabel={activityLabel(item.productId)}
                highlighted={highlighted(item.productId)}
                disabled={bulk.running}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={bulk.running || busy(item.productId)}
                onCleanup={() =>
                  run(item.productId, "Regenerate", () => aiCleanupThumbnail(item.productId))
                }
                onPrevious={() =>
                  run(item.productId, "Previous", () =>
                    restorePreviousThumbnail(item.productId),
                  )
                }
                onRedo={() =>
                  run(item.productId, "Redo", () => redoThumbnail(item.productId))
                }
                onSkip={() =>
                  run(item.productId, "Skip", () => decideThumbnailProposal(item.productId, "skipped"))
                }
                onUpload={(f) => uploadThumbnail(item.productId, f)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Live thumbnails (approved) ───────────────────────────────────── */}
      {board.approved.length > 0 && (
        <section>
          <SectionHeader
            title="Live thumbnails"
            count={board.stats.approved}
            subtitle={`Already live on the storefront. Regenerate to rebuild — the new version goes to “To review” before it replaces the live image.${
              board.stats.approved > board.approved.length
                ? ` Showing the first ${board.approved.length} of ${board.stats.approved}.`
                : ""
            }`}
            allSelected={board.approved.every((i) => selected.has(i.productId))}
            onToggleAll={(on) =>
              setSection(
                board.approved.filter((i) => !busy(i.productId)).map((i) => i.productId),
                on,
              )
            }
            disabled={bulk.running}
          />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {board.approved.map((item) => (
              <SimpleCard
                key={item.productId}
                item={item}
                badge="Live"
                busy={busy(item.productId)}
                activityLabel={activityLabel(item.productId)}
                highlighted={highlighted(item.productId)}
                disabled={bulk.running || busy(item.productId)}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={bulk.running || busy(item.productId)}
                actionLabel="Regenerate"
                actionIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onAction={() =>
                  run(item.productId, "Regenerate", () => aiCleanupThumbnail(item.productId))
                }
                onUpload={(f) => uploadThumbnail(item.productId, f)}
                onRemoveBg={() =>
                  run(item.productId, "Remove BG", () => removeThumbnailBackground(item.productId))
                }
                onRemoveTag={() =>
                  run(item.productId, "Remove Tag", () => aiRemoveThumbnailArtifact(item.productId))
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Not started (pending) ────────────────────────────────────────── */}
      {board.pending.length > 0 && (
        <section>
          <SectionHeader
            title="Not started"
            count={board.stats.pending}
            subtitle={`Products without a generated thumbnail yet.${
              board.stats.pending > board.pending.length
                ? ` Showing the first ${board.pending.length} — use “Generate all” for the rest.`
                : ""
            }`}
            allSelected={board.pending.every((i) => selected.has(i.productId))}
            onToggleAll={(on) =>
              setSection(
                board.pending.filter((i) => !busy(i.productId)).map((i) => i.productId),
                on,
              )
            }
            disabled={bulk.running}
          />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {board.pending.map((item) => (
              <SimpleCard
                key={item.productId}
                item={item}
                badge="Current"
                busy={busy(item.productId)}
                activityLabel={activityLabel(item.productId)}
                highlighted={highlighted(item.productId)}
                disabled={bulk.running || busy(item.productId)}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={bulk.running || busy(item.productId)}
                actionLabel="Generate"
                actionIcon={<Sparkles className="h-3.5 w-3.5" />}
                onAction={() =>
                  run(item.productId, "Generate", () =>
                    generateThumbnailProposal(item.productId),
                  )
                }
                onUpload={(f) => uploadThumbnail(item.productId, f)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Sticky bulk action bar ───────────────────────────────────────── */}
      {(selected.size > 0 || bulk.running) && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-[0_18px_50px_-20px_rgba(120,60,120,0.6)]">
            {bulk.running ? (
              <>
                <span className="inline-flex items-center gap-2 px-2 text-sm font-bold text-[var(--primary)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {bulk.verb} {bulk.done}/{bulk.total}…
                </span>
                <button
                  onClick={() => (stopRef.current = true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <StopCircle className="h-4 w-4" /> Stop
                </button>
              </>
            ) : (
              <>
                <span className="px-2 text-sm font-bold">{selected.size} selected</span>
                {approveIds.length > 0 && (
                  <label className="flex cursor-pointer items-center gap-1.5 px-1 text-xs font-semibold text-[var(--foreground)]/70">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={publishDraftsOnApprove}
                      onChange={(e) => setPublishDrafts(e.target.checked)}
                    />
                    Publish drafts
                  </label>
                )}
                <BulkButton
                  onClick={() =>
                    runBulk(
                      approveIds,
                      (c) => bulkApproveThumbnails(c, publishDraftsOnApprove),
                      25,
                      "Approved",
                    )
                  }
                  disabled={approveIds.length === 0}
                  tone="primary"
                >
                  <Check className="h-3.5 w-3.5" />{" "}
                  {publishDraftsOnApprove && approveDraftCount > 0
                    ? `Approve & publish (${approveIds.length})`
                    : `Approve (${approveIds.length})`}
                </BulkButton>
                <BulkButton
                  onClick={() =>
                    runBulk(regenIds, (c) => bulkRegenerateThumbnails(c), 5, "Regenerated")
                  }
                  disabled={regenIds.length === 0}
                  tone="accent"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Regenerate ({regenIds.length})
                </BulkButton>
                <BulkButton
                  onClick={() =>
                    runBulk(flagIds, (c) => bulkDecideThumbnails(c, "flagged"), 25, "Flagged")
                  }
                  disabled={flagIds.length === 0}
                  tone="amber"
                >
                  <Flag className="h-3.5 w-3.5" /> Flag ({flagIds.length})
                </BulkButton>
                <BulkButton
                  onClick={() =>
                    runBulk(skipIds, (c) => bulkDecideThumbnails(c, "skipped"), 25, "Skipped")
                  }
                  disabled={skipIds.length === 0}
                  tone="ghost"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Skip ({skipIds.length})
                </BulkButton>
                <button
                  onClick={clearSelection}
                  className="ml-1 grid place-items-center rounded-full p-1.5 text-[var(--foreground)]/50 hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  title="Clear selection"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {adjust && (
        <ThumbnailCropModal
          url={adjust.proposalUrl}
          title={adjust.title}
          busy={busy(adjust.productId)}
          onCancel={() => setAdjust(null)}
          onApply={(rect) => {
            const id = adjust.productId;
            setAdjust(null);
            run(id, "Adjust", () => adjustThumbnailCrop(id, rect));
          }}
        />
      )}

      {/* Failures stay until acknowledged — they carry the instruction for
          fixing the product — so the toast has to be dismissable. */}
      {toast && (
        <button
          type="button"
          onClick={() => setToast(null)}
          title="Dismiss"
          className={`fixed bottom-24 left-1/2 z-40 flex max-w-[min(90vw,42rem)] -translate-x-1/2 items-center gap-2 rounded-2xl px-5 py-2.5 text-left text-sm font-bold text-white shadow-lg ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          <span>{toast.message}</span>
          <X className="h-4 w-4 shrink-0 opacity-70" />
        </button>
      )}
    </div>
  );
}

/**
 * Which slice of the catalogue the queue is working on. Rendered as links so
 * the scope lives in the URL — shareable, restored by the back button, and
 * preserved across the `router.refresh()` that follows every action.
 */
function ScopeTabs({
  scope,
  counts,
  disabled,
}: {
  scope: ThumbnailScope;
  counts: Record<ThumbnailScope, number>;
  disabled: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Product scope"
      className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] p-1"
    >
      {THUMBNAIL_SCOPES.map((value) => {
        const active = value === scope;
        const className = `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition ${
          active
            ? "bg-[var(--primary)] text-white"
            : "text-[var(--foreground)]/70 hover:bg-[var(--card)]"
        } ${disabled && !active ? "pointer-events-none opacity-40" : ""}`;
        const body = (
          <>
            {SCOPE_LABELS[value]}
            <span
              className={`text-xs font-semibold ${
                active ? "text-white/70" : "text-[var(--foreground)]/40"
              }`}
            >
              {counts[value]}
            </span>
          </>
        );

        // The current scope is not a link (nothing to navigate to), and while a
        // batch is running switching scope mid-flight would orphan it.
        return active || disabled ? (
          <span
            key={value}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {body}
          </span>
        ) : (
          <Link
            key={value}
            href={
              value === DEFAULT_THUMBNAIL_SCOPE
                ? "/admin/products/thumbnails"
                : `/admin/products/thumbnails?scope=${value}`
            }
            scroll={false}
            className={className}
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}

/** Marks a product that isn't on the storefront yet. */
function DraftChip({ className }: { className?: string }) {
  return (
    <span
      title="Draft — not on the storefront yet. Turn on “Publish drafts on approve” if you want Approve to go live."
      className={`shrink-0 rounded-full bg-[var(--foreground)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/55 ${className ?? ""}`}
    >
      Draft
    </span>
  );
}

function PublishDraftsToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={`mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
        checked
          ? "border-[var(--primary)]/40 bg-[var(--primary)]/[0.06]"
          : "border-[var(--border)] bg-[var(--muted)]/50"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="inline-flex items-center gap-1.5 font-bold">
          <Globe className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
          Publish drafts on approve
        </span>
        <span className="mt-0.5 block text-xs font-medium text-[var(--foreground)]/55">
          Off by default. When on, Approve also sets draft listings live.
          Already-active products only get a new thumbnail.
        </span>
      </span>
    </label>
  );
}

function JobProgress({
  jobs,
  onDismiss,
}: {
  jobs: ThumbJob[];
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (jobs.length === 0) return null;
  const total = jobs.length;
  const done = jobs.filter((job) => job.state === "done").length;
  const failed = jobs.filter((job) => job.state === "error").length;
  const running = jobs.filter((job) => job.state === "running").length;
  const queued = jobs.filter((job) => job.state === "queued").length;
  const finished = done + failed;
  const pct = total === 0 ? 0 : Math.round((finished / total) * 100);
  const active = running + queued > 0;
  const ordered = [...jobs].sort((a, b) => {
    const rank = { running: 0, queued: 1, error: 2, done: 3 } as const;
    const byState = rank[a.state] - rank[b.state];
    if (byState !== 0) return byState;
    return a.state === "queued" ? a.id - b.id : b.id - a.id;
  });
  const runningTitles = ordered
    .filter((job) => job.state === "running")
    .map((job) => job.title);

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-xs font-bold">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {active ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--primary)]" />
          ) : failed > 0 ? (
            <X className="h-3.5 w-3.5 shrink-0 text-red-600" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
          )}
          <span className="truncate">
            {active
              ? `${finished} of ${total} finished · ${running} running${
                  queued > 0 ? ` · ${queued} waiting` : ""
                }`
              : failed > 0
                ? `${done} finished · ${failed} failed`
                : `All ${total} finished`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          <span className="text-[var(--foreground)]/55">{pct}%</span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex items-center gap-0.5 font-semibold text-[var(--foreground)]/55 hover:text-[var(--foreground)]"
          >
            {open ? "Hide" : "Queue"}
            <ChevronDown
              className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
            />
          </button>
          {!active && (
            <button
              type="button"
              onClick={onDismiss}
              className="font-semibold text-[var(--foreground)]/50 hover:text-[var(--foreground)]"
            >
              Dismiss
            </button>
          )}
        </span>
      </div>
      <div
        className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-[var(--muted)]"
        role="progressbar"
        aria-valuenow={finished}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Thumbnail actions"
      >
        <div
          className="h-full bg-green-500 transition-[width] duration-300"
          style={{ width: `${(done / total) * 100}%` }}
        />
        <div
          className="h-full bg-red-500 transition-[width] duration-300"
          style={{ width: `${(failed / total) * 100}%` }}
        />
        <div
          className="h-full animate-pulse bg-[var(--primary)] transition-[width] duration-300"
          style={{ width: `${(running / total) * 100}%` }}
        />
      </div>
      {!open && runningTitles.length > 0 && (
        <p className="mt-1.5 truncate text-[11px] font-medium text-[var(--foreground)]/50">
          {runningTitles.join(" · ")}
        </p>
      )}
      {open && (
        <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto">
          {ordered.map((job) => (
            <li key={job.id} className="flex items-center gap-2 text-[11px]">
              {job.state === "running" ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--primary)]" />
              ) : job.state === "queued" ? (
                <Clock className="h-3 w-3 shrink-0 text-[var(--foreground)]/40" />
              ) : job.state === "done" ? (
                <Check className="h-3 w-3 shrink-0 text-green-600" />
              ) : (
                <X className="h-3 w-3 shrink-0 text-red-600" />
              )}
              <span className="min-w-0 flex-1 truncate font-semibold">{job.title}</span>
              <span className="shrink-0 font-semibold text-[var(--foreground)]/45">
                {job.label}
              </span>
              {job.state === "error" && job.message ? (
                <span className="max-w-[12rem] truncate text-red-600" title={job.message}>
                  {job.message}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityStrip({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 bg-[var(--primary)]/10 px-3 py-1.5 pr-10 text-[11px] font-bold text-[var(--primary)]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}…
    </div>
  );
}

function ProgressControl({
  label,
  onStop,
}: {
  label: string;
  onStop: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--primary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </span>
      <button
        onClick={onStop}
        className="inline-flex items-center gap-1.5 rounded-full border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        <StopCircle className="h-4 w-4" /> Stop
      </button>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  subtitle,
  allSelected,
  onToggleAll,
  disabled,
}: {
  title: string;
  count: number;
  subtitle: string;
  allSelected: boolean;
  onToggleAll: (on: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-black">{title}</h2>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[var(--muted)] px-2 text-xs font-bold text-[var(--foreground)]/70">
          {count}
        </span>
        <button
          onClick={() => onToggleAll(!allSelected)}
          disabled={disabled}
          className="ml-auto text-xs font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)] disabled:opacity-50"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-[var(--foreground)]/55">{subtitle}</p>
    </div>
  );
}

function SelectBox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      className={`absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border-2 shadow-sm transition disabled:opacity-50 ${
        checked
          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
          : "border-white bg-white/80 text-transparent hover:border-[var(--primary)]"
      }`}
      title={checked ? "Deselect" : "Select"}
    >
      <Check className="h-4 w-4" strokeWidth={3} />
    </button>
  );
}

function ProposalCard({
  item,
  busy,
  activityLabel,
  highlighted,
  disabled,
  checked,
  onSelect,
  selectDisabled,
  onApprove,
  onFlag,
  onSkip,
  onCleanup,
  onPrevious,
  onRedo,
  onUpload,
  onAdjust,
  onRemoveBg,
  onRemoveTag,
  publishDraftsOnApprove,
}: {
  item: Item;
  busy: boolean;
  activityLabel: string | null;
  highlighted: boolean;
  disabled: boolean;
  checked: boolean;
  onSelect: () => void;
  selectDisabled: boolean;
  onApprove: () => void;
  onFlag: () => void;
  onSkip: () => void;
  onCleanup: () => void;
  onPrevious: () => void;
  onRedo: () => void;
  onUpload: (file: File) => void;
  onAdjust: () => void;
  onRemoveBg: () => void;
  onRemoveTag: () => void;
  publishDraftsOnApprove: boolean;
}) {
  const locked = disabled || busy;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--card)] shadow-[0_10px_30px_-26px_rgba(120,60,120,0.5)] transition ${
        checked
          ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30"
          : highlighted
            ? "border-green-400 ring-2 ring-green-400/40"
            : "border-[var(--border)]"
      }`}
    >
      {activityLabel && <ActivityStrip label={activityLabel} />}
      <SelectBox checked={checked} onChange={onSelect} disabled={selectDisabled} />
      <ProductIdentityLink item={item}>
        <div className="flex items-start justify-between gap-2 p-3 pr-10">
          <div className="min-w-0">
            <ProductTitle item={item} />
          </div>
          {item.score != null && (
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
              {item.score.toFixed(2)} · {item.category}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
          <Figure label="Current" url={item.currentUrl} fit="cover" />
          <Figure label="Proposed" url={item.proposalUrl} fit="contain" highlight />
        </div>
      </ProductIdentityLink>

      <div className="flex flex-col gap-2 p-3">
        {isDraft(item) && (
          <p className="text-[11px] font-semibold text-[var(--foreground)]/50">
            {publishDraftsOnApprove
              ? "Approve will also publish this listing."
              : "Draft stays unpublished. Turn on “Publish drafts on approve” to go live."}
          </p>
        )}
        <div className="flex gap-2">
          <PrimaryButton
            onClick={onApprove}
            disabled={locked}
            busy={busy && activityLabel === approveActionLabel(publishDraftsOnApprove, isDraft(item))}
            className="flex-1"
            title={
              isDraft(item)
                ? publishDraftsOnApprove
                  ? "Approves the thumbnail and publishes this draft to the storefront."
                  : "Approves the thumbnail only. This draft stays unpublished."
                : "Approves the thumbnail. This listing is already live."
            }
          >
            <Check className="h-3.5 w-3.5" />{" "}
            {approveActionLabel(publishDraftsOnApprove, isDraft(item))}
          </PrimaryButton>
          <GhostButton onClick={onCleanup} disabled={locked} accent className="flex-1">
            <Wand2 className="h-3.5 w-3.5" /> Regenerate
          </GhostButton>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <GhostButton
            onClick={onPrevious}
            disabled={locked || item.previousCount === 0}
            title={
              item.previousCount === 0
                ? "No previous thumbnail yet. Regenerate, crop, remove the background, or upload — then Previous restores the one this replaced."
                : "Restore the previous generated thumbnail."
            }
          >
            <Undo2 className="h-3.5 w-3.5" /> Previous
          </GhostButton>
          <GhostButton
            onClick={onRedo}
            disabled={locked || item.nextCount === 0}
            title={
              item.nextCount === 0
                ? "Nothing to redo. Previous parks the thumbnail you leave here."
                : "Bring back the thumbnail you left when you chose Previous."
            }
          >
            <Redo2 className="h-3.5 w-3.5" /> Redo
          </GhostButton>
          <GhostButton onClick={onRemoveBg} disabled={locked} accent>
            <Eraser className="h-3.5 w-3.5" /> Remove BG
          </GhostButton>
          <GhostButton onClick={onRemoveTag} disabled={locked} accent>
            <Sparkles className="h-3.5 w-3.5" /> Remove Tag
          </GhostButton>
          <GhostButton onClick={onAdjust} disabled={locked} accent>
            <Crop className="h-3.5 w-3.5" /> Adjust
          </GhostButton>
          <GhostButton onClick={onFlag} disabled={locked} amber>
            <Flag className="h-3.5 w-3.5" /> Flag
          </GhostButton>
          <GhostButton onClick={onSkip} disabled={locked}>
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </GhostButton>
          <UploadButton onFile={onUpload} disabled={locked} busy={busy} />
        </div>
      </div>
    </div>
  );
}

function FlaggedCard({
  item,
  busy,
  activityLabel,
  highlighted,
  disabled,
  checked,
  onSelect,
  selectDisabled,
  onCleanup,
  onPrevious,
  onRedo,
  onSkip,
  onUpload,
}: {
  item: FlaggedItem;
  busy: boolean;
  activityLabel: string | null;
  highlighted: boolean;
  disabled: boolean;
  checked: boolean;
  onSelect: () => void;
  selectDisabled: boolean;
  onCleanup: () => void;
  onPrevious: () => void;
  onRedo: () => void;
  onSkip: () => void;
  onUpload: (file: File) => void;
}) {
  const locked = disabled || busy;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--card)] transition ${
        checked
          ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30"
          : highlighted
            ? "border-green-400 ring-2 ring-green-400/40"
            : "border-amber-200"
      }`}
    >
      {activityLabel && <ActivityStrip label={activityLabel} />}
      <SelectBox checked={checked} onChange={onSelect} disabled={selectDisabled} />
      <ProductIdentityLink item={item}>
        <Figure label="Current" url={item.currentUrl} fit="cover" />
        <div className="flex flex-col gap-2 p-3 pb-0">
          <ProductTitle item={item} />
          {item.reason && (
            <p className="line-clamp-2 text-[11px] text-[var(--foreground)]/50">
              {item.reason}
            </p>
          )}
        </div>
      </ProductIdentityLink>
      <div className="mt-auto flex flex-col gap-1.5 p-3 pt-2">
        <PrimaryButton onClick={onCleanup} disabled={locked} busy={busy} className="w-full">
          <Wand2 className="h-3.5 w-3.5" /> Remove hand
        </PrimaryButton>
        {(item.previousCount > 0 || item.nextCount > 0) && (
          <div className="flex items-center gap-1.5">
            <GhostButton
              onClick={onPrevious}
              disabled={locked || item.previousCount === 0}
              title="Restore the previous generated thumbnail."
              className="flex-1"
            >
              <Undo2 className="h-3.5 w-3.5" /> Previous
            </GhostButton>
            <GhostButton
              onClick={onRedo}
              disabled={locked || item.nextCount === 0}
              title="Bring back the thumbnail you left when you chose Previous."
              className="flex-1"
            >
              <Redo2 className="h-3.5 w-3.5" /> Redo
            </GhostButton>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <UploadButton
            onFile={onUpload}
            disabled={locked}
            busy={busy}
            className="flex-1"
          />
          <IconLink
            href={adminProductEditorHref(item.productId)}
            title="Edit listing"
            external
            className="flex-1"
          >
            <Pencil className="h-3.5 w-3.5" />
          </IconLink>
          <GhostButton
            onClick={onSkip}
            disabled={locked}
            title="Skip"
            className="flex-1"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function SimpleCard({
  item,
  badge,
  busy,
  activityLabel,
  highlighted,
  disabled,
  checked,
  onSelect,
  selectDisabled,
  actionLabel,
  actionIcon,
  onAction,
  onUpload,
  onRemoveBg,
  onRemoveTag,
}: {
  item: BasicItem;
  badge: string;
  busy: boolean;
  activityLabel: string | null;
  highlighted: boolean;
  disabled: boolean;
  checked: boolean;
  onSelect: () => void;
  selectDisabled: boolean;
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: () => void;
  onUpload: (file: File) => void;
  onRemoveBg?: () => void;
  onRemoveTag?: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--card)] transition ${
        checked
          ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30"
          : highlighted
            ? "border-green-400 ring-2 ring-green-400/40"
            : "border-[var(--border)]"
      }`}
    >
      {activityLabel && <ActivityStrip label={activityLabel} />}
      <SelectBox checked={checked} onChange={onSelect} disabled={selectDisabled} />
      <ProductIdentityLink item={item}>
        <Figure label={badge} url={item.currentUrl} fit="cover" live={badge === "Live"} />
        <div className="p-3 pb-0">
          <ProductTitle item={item} />
        </div>
      </ProductIdentityLink>
      <div className="mt-auto flex flex-col gap-1.5 p-3 pt-2">
        <PrimaryButton onClick={onAction} disabled={disabled} busy={busy} className="w-full">
          {actionIcon} {actionLabel}
        </PrimaryButton>
        <div className="flex items-center gap-1.5">
          {onRemoveBg && (
            <GhostButton
              onClick={onRemoveBg}
              disabled={disabled}
              accent
              title="Remove background"
              className="flex-1"
            >
              <Eraser className="h-3.5 w-3.5" />
            </GhostButton>
          )}
          {onRemoveTag && (
            <GhostButton
              onClick={onRemoveTag}
              disabled={disabled}
              accent
              title="Remove tag"
              className="flex-1"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </GhostButton>
          )}
          <UploadButton
            onFile={onUpload}
            disabled={disabled}
            busy={busy}
            className="flex-1"
          />
          <IconLink
            href={productPageHref(item)}
            title={productPageLinkLabel(item.productStatus)}
            external
            className="flex-1"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </IconLink>
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  url,
  fit,
  highlight,
  live,
}: {
  label: string;
  url: string | null;
  fit: "cover" | "contain";
  highlight?: boolean;
  live?: boolean;
}) {
  return (
    <div className="relative aspect-[4/5] bg-[var(--product-surface)]">
      {url ? (
        <Image
          key={url}
          src={url}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, 25vw"
          className={fit === "contain" ? "object-contain" : "object-cover"}
        />
      ) : (
        <div className="grid h-full place-items-center text-3xl">🎀</div>
      )}
      <span
        className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
          highlight ? "bg-[var(--primary)]" : live ? "bg-green-600" : "bg-black/55"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "primary" | "green" | "amber";
}) {
  const tones: Record<string, string> = {
    muted: "bg-[var(--muted)] text-[var(--foreground)]/70",
    primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 ${tones[tone]}`}>
      {label} {value}
    </span>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  busy,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  busy?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  accent,
  amber,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  accent?: boolean;
  amber?: boolean;
  title?: string;
  className?: string;
}) {
  const tone = accent
    ? "border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/5"
    : amber
      ? "border-amber-300 text-amber-700 hover:bg-amber-50"
      : "border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)]";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function BulkButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone: "primary" | "accent" | "amber" | "ghost";
}) {
  const tones: Record<string, string> = {
    primary: "bg-[var(--primary)] text-white hover:brightness-105",
    accent: "border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/5",
    amber: "border border-amber-300 text-amber-700 hover:bg-amber-50",
    ghost: "border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function UploadButton({
  onFile,
  disabled,
  busy,
  className,
}: {
  onFile: (file: File) => void;
  disabled: boolean;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        title="Upload a thumbnail image"
        className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
      </button>
    </>
  );
}

function IconLink({
  href,
  title,
  external,
  children,
  className,
}: {
  href: string;
  title: string;
  external?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      target={external ? PRODUCT_PAGE_LINK_ATTRS.target : undefined}
      rel={external ? PRODUCT_PAGE_LINK_ATTRS.rel : undefined}
      title={title}
      className={`grid place-items-center rounded-full border border-[var(--border)] px-3 py-2 text-[var(--foreground)]/60 transition hover:border-[var(--primary)] hover:text-[var(--primary)] ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}
