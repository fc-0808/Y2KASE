"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  Check,
  X,
  Trash2,
  Copy,
  Download,
  Send,
  RotateCcw,
  Clock,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PRESETS, PLATFORMS } from "@/lib/social/presets";
import type { SocialCreative, MetricsTotals } from "@/lib/social/creatives";
import type { JobQueueCounts } from "@/lib/social/jobs";
import type { PinterestBoard } from "@/lib/social/pinterest";
import {
  generateCreative,
  moderateCreative,
  removeCreative,
  fetchPinterestBoards,
  publishNow,
  schedulePublish,
  enqueueBatch,
  processQueueNow,
  clearQueue,
  checkPinterestConnection,
  refreshAnalytics,
  type ConnectionResult,
} from "./actions";
import {
  Layers,
  Play,
  Trash,
  Eye,
  Bookmark,
  MousePointerClick,
  BarChart3,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

const numberFmt = new Intl.NumberFormat("en-US", { notation: "compact" });

type ProductOption = { id: number; title: string; imageUrl: string | null };

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Default schedule = next top-of-hour + 1h, formatted for datetime-local. */
function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const QUALITIES = [
  { key: "low", label: "Low · cheapest" },
  { key: "medium", label: "Medium · recommended" },
  { key: "high", label: "High · premium" },
];

export function SocialStudio({
  creatives,
  products,
  pinterestReady,
  jobCounts,
  metrics,
}: {
  creatives: SocialCreative[];
  products: ProductOption[];
  pinterestReady: boolean;
  jobCounts: JobQueueCounts;
  metrics: MetricsTotals;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [notice, setNotice] = useState<string | null>(null);

  // Batch selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(
    new Set(),
  );
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(
    new Set([PRESETS[0].key]),
  );
  const [queueBusy, setQueueBusy] = useState(false);

  const queuePending = jobCounts.queued + jobCounts.processing;

  // While the queue is draining, gently poll so new creatives appear.
  useEffect(() => {
    if (queuePending === 0) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [queuePending, router]);

  // Pinterest boards (lazy-loaded once when publishing is available).
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  const [boardId, setBoardId] = useState<string>("");

  // Pinterest connection status (account verification).
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const [refreshingMetrics, setRefreshingMetrics] = useState(false);

  useEffect(() => {
    if (!pinterestReady || boardsLoaded) return;
    let cancelled = false;
    Promise.all([fetchPinterestBoards(), checkPinterestConnection()]).then(
      ([boardsRes, conn]) => {
        if (cancelled) return;
        setBoardsLoaded(true);
        setConnection(conn);
        if (boardsRes.ok) {
          setBoards(boardsRes.boards);
          if (boardsRes.boards[0]) {
            setBoardId((prev) => prev || boardsRes.boards[0].id);
          }
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pinterestReady, boardsLoaded]);

  function handleRefreshMetrics() {
    setRefreshingMetrics(true);
    setNotice(null);
    startTransition(async () => {
      const res = await refreshAnalytics();
      setRefreshingMetrics(false);
      if (res.message) setNotice(res.message);
      router.refresh();
    });
  }

  // Generation form state
  const [productId, setProductId] = useState<number | "">(
    products[0]?.id ?? "",
  );
  const [preset, setPreset] = useState(PRESETS[0].key);
  const [platform, setPlatform] = useState<string>(PRESETS[0].platform);
  const [quality, setQuality] = useState("medium");
  const [extra, setExtra] = useState("");

  const selectedPreset = useMemo(
    () => PRESETS.find((p) => p.key === preset) ?? PRESETS[0],
    [preset],
  );

  function handleGenerate() {
    if (productId === "") {
      setError("Pick a product first.");
      return;
    }
    setError(null);
    setGenerating(true);
    startTransition(async () => {
      const res = await generateCreative({
        productId: Number(productId),
        preset,
        platform,
        quality,
        extra: extra.trim() || undefined,
      });
      setGenerating(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setExtra("");
      router.refresh();
    });
  }

  function toggleProduct(id: number) {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePreset(key: string) {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const batchCount = selectedProducts.size * selectedPresets.size;

  function handleQueueBatch() {
    if (batchCount === 0) {
      setError("Select at least one product and one preset.");
      return;
    }
    setError(null);
    setNotice(null);
    setQueueBusy(true);
    startTransition(async () => {
      const res = await enqueueBatch({
        productIds: Array.from(selectedProducts),
        presets: Array.from(selectedPresets),
        platform,
        quality,
        extra: extra.trim() || undefined,
      });
      setQueueBusy(false);
      if (!res.ok) setError(res.message);
      else {
        setNotice(res.message);
        setSelectedProducts(new Set());
      }
      router.refresh();
      // Kick the worker once so generation starts immediately.
      if (res.ok) void handleProcessNow();
    });
  }

  function handleProcessNow() {
    setQueueBusy(true);
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const res = await processQueueNow();
        setQueueBusy(false);
        if (res.message) setNotice(res.message);
        router.refresh();
        resolve();
      });
    });
  }

  function handleClearQueue() {
    setQueueBusy(true);
    startTransition(async () => {
      await clearQueue();
      setQueueBusy(false);
      router.refresh();
    });
  }

  function act(id: number, status: string) {
    setBusyId(id);
    startTransition(async () => {
      await moderateCreative(id, status);
      router.refresh();
      setBusyId(null);
    });
  }

  function del(id: number) {
    if (!confirm("Delete this creative? This also removes the image file.")) return;
    setBusyId(id);
    startTransition(async () => {
      await removeCreative(id);
      router.refresh();
      setBusyId(null);
    });
  }

  function copyCaption(c: SocialCreative) {
    const tags = c.hashtags.map((t) => `#${t}`).join(" ");
    const text = [c.caption, tags].filter(Boolean).join("\n\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function doPublishNow(id: number) {
    if (!boardId) {
      setError("Pick a Pinterest board at the top first.");
      return;
    }
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await publishNow(id, boardId);
      if (!res.ok) setError(res.message);
      router.refresh();
      setBusyId(null);
    });
  }

  function doSchedule(id: number, whenIso: string) {
    if (!boardId) {
      setError("Pick a Pinterest board at the top first.");
      return;
    }
    if (!whenIso) {
      setError("Pick a date/time to schedule.");
      return;
    }
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      // datetime-local has no timezone; treat as local time → ISO.
      const iso = new Date(whenIso).toISOString();
      const res = await schedulePublish(id, iso, boardId);
      if (!res.ok) setError(res.message);
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Generation panel ─────────────────────────────────────────── */}
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Sparkles className="h-5 w-5 text-[var(--primary)]" />
            {mode === "single" ? "Generate a creative" : "Batch factory"}
          </h2>
          <div className="inline-flex rounded-full bg-[var(--muted)] p-1">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={
                "rounded-full px-3 py-1 text-xs font-bold transition " +
                (mode === "single"
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground)]/60")
              }
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setMode("batch")}
              className={
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition " +
                (mode === "batch"
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground)]/60")
              }
            >
              <Layers className="h-3.5 w-3.5" /> Batch
            </button>
          </div>
        </div>

        {notice && (
          <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            {notice}
          </p>
        )}

        {mode === "batch" && (
          <BatchPanel
            products={products}
            selectedProducts={selectedProducts}
            selectedPresets={selectedPresets}
            onToggleProduct={toggleProduct}
            onTogglePreset={togglePreset}
            platform={platform}
            setPlatform={setPlatform}
            quality={quality}
            setQuality={setQuality}
            extra={extra}
            setExtra={setExtra}
            batchCount={batchCount}
            queueBusy={queueBusy || pending}
            onQueue={handleQueueBatch}
          />
        )}

        <div
          className={
            "grid gap-4 sm:grid-cols-2 lg:grid-cols-4" +
            (mode === "batch" ? " hidden" : "")
          }
        >
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
              Product
            </span>
            <select
              value={productId}
              onChange={(e) =>
                setProductId(e.target.value ? Number(e.target.value) : "")
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              {products.length === 0 && <option value="">No products</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
              Preset
            </span>
            <select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                const p = PRESETS.find((x) => x.key === e.target.value);
                if (p) setPlatform(p.platform);
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.emoji} {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
              Platform
            </span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              {PLATFORMS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.emoji} {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
              Quality
            </span>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              {QUALITIES.map((q) => (
                <option key={q.key} value={q.key}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {mode === "single" && (
          <>
            <p className="mt-2 text-xs text-[var(--foreground)]/50">
              {selectedPreset.emoji} {selectedPreset.description} · Output{" "}
              {selectedPreset.size}
            </p>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
                Extra art direction (optional)
              </span>
              <input
                type="text"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="e.g. Valentine's Day theme, pastel pink, snowy background…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
            </label>
          </>
        )}

        {error && (
          <p className="mt-3 text-sm font-semibold text-red-500" role="alert">
            {error}
          </p>
        )}

        {mode === "single" && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || productId === ""}
            className="btn-candy mt-4 inline-flex items-center gap-2 px-6 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating… (~15s)
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate creative
              </>
            )}
          </button>
        )}
      </section>

      {/* ── Generation queue status ──────────────────────────────────── */}
      {(queuePending > 0 || jobCounts.done > 0 || jobCounts.failed > 0) && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-bold">
            <Layers className="h-4 w-4 text-[var(--primary)]" /> Queue
          </span>
          <span className="text-xs text-[var(--foreground)]/70">
            {jobCounts.queued} queued · {jobCounts.processing} processing ·{" "}
            {jobCounts.done} done
            {jobCounts.failed > 0 && (
              <span className="text-red-500"> · {jobCounts.failed} failed</span>
            )}
          </span>
          {queuePending > 0 && (
            <button
              type="button"
              onClick={() => void handleProcessNow()}
              disabled={queueBusy || pending}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--primary)] px-3 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {queueBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Process now
            </button>
          )}
          {(jobCounts.done > 0 || jobCounts.failed > 0) && (
            <button
              type="button"
              onClick={handleClearQueue}
              disabled={queueBusy || pending}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold text-[var(--foreground)]/60 transition hover:border-[var(--primary)] disabled:opacity-50"
            >
              <Trash className="h-3.5 w-3.5" /> Clear finished
            </button>
          )}
          {queuePending > 0 && (
            <span className="ml-auto text-xs text-[var(--foreground)]/40">
              Auto-refreshing… new creatives appear below as they finish.
            </span>
          )}
        </section>
      )}

      {/* ── Pinterest performance summary ────────────────────────────── */}
      {pinterestReady && metrics.trackedPins > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-1.5 text-sm font-black">
              <BarChart3 className="h-4 w-4 text-[#E60023]" /> Pinterest
              performance
            </h3>
            <button
              type="button"
              onClick={handleRefreshMetrics}
              disabled={refreshingMetrics || pending}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold text-[var(--foreground)]/60 transition hover:border-[var(--primary)] disabled:opacity-50"
            >
              <RefreshCw
                className={
                  "h-3.5 w-3.5" + (refreshingMetrics ? " animate-spin" : "")
                }
              />
              Refresh metrics
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricStat
              icon={<Eye className="h-4 w-4" />}
              label="Impressions"
              value={metrics.impressions}
            />
            <MetricStat
              icon={<Bookmark className="h-4 w-4" />}
              label="Saves"
              value={metrics.saves}
            />
            <MetricStat
              icon={<MousePointerClick className="h-4 w-4" />}
              label="Pin clicks"
              value={metrics.pinClicks}
            />
            <MetricStat
              icon={<ExternalLink className="h-4 w-4" />}
              label="Outbound"
              value={metrics.outboundClicks}
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--foreground)]/40">
            Across {metrics.trackedPins} tracked pin
            {metrics.trackedPins === 1 ? "" : "s"}. Updated daily; refresh for
            live data.
          </p>
        </section>
      )}

      {/* ── Pinterest publishing bar ─────────────────────────────────── */}
      {pinterestReady ? (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-bold text-[#E60023]">
            📌 Pinterest
          </span>
          {connection?.ok && connection.username && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> @{connection.username}
            </span>
          )}
          {connection && !connection.ok && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
              {connection.message}
            </span>
          )}
          <span className="text-xs text-[var(--foreground)]/50">
            Publish target board:
          </span>
          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
          >
            {!boardsLoaded && <option value="">Loading boards…</option>}
            {boardsLoaded && boards.length === 0 && (
              <option value="">No boards found</option>
            )}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-[var(--foreground)]/40">
            Approved creatives can be published now or scheduled.
          </span>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--foreground)]/60">
          📌 Set <code className="font-mono">PINTEREST_ACCESS_TOKEN</code> to
          enable one-click + scheduled publishing to Pinterest. Until then,
          download creatives and post them manually.
        </section>
      )}

      {/* ── Creatives grid ───────────────────────────────────────────── */}
      {creatives.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center text-[var(--foreground)]/60">
          No creatives yet. Generate your first one above ✨
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {creatives.map((c) => {
            const busy = pending && busyId === c.id;
            return (
              <div
                key={c.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.imageUrl}
                  alt={c.productTitle ?? "Creative"}
                  className="aspect-square w-full bg-[var(--muted)] object-cover"
                  loading="lazy"
                />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={c.status} />
                    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold capitalize text-[var(--foreground)]/60">
                      {c.platform}
                    </span>
                    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--foreground)]/60">
                      {c.preset.replace(/_/g, " ")}
                    </span>
                  </div>

                  <p className="line-clamp-1 text-xs font-semibold text-[var(--foreground)]/70">
                    {c.productTitle ?? "—"}
                  </p>

                  {c.caption && (
                    <p className="line-clamp-3 text-xs leading-relaxed text-[var(--foreground)]/70">
                      {c.caption}
                    </p>
                  )}

                  {c.hashtags.length > 0 && (
                    <p className="line-clamp-2 text-[11px] text-[var(--primary)]">
                      {c.hashtags.map((t) => `#${t}`).join(" ")}
                    </p>
                  )}

                  {/* Status info: scheduled time / published link / last error */}
                  {c.status === "scheduled" && c.scheduledAt && (
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600">
                      <Clock className="h-3 w-3" />
                      Scheduled · {dateTimeFmt.format(new Date(c.scheduledAt))}
                    </p>
                  )}
                  {c.status === "published" && c.externalUrl && (
                    <a
                      href={c.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E60023] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> View on Pinterest
                    </a>
                  )}
                  {c.status === "published" && c.metricsUpdatedAt && (
                    <div className="flex flex-wrap gap-2 text-[11px] text-[var(--foreground)]/60">
                      <span className="inline-flex items-center gap-0.5" title="Impressions">
                        <Eye className="h-3 w-3" />
                        {numberFmt.format(c.metricImpressions ?? 0)}
                      </span>
                      <span className="inline-flex items-center gap-0.5" title="Saves">
                        <Bookmark className="h-3 w-3" />
                        {numberFmt.format(c.metricSaves ?? 0)}
                      </span>
                      <span className="inline-flex items-center gap-0.5" title="Pin clicks">
                        <MousePointerClick className="h-3 w-3" />
                        {numberFmt.format(c.metricPinClicks ?? 0)}
                      </span>
                      <span className="inline-flex items-center gap-0.5" title="Outbound clicks">
                        <ExternalLink className="h-3 w-3" />
                        {numberFmt.format(c.metricOutboundClicks ?? 0)}
                      </span>
                    </div>
                  )}
                  {c.lastError && (
                    <p className="inline-flex items-start gap-1 text-[11px] text-red-500">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {c.lastError}
                    </p>
                  )}

                  {/* Pinterest publishing controls (approved + pinterest) */}
                  {pinterestReady &&
                    c.platform === "pinterest" &&
                    (c.status === "approved" || c.status === "scheduled") && (
                      <PublishControls
                        creativeId={c.id}
                        busy={busy}
                        onPublishNow={doPublishNow}
                        onSchedule={doSchedule}
                      />
                    )}

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                    {c.status !== "approved" && c.status !== "published" && (
                      <button
                        type="button"
                        onClick={() => act(c.id, "approved")}
                        disabled={busy}
                        title="Approve"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {c.status === "approved" &&
                      !(pinterestReady && c.platform === "pinterest") && (
                        <button
                          type="button"
                          onClick={() => act(c.id, "published")}
                          disabled={busy}
                          title="Mark as published (manual)"
                          className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--primary)] px-3 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" /> Posted
                        </button>
                      )}
                    {c.status !== "rejected" && (
                      <button
                        type="button"
                        onClick={() => act(c.id, "rejected")}
                        disabled={busy}
                        title="Reject"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 transition hover:bg-red-200 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {c.status === "rejected" && (
                      <button
                        type="button"
                        onClick={() => act(c.id, "draft")}
                        disabled={busy}
                        title="Restore to draft"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)]/60 transition hover:bg-[var(--border)] disabled:opacity-50"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => copyCaption(c)}
                      title="Copy caption + hashtags"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)]/60 transition hover:bg-[var(--border)]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={c.imageUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Download image"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)]/60 transition hover:bg-[var(--border)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => del(c.id)}
                      disabled={busy}
                      title="Delete"
                      className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--foreground)]/40 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A single stat tile in the Pinterest performance summary. */
function MetricStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-[var(--muted)]/50 p-3">
      <div className="flex items-center gap-1.5 text-[var(--foreground)]/50">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-1 text-xl font-black">{numberFmt.format(value)}</p>
    </div>
  );
}

/** Batch factory: multi-select products × presets → queue generation jobs. */
function BatchPanel({
  products,
  selectedProducts,
  selectedPresets,
  onToggleProduct,
  onTogglePreset,
  platform,
  setPlatform,
  quality,
  setQuality,
  extra,
  setExtra,
  batchCount,
  queueBusy,
  onQueue,
}: {
  products: ProductOption[];
  selectedProducts: Set<number>;
  selectedPresets: Set<string>;
  onToggleProduct: (id: number) => void;
  onTogglePreset: (key: string) => void;
  platform: string;
  setPlatform: (v: string) => void;
  quality: string;
  setQuality: (v: string) => void;
  extra: string;
  setExtra: (v: string) => void;
  batchCount: number;
  queueBusy: boolean;
  onQueue: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Presets multi-select */}
      <div>
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
          Presets ({selectedPresets.size} selected)
        </span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const on = selectedPresets.has(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onTogglePreset(p.key)}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                  (on
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--muted)] text-[var(--foreground)]/70 hover:bg-[var(--border)]")
                }
              >
                {p.emoji} {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Products multi-select */}
      <div>
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
          Products ({selectedProducts.size} selected)
        </span>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
          {products.length === 0 && (
            <p className="p-2 text-xs text-[var(--foreground)]/50">No products.</p>
          )}
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {products.map((p) => {
              const on = selectedProducts.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggleProduct(p.id)}
                  className={
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition " +
                    (on
                      ? "bg-[var(--primary-soft)] text-[var(--foreground)]"
                      : "hover:bg-[var(--muted)]")
                  }
                >
                  <span
                    className={
                      "grid h-4 w-4 shrink-0 place-items-center rounded border " +
                      (on
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)]")
                    }
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="line-clamp-1">{p.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Platform + quality + extra */}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            Platform
          </span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            {PLATFORMS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            Quality
          </span>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            {QUALITIES.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            Extra art direction
          </span>
          <input
            type="text"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="optional theme…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onQueue}
          disabled={queueBusy || batchCount === 0}
          className="btn-candy inline-flex items-center gap-2 px-6 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {queueBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Layers className="h-4 w-4" />
          )}
          Queue {batchCount > 0 ? `${batchCount} ` : ""}creative
          {batchCount === 1 ? "" : "s"}
        </button>
        <span className="text-xs text-[var(--foreground)]/50">
          {selectedProducts.size} products × {selectedPresets.size} presets ={" "}
          {batchCount} jobs
        </span>
      </div>
    </div>
  );
}

/** Per-card Pinterest publish + schedule controls. */
function PublishControls({
  creativeId,
  busy,
  onPublishNow,
  onSchedule,
}: {
  creativeId: number;
  busy: boolean;
  onPublishNow: (id: number) => void;
  onSchedule: (id: number, whenIso: string) => void;
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [when, setWhen] = useState(defaultScheduleValue);

  return (
    <div className="rounded-xl bg-[var(--muted)]/50 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPublishNow(creativeId)}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-[#E60023] px-3 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Publish now
        </button>
        <button
          type="button"
          onClick={() => setShowSchedule((s) => !s)}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-bold text-[var(--foreground)]/70 transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
        >
          <Clock className="h-3.5 w-3.5" /> Schedule
        </button>
      </div>
      {showSchedule && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => onSchedule(creativeId, when)}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-violet-600 px-3 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Set
          </button>
        </div>
      )}
    </div>
  );
}
