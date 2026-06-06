"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Check, X, BadgeCheck, RotateCcw } from "lucide-react";
import { Stars } from "@/components/reviews/Stars";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { AdminReview } from "@/lib/reviews";
import { moderateReview } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function ReviewsConsole({ reviews }: { reviews: AdminReview[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  function act(id: number, status: string) {
    setBusyId(id);
    startTransition(async () => {
      await moderateReview(id, status);
      router.refresh();
      setBusyId(null);
    });
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center text-[var(--foreground)]/60">
        No reviews here yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((r) => {
        const busy = pending && busyId === r.id;
        return (
          <li
            key={r.id}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Stars rating={r.rating} size={15} />
              <StatusBadge status={r.status} />
              {r.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <BadgeCheck className="h-3 w-3" /> Verified
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--foreground)]/50">
                {dateFmt.format(new Date(r.createdAt))}
              </span>
            </div>

            {r.title && <p className="mt-2 font-bold">{r.title}</p>}
            <p className="mt-1 whitespace-pre-line text-sm text-[var(--foreground)]/80">
              {r.body}
            </p>
            <p className="mt-2 text-xs text-[var(--foreground)]/50">
              {r.authorName}
              {r.authorEmail ? ` · ${r.authorEmail}` : ""} ·{" "}
              {r.product ? (
                <Link
                  href={`/products/${r.product.slug}`}
                  className="font-semibold text-[var(--primary)] hover:underline"
                >
                  {r.product.title}
                </Link>
              ) : (
                "Unknown product"
              )}
            </p>

            <div className="mt-3 flex items-center gap-2">
              {r.status !== "published" && (
                <button
                  onClick={() => act(r.id, "published")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Publish
                </button>
              )}
              {r.status !== "rejected" && (
                <button
                  onClick={() => act(r.id, "rejected")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              )}
              {r.status !== "pending" && (
                <button
                  onClick={() => act(r.id, "pending")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold hover:border-[var(--primary)] disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Re-queue
                </button>
              )}
              {busy && (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
