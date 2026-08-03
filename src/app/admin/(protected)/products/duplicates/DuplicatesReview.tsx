"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  Check,
  Trash2,
  Loader2,
  X,
  ExternalLink,
  CopyCheck,
  ScanSearch,
  StopCircle,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { DuplicateCluster } from "@/lib/catalog/duplicates";
import type { PhashCoverage } from "@/lib/catalog/phash-types";
import { bulkDeleteProducts } from "../actions";
import { scanPhashBatch } from "./actions";

export function DuplicatesReview({
  clusters,
  threshold,
  coverage,
}: {
  clusters: DuplicateCluster[];
  threshold: number;
  coverage: PhashCoverage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [scan, setScan] = useState<{
    running: boolean;
    done: number;
    total: number;
    failed: number;
  }>({ running: false, done: 0, total: 0, failed: 0 });
  const stopRef = useRef(false);

  function flash(result: { ok: boolean; message: string }) {
    setToast(result);
    if (result.ok) setTimeout(() => setToast(null), 3000);
  }

  function deleteProduct(id: number) {
    startTransition(async () => {
      const res = await bulkDeleteProducts([id]);
      flash(res);
      setConfirmId(null);
      if (res.ok) {
        setRemoved((prev) => new Set(prev).add(id));
        router.refresh();
      }
    });
  }

  /**
   * Fingerprint any unhashed images in serverless-safe batches, then refresh
   * so clustering re-runs on the updated hashes. Mirrors the thumbnails
   * "Generate all" orchestration pattern.
   */
  async function findDuplicates() {
    stopRef.current = false;
    const initialMissing = coverage.missingImages;
    setScan({
      running: true,
      done: 0,
      total: Math.max(initialMissing, 1),
      failed: 0,
    });

    let hashed = 0;
    let failed = 0;
    let aborted = false;

    try {
      if (initialMissing > 0) {
        for (;;) {
          if (stopRef.current) break;
          const res = await scanPhashBatch();
          if (!res.ok) {
            flash(res);
            aborted = true;
            break;
          }
          hashed += res.hashed;
          failed += res.failed;
          const done = hashed + failed;
          setScan({
            running: true,
            done,
            total: Math.max(initialMissing, done + res.remaining),
            failed,
          });
          // Stuck batch (every URL failing) — abort rather than loop forever.
          if (res.remaining > 0 && res.hashed === 0) {
            flash({
              ok: false,
              message:
                failed > 0
                  ? `Stopped — ${failed} image(s) could not be hashed (unreachable URL or bad file).`
                  : "Stopped — no images hashed in this batch.",
            });
            aborted = true;
            break;
          }
          if (res.remaining === 0) break;
        }
      }

      if (!aborted) {
        flash({
          ok: true,
          message: stopRef.current
            ? `Stopped after hashing ${hashed} image(s).`
            : hashed > 0
              ? `Scanned ${hashed} image(s)${failed ? ` · ${failed} failed` : ""}. Refreshing matches…`
              : "Catalogue already scanned — refreshing matches…",
        });
      }
    } catch (err) {
      flash({
        ok: false,
        message: err instanceof Error ? err.message : "Scan failed.",
      });
    } finally {
      setScan((s) => ({ ...s, running: false }));
      router.refresh();
    }
  }

  const scanning = scan.running;
  const needsScan = coverage.missingImages > 0 || coverage.unscannedProducts > 0;

  return (
    <div className="space-y-5">
      {/* ── Scan controls ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {scanning
              ? `Scanning photos… ${scan.done}/${scan.total}`
              : needsScan
                ? `${coverage.unscannedProducts} product${coverage.unscannedProducts === 1 ? "" : "s"} still need fingerprinting`
                : `${coverage.hashedImages}/${coverage.totalImages} photos fingerprinted`}
          </p>
          <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
            {scanning
              ? "Downloading and hashing product photos. Duplicates appear when the scan finishes."
              : needsScan
                ? "Click Find duplicates to fingerprint remaining photos, then match near-identical main images."
                : "Click Find duplicates anytime to re-check the catalogue."}
          </p>
          {scanning && scan.total > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.round((scan.done / scan.total) * 100))}%`,
                }}
              />
            </div>
          )}
        </div>

        {scanning ? (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <StopCircle className="h-4 w-4" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void findDuplicates()}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <ScanSearch className="h-4 w-4" /> Find duplicates
          </button>
        )}
      </div>

      {clusters.length === 0 ? (
        <EmptyState needsScan={needsScan} scanning={scanning} />
      ) : (
        <>
          <p className="text-sm text-[var(--foreground)]/60">
            <span className="font-bold text-[var(--foreground)]">
              {clusters.length}
            </span>{" "}
            group{clusters.length === 1 ? "" : "s"} of likely duplicates. Keep
            one product in each group and delete the rest.
          </p>

          {clusters.map((cluster, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)]/50 px-4 py-2.5">
                <span className="text-sm font-bold">
                  {cluster.products.length} matching products
                </span>
                <ConfidenceBadge
                  distance={cluster.minDistance}
                  threshold={threshold}
                />
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {cluster.products.map((p) => {
                  const isRemoved = removed.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-3 transition ${
                        isRemoved
                          ? "border-dashed border-[var(--border)] opacity-40"
                          : "border-[var(--border)]"
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
                          {p.imageUrl && (
                            <Image
                              src={p.imageUrl}
                              alt={p.title}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold leading-tight">
                            {p.title}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--foreground)]/55">
                            <StatusBadge status={p.status} />
                            <span>{formatPrice(p.price, p.currency)}</span>
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--foreground)]/40">
                            /{p.slug}
                          </p>
                        </div>
                      </div>

                      {!isRemoved && (
                        <div className="mt-3 flex items-center gap-2">
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="flex items-center gap-1 rounded-full bg-[var(--muted)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary)] hover:text-white"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </Link>
                          {confirmId === p.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => deleteProduct(p.id)}
                                disabled={pending || scanning}
                                className="flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {pending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmId(null)}
                                disabled={pending}
                                className="rounded-full px-2 py-1.5 text-xs font-semibold text-[var(--foreground)]/60 hover:bg-[var(--muted)]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmId(p.id)}
                              disabled={scanning}
                              className="flex items-center gap-1 rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {toast && (
        <div
          className={`fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
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
    </div>
  );
}

function EmptyState({
  needsScan,
  scanning,
}: {
  needsScan: boolean;
  scanning: boolean;
}) {
  if (scanning) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <h2 className="text-lg font-bold">Scanning catalogue…</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
          Fingerprinting product photos. Matches will show up here when the
          scan finishes.
        </p>
      </div>
    );
  }

  if (needsScan) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
          <ScanSearch className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold">Ready to scan</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
          Some product photos don&apos;t have a perceptual fingerprint yet.
          Click <span className="font-semibold">Find duplicates</span> above to
          hash them and surface near-identical main photos — no terminal
          required.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-600">
        <CopyCheck className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold">No likely duplicates found</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
        Every product&apos;s main photo looks distinct. After uploading a new
        batch, click <span className="font-semibold">Find duplicates</span> to
        re-scan.
      </p>
    </div>
  );
}

/** Translates Hamming distance into a human-friendly confidence label. */
function ConfidenceBadge({
  distance,
  threshold,
}: {
  distance: number;
  threshold: number;
}) {
  const { label, cls } =
    distance <= 2
      ? { label: "Identical", cls: "bg-red-100 text-red-700" }
      : distance <= Math.round(threshold / 2)
        ? { label: "Very likely", cls: "bg-amber-100 text-amber-700" }
        : {
            label: "Possible",
            cls: "bg-[var(--muted)] text-[var(--foreground)]/60",
          };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}
      title={`Closest match: ${distance}/64 bits differ (lower = more similar)`}
    >
      {label} match
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    draft: "bg-amber-100 text-amber-700",
    archived: "bg-gray-200 text-gray-600",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        styles[status] ?? "bg-[var(--muted)]"
      }`}
    >
      {status}
    </span>
  );
}
