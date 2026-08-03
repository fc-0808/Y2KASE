"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  Check,
  Flag,
  SkipForward,
  Sparkles,
  Loader2,
  Wand2,
  ExternalLink,
  RefreshCw,
  Clock,
  Rocket,
  StopCircle,
  X,
  Upload,
  Crop,
  Eraser,
} from "lucide-react";
import {
  generateThumbnailProposals,
  approveThumbnailProposal,
  decideThumbnailProposal,
  aiCleanupThumbnail,
  aiRemoveThumbnailArtifact,
  bulkApproveThumbnails,
  bulkDecideThumbnails,
  bulkRegenerateThumbnails,
  adjustThumbnailCrop,
  removeThumbnailBackground,
} from "../actions";
import type { ThumbnailQueueStats } from "@/lib/admin/thumbnails";
import {
  THUMBNAIL_SCOPES,
  SCOPE_LABELS,
  DEFAULT_THUMBNAIL_SCOPE,
  type ThumbnailScope,
} from "@/lib/admin/thumbnail-scope";
import { ThumbnailCropModal } from "./ThumbnailCropModal";

type Item = {
  productId: number;
  slug: string;
  title: string;
  /** `active` | `draft`. Drafts aren't on the storefront yet. */
  productStatus: string;
  currentUrl: string | null;
  proposalUrl: string;
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
type BulkResult = ActionResult & { processed: number };

const isDraft = (item: { productStatus: string }) =>
  item.productStatus === "draft";

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
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batch, setBatch] = useState(5);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [adjust, setAdjust] = useState<Item | null>(null);
  const [activeAction, setActiveAction] = useState<{
    productId: number;
    label: string;
  } | null>(null);

  const stopRef = useRef(false);
  const [auto, setAuto] = useState({ running: false, done: 0, total: 0 });
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0, verb: "" });

  const globalBusy = auto.running || bulk.running;

  function flash(result: ActionResult) {
    setToast(result);
    if (result.ok) setTimeout(() => setToast(null), 3500);
  }

  function startAction(productId: number, label: string) {
    setActiveAction({ productId, label });
  }

  function finishAction(productId: number) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
    setActiveAction((current) =>
      current?.productId === productId ? null : current,
    );
  }


  // ── Selection helpers ──────────────────────────────────────────────────
  const proposedIds = useMemo(() => new Set(items.map((i) => i.productId)), [items]);
  const flaggedIds = useMemo(() => new Set(flagged.map((i) => i.productId)), [flagged]);

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
  const flagIds = sel.filter((id) => proposedIds.has(id) || flaggedIds.has(id));
  const skipIds = sel.filter((id) => proposedIds.has(id) || flaggedIds.has(id));

  // ── Single-item action (per-item busy; does NOT lock other cards) ──────
  function run(
    productId: number,
    label: string,
    fn: () => Promise<ActionResult>,
  ) {
    setBusyIds((prev) => new Set(prev).add(productId));
    startAction(productId, label);
    startTransition(async () => {
      try {
        const res = await fn();
        flash(res);
        if (res.ok) {
          setToast({ ok: true, message: `${label} complete.` });
          setTimeout(() => router.refresh(), 0);
        } else {
          router.refresh();
        }
      } finally {
        finishAction(productId);
      }
    });
  }
  const busy = (id: number) => busyIds.has(id);

  // ── Manual thumbnail upload (multipart route; no server-action size limit) ─
  function uploadThumbnail(productId: number, file: File) {
    setBusyIds((prev) => new Set(prev).add(productId));
    void (async () => {
      try {
        const fd = new FormData();
        fd.append("productId", String(productId));
        fd.append("file", file);
        const res = await fetch("/api/admin/thumbnails/upload", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => null)) as ActionResult | null;
        flash(json ?? { ok: false, message: "Upload failed." });
        router.refresh();
      } catch {
        flash({ ok: false, message: "Upload failed." });
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    })();
  }

  // ── Generate the pending queue (client-orchestrated batches) ───────────
  const remaining = stats.pending + stats.flagged;

  function generateOnce() {
    startTransition(async () => {
      const res = await generateThumbnailProposals(batch, scope);
      flash(res);
      router.refresh();
    });
  }
  async function generateAll() {
    stopRef.current = false;
    if (remaining === 0) return;
    setAuto({ running: true, done: 0, total: remaining });
    let done = 0;
    try {
      while (!stopRef.current) {
        const res = await generateThumbnailProposals(batch, scope);
        if (!res.ok) {
          flash(res);
          break;
        }
        done += res.changed;
        setAuto({ running: true, done, total: Math.max(remaining, done) });
        router.refresh();
        // The candidate pool only shrinks when a product yields a proposal —
        // failures are re-flagged and stay eligible — so a batch that proposed
        // nothing means the rest can't succeed either. Without this the loop
        // would retry the same failing products forever.
        if (res.proposed === 0) break;
      }
      flash({
        ok: true,
        message: stopRef.current
          ? `Stopped after generating ${done}.`
          : `Done — generated ${done} thumbnail(s).`,
      });
    } catch (err) {
      flash({ ok: false, message: err instanceof Error ? err.message : "Failed." });
    } finally {
      setAuto((a) => ({ ...a, running: false }));
      router.refresh();
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
    try {
      for (let i = 0; i < ids.length && !stopRef.current; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const res = await serverFn(chunk);
        if (!res.ok) {
          flash(res);
          break;
        }
        done += res.processed;
        setBulk({ running: true, done, total: ids.length, verb });
        router.refresh();
      }
      flash({ ok: true, message: `${verb} ${done}.` });
    } catch (err) {
      flash({ ok: false, message: err instanceof Error ? err.message : "Bulk failed." });
    } finally {
      setBulk({ running: false, done: 0, total: 0, verb: "" });
      clearSelection();
      router.refresh();
    }
  }

  const empty =
    items.length === 0 &&
    flagged.length === 0 &&
    approved.length === 0 &&
    pending.length === 0;

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
          <StatPill label="Not started" value={stats.pending} tone="muted" />
          <StatPill label="To review" value={stats.proposed} tone="primary" />
          <StatPill label="Approved" value={stats.approved} tone="green" />
          <StatPill label="Flagged" value={stats.flagged} tone="amber" />
          <StatPill label="Skipped" value={stats.skipped} tone="muted" />
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--foreground)]/45">
          <Clock className="h-3.5 w-3.5" />
          Generated with Nano Banana Pro (~45s each, in parallel). Counts and
          actions follow the selected scope. Nothing is published until you
          approve it — and drafts can be reviewed before they go live. The AI
          cleanup path also removes the small top-left physical tag when present.
        </p>
        {activeAction && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/20 bg-[var(--primary)]/8 px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {activeAction.label} in progress for product #{activeAction.productId}
            — refreshing when complete.
          </div>
        )}
      </div>

      {empty && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-20 text-center">
          <p className="text-lg font-bold">Nothing to review right now</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
            {stats.pending > 0
              ? `Click “Generate all” to process the ${stats.pending} pending product(s).`
              : "Every active product has been processed. 🎉"}
          </p>
        </div>
      )}

      {/* ── To review ────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <section>
          <SectionHeader
            title="To review"
            count={stats.proposed}
            subtitle={`Compare the proposed thumbnail against the current one, then approve, regenerate, flag, or skip. Tick cards to act in bulk.${
              stats.proposed > items.length
                ? ` Showing the first ${items.length} of ${stats.proposed}.`
                : ""
            }`}
            allSelected={items.every((i) => selected.has(i.productId))}
            onToggleAll={(on) => setSection(items.map((i) => i.productId), on)}
            disabled={globalBusy}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <ProposalCard
                key={item.productId}
                item={item}
                busy={busy(item.productId)}
                disabled={globalBusy}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={globalBusy}
                onApprove={() =>
                  run(item.productId, "Approve", () => approveThumbnailProposal(item.productId))
                }
                onCleanup={() =>
                  run(item.productId, "Regenerate", () => aiCleanupThumbnail(item.productId))
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
      {flagged.length > 0 && (
        <section>
          <SectionHeader
            title="Needs attention"
            count={stats.flagged}
            subtitle={`Generation didn't produce a usable result (no images, or an error). Retry with the AI cleanup flow, or open the product to add a better photo.${
              stats.flagged > flagged.length
                ? ` Showing the first ${flagged.length} of ${stats.flagged}.`
                : ""
            }`}
            allSelected={flagged.every((i) => selected.has(i.productId))}
            onToggleAll={(on) => setSection(flagged.map((i) => i.productId), on)}
            disabled={globalBusy}
          />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {flagged.map((item) => (
              <FlaggedCard
                key={item.productId}
                item={item}
                busy={busy(item.productId)}
                disabled={globalBusy}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={globalBusy}
                onCleanup={() =>
                  run(item.productId, "Regenerate", () => aiCleanupThumbnail(item.productId))
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
      {approved.length > 0 && (
        <section>
          <SectionHeader
            title="Live thumbnails"
            count={stats.approved}
            subtitle={`Already live on the storefront. Regenerate to rebuild — the new version goes to “To review” before it replaces the live image.${
              stats.approved > approved.length
                ? ` Showing the first ${approved.length} of ${stats.approved}.`
                : ""
            }`}
            allSelected={approved.every((i) => selected.has(i.productId))}
            onToggleAll={(on) => setSection(approved.map((i) => i.productId), on)}
            disabled={globalBusy}
          />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {approved.map((item) => (
              <SimpleCard
                key={item.productId}
                item={item}
                badge="Live"
                busy={busy(item.productId)}
                disabled={globalBusy || busy(item.productId)}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={globalBusy}
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
      {pending.length > 0 && (
        <section>
          <SectionHeader
            title="Not started"
            count={stats.pending}
            subtitle={`Products without a generated thumbnail yet.${
              stats.pending > pending.length
                ? ` Showing the first ${pending.length} — use “Generate all” for the rest.`
                : ""
            }`}
            allSelected={pending.every((i) => selected.has(i.productId))}
            onToggleAll={(on) => setSection(pending.map((i) => i.productId), on)}
            disabled={globalBusy}
          />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pending.map((item) => (
              <SimpleCard
                key={item.productId}
                item={item}
                badge="Current"
                busy={busy(item.productId)}
                disabled={globalBusy || busy(item.productId)}
                checked={selected.has(item.productId)}
                onSelect={() => toggleSelect(item.productId)}
                selectDisabled={globalBusy}
                actionLabel="Generate"
                actionIcon={<Sparkles className="h-3.5 w-3.5" />}
                onAction={() =>
                  run(item.productId, "Regenerate", () => aiCleanupThumbnail(item.productId))
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
                <BulkButton
                  onClick={() =>
                    runBulk(approveIds, (c) => bulkApproveThumbnails(c), 25, "Approved")
                  }
                  disabled={approveIds.length === 0}
                  tone="primary"
                >
                  <Check className="h-3.5 w-3.5" /> Approve ({approveIds.length})
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

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-lg ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
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
      title="Draft — not on the storefront yet. Its thumbnail goes live when you publish the product."
      className={`shrink-0 rounded-full bg-[var(--foreground)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/55 ${className ?? ""}`}
    >
      Draft
    </span>
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
  disabled,
  checked,
  onSelect,
  selectDisabled,
  onApprove,
  onFlag,
  onSkip,
  onCleanup,
  onUpload,
  onAdjust,
  onRemoveBg,
  onRemoveTag,
}: {
  item: Item;
  busy: boolean;
  disabled: boolean;
  checked: boolean;
  onSelect: () => void;
  selectDisabled: boolean;
  onApprove: () => void;
  onFlag: () => void;
  onSkip: () => void;
  onCleanup: () => void;
  onUpload: (file: File) => void;
  onAdjust: () => void;
  onRemoveBg: () => void;
  onRemoveTag: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--card)] shadow-[0_10px_30px_-26px_rgba(120,60,120,0.5)] transition ${
        checked ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-[var(--border)]"
      }`}
    >
      <SelectBox checked={checked} onChange={onSelect} disabled={selectDisabled} />
      <div className="flex items-start justify-between gap-2 p-3 pr-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/products/${item.slug}`}
              target="_blank"
              className="line-clamp-2 text-sm font-bold hover:text-[var(--primary)]"
            >
              {item.title}
            </Link>
            {isDraft(item) && <DraftChip />}
          </div>
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

      <div className="flex flex-col gap-2 p-3">
        <div className="flex gap-2">
          <PrimaryButton
            onClick={onApprove}
            disabled={disabled}
            busy={busy}
            className="flex-1"
          >
            <Check className="h-3.5 w-3.5" /> Approve
          </PrimaryButton>
          <GhostButton onClick={onCleanup} disabled={disabled} accent className="flex-1">
            <Wand2 className="h-3.5 w-3.5" /> Regenerate
          </GhostButton>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <GhostButton onClick={onRemoveBg} disabled={disabled} accent>
            <Eraser className="h-3.5 w-3.5" /> Remove BG
          </GhostButton>
          <GhostButton onClick={onRemoveTag} disabled={disabled} accent>
            <Sparkles className="h-3.5 w-3.5" /> Remove Tag
          </GhostButton>
          <GhostButton onClick={onAdjust} disabled={disabled} accent>
            <Crop className="h-3.5 w-3.5" /> Adjust
          </GhostButton>
          <GhostButton onClick={onFlag} disabled={disabled} amber>
            <Flag className="h-3.5 w-3.5" /> Flag
          </GhostButton>
          <GhostButton onClick={onSkip} disabled={disabled}>
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </GhostButton>
          <UploadButton onFile={onUpload} disabled={disabled} busy={busy} />
        </div>
      </div>
    </div>
  );
}

function FlaggedCard({
  item,
  busy,
  disabled,
  checked,
  onSelect,
  selectDisabled,
  onCleanup,
  onSkip,
  onUpload,
}: {
  item: FlaggedItem;
  busy: boolean;
  disabled: boolean;
  checked: boolean;
  onSelect: () => void;
  selectDisabled: boolean;
  onCleanup: () => void;
  onSkip: () => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--card)] transition ${
        checked ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-amber-200"
      }`}
    >
      <SelectBox checked={checked} onChange={onSelect} disabled={selectDisabled} />
      <Figure label="Current" url={item.currentUrl} fit="cover" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          href={`/products/${item.slug}`}
          target="_blank"
          className="line-clamp-2 text-sm font-bold hover:text-[var(--primary)]"
        >
          {item.title}
        </Link>
        {item.reason && (
          <p className="line-clamp-2 text-[11px] text-[var(--foreground)]/50">
            {item.reason}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <PrimaryButton onClick={onCleanup} disabled={disabled} busy={busy} className="w-full">
            <Wand2 className="h-3.5 w-3.5" /> Remove hand
          </PrimaryButton>
          <div className="flex items-center gap-1.5">
            <UploadButton
              onFile={onUpload}
              disabled={disabled}
              busy={busy}
              className="flex-1"
            />
            <IconLink
              href={`/admin/products/${item.productId}`}
              title="Open product"
              className="flex-1"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </IconLink>
            <GhostButton
              onClick={onSkip}
              disabled={disabled}
              title="Skip"
              className="flex-1"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </GhostButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimpleCard({
  item,
  badge,
  busy,
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
        checked ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-[var(--border)]"
      }`}
    >
      <SelectBox checked={checked} onChange={onSelect} disabled={selectDisabled} />
      <Figure label={badge} url={item.currentUrl} fit="cover" live={badge === "Live"} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          href={`/products/${item.slug}`}
          target="_blank"
          className="line-clamp-2 text-sm font-bold hover:text-[var(--primary)]"
        >
          {item.title}
        </Link>
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
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
              href={`/products/${item.slug}`}
              title="View on store"
              external
              className="flex-1"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </IconLink>
          </div>
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
          src={url}
          alt={label}
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
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
      target={external ? "_blank" : undefined}
      title={title}
      className={`grid place-items-center rounded-full border border-[var(--border)] px-3 py-2 text-[var(--foreground)]/60 transition hover:border-[var(--primary)] hover:text-[var(--primary)] ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}
