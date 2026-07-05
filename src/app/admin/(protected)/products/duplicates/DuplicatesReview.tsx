"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Check,
  Trash2,
  Loader2,
  X,
  ExternalLink,
  CopyCheck,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { DuplicateCluster } from "@/lib/catalog/duplicates";
import { bulkDeleteProducts } from "../actions";

export function DuplicatesReview({
  clusters,
  threshold,
}: {
  clusters: DuplicateCluster[];
  threshold: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

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

  if (clusters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-600">
          <CopyCheck className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold">No likely duplicates found</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
          Every product&apos;s main photo looks distinct. If you just uploaded a
          batch, make sure existing images are hashed with{" "}
          <code className="rounded bg-[var(--muted)] px-1 py-0.5">
            npm run backfill:phash
          </code>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--foreground)]/60">
        <span className="font-bold text-[var(--foreground)]">
          {clusters.length}
        </span>{" "}
        group{clusters.length === 1 ? "" : "s"} of likely duplicates. Keep one
        product in each group and delete the rest.
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
                            disabled={pending}
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
                          className="flex items-center gap-1 rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
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
