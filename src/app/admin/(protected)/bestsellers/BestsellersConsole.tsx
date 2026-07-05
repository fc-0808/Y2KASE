"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Search,
  Check,
  X,
  Loader2,
  Star,
} from "lucide-react";
import type { BestsellerItem } from "@/lib/products";
import { setFeatured } from "../products/actions";
import { reorderBestsellers } from "./actions";

export function BestsellersConsole({
  current,
  candidates,
}: {
  current: BestsellerItem[];
  candidates: BestsellerItem[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState<BestsellerItem[]>(current);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const initialIds = useMemo(
    () => current.map((p) => p.id).join(","),
    [current],
  );
  const dirty = order.map((p) => p.id).join(",") !== initialIds;

  function flash(result: { ok: boolean; message: string }) {
    setToast(result);
    if (result.ok) setTimeout(() => setToast(null), 3000);
  }

  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
  }

  function saveOrder() {
    startTransition(async () => {
      const res = await reorderBestsellers(order.map((p) => p.id));
      flash(res);
      if (res.ok) router.refresh();
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      await setFeatured(id, false);
      setOrder((prev) => prev.filter((p) => p.id !== id));
      flash({ ok: true, message: "Removed from bestsellers." });
      router.refresh();
    });
  }

  function add(p: BestsellerItem) {
    startTransition(async () => {
      await setFeatured(p.id, true);
      setOrder((prev) => [...prev, p]);
      flash({ ok: true, message: "Added to bestsellers." });
      router.refresh();
    });
  }

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(order.map((p) => p.id));
    return candidates
      .filter((p) => !chosen.has(p.id))
      .filter((p) => !q || p.title.toLowerCase().includes(q))
      .slice(0, 60);
  }, [candidates, order, query]);

  return (
    <div className="space-y-8">
      {/* ── Current rail (ordered) ──────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            <Star className="h-4 w-4 fill-[var(--accent)] text-[var(--accent)]" />
            In the rail ({order.length})
          </h2>
          {dirty && (
            <button
              onClick={saveOrder}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save order
            </button>
          )}
        </div>

        {order.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center text-sm text-[var(--foreground)]/60">
            No bestsellers picked yet — the homepage is temporarily showing your
            newest products. Add some below to lock the rail.
          </div>
        ) : (
          <ol className="space-y-2">
            {order.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2.5"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-xs font-bold">
                  {i + 1}
                </span>
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)]">
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt={p.title}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">
                    {p.title}
                  </p>
                  {p.status !== "active" && (
                    <span className="text-[11px] font-bold uppercase tracking-wide text-amber-600">
                      {p.status} · hidden on storefront
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || pending}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)] disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1 || pending}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)] disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    disabled={pending}
                    className="grid h-8 w-8 place-items-center rounded-full text-red-500 hover:bg-red-50 disabled:opacity-40"
                    aria-label="Remove from bestsellers"
                    title="Remove from bestsellers"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Add from catalog ────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--foreground)]/50">
          Add a product
        </h2>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products to add…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>

        {filteredCandidates.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-[var(--foreground)]/50">
            No matching products.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {filteredCandidates.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-2"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt={p.title}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  )}
                </div>
                <p className="line-clamp-2 min-w-0 flex-1 text-xs font-medium">
                  {p.title}
                </p>
                <button
                  onClick={() => add(p)}
                  disabled={pending}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--muted)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--primary)] hover:text-white disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
