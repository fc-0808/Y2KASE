"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Check,
  X,
  Loader2,
  ExternalLink,
  Magnet,
  CircleCheck,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { confirmMagsafe, dismissMagsafe } from "../actions";

type Item = {
  id: number;
  slug: string;
  title: string;
  price: string;
  currency: string;
  status: string;
  imageUrl: string | null;
};

export function MagSafeReview({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);

  function act(id: number, kind: "confirm" | "dismiss") {
    setBusyId(id);
    startTransition(async () => {
      if (kind === "confirm") await confirmMagsafe(id);
      else await dismissMagsafe(id);
      setResolved((prev) => new Set(prev).add(id));
      setBusyId(null);
      router.refresh();
    });
  }

  const remaining = items.filter((i) => !resolved.has(i.id));

  if (remaining.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-600">
          <CircleCheck className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold">Nothing to review</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
          No products are awaiting MagSafe confirmation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--foreground)]/60">
        <span className="font-bold text-[var(--foreground)]">
          {remaining.length}
        </span>{" "}
        product{remaining.length === 1 ? "" : "s"} awaiting review.
      </p>

      {remaining.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3"
        >
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)]">
            {p.imageUrl && (
              <Image
                src={p.imageUrl}
                alt={p.title}
                fill
                sizes="64px"
                className="object-cover"
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-semibold">{p.title}</p>
            <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
              {formatPrice(p.price, p.currency)} · /{p.slug}
            </p>
          </div>

          <Link
            href={`/admin/products/${p.id}`}
            className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--muted)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary)] hover:text-white sm:flex"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </Link>
          <button
            onClick={() => act(p.id, "dismiss")}
            disabled={pending}
            className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--foreground)]/40 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Not MagSafe
          </button>
          <button
            onClick={() => act(p.id, "confirm")}
            disabled={pending}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending && busyId === p.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Magnet className="h-3.5 w-3.5" />
            )}
            Confirm MagSafe
          </button>
        </div>
      ))}
    </div>
  );
}
