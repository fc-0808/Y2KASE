"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { MOTIF_FAMILIES, type MotifFamilySlug } from "@/lib/catalog/motifs";
import { cn } from "@/lib/utils";
import { detectProductMotifs, saveProductMotifs } from "./actions";

/**
 * Operator control for the storefront Theme facet.
 *
 * Auto-classification (ingest + backfill) fills `products.motifs` from listing
 * text and the copy model; this card is how a human corrects it. Saving always
 * locks the row so a later backfill cannot silently undo the decision.
 */
export function MotifEditorCard({
  productId,
  initialMotifs,
  locked,
}: {
  productId: number;
  initialMotifs: MotifFamilySlug[];
  locked: boolean;
}) {
  const [selected, setSelected] = useState<MotifFamilySlug[]>(initialMotifs);
  const [saving, startSaving] = useTransition();
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  function toggle(slug: MotifFamilySlug) {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
    setResult(null);
  }

  function save() {
    startSaving(async () => {
      const res = await saveProductMotifs(productId, selected);
      setResult(res);
      if (res.ok) setSelected(res.motifs);
    });
  }

  async function detect() {
    setDetecting(true);
    setResult(null);
    try {
      const res = await detectProductMotifs(productId);
      setResult({ ok: res.ok, message: res.message });
      if (res.ok) setSelected(res.motifs);
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Detection failed.",
      });
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Themes</h2>
          <p className="mt-1 text-xs text-[var(--foreground)]/60">
            What is depicted on the case — not the licensed character. Hello
            Kitty is not Cat.
          </p>
        </div>
        {locked && (
          <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
            Locked
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1">
        {MOTIF_FAMILIES.map((family) => {
          const checked = selected.includes(family.slug);
          return (
            <label
              key={family.slug}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold transition",
                checked
                  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "hover:bg-[var(--muted)]",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => toggle(family.slug)}
              />
              <span className="truncate">{family.label}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save themes"}
        </button>
        <button
          type="button"
          onClick={detect}
          disabled={detecting || saving}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-50"
        >
          {detecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Detect
        </button>
      </div>

      {result && (
        <p
          className={cn(
            "mt-2 flex items-center justify-center gap-1 text-xs font-semibold",
            result.ok ? "text-green-600" : "text-red-500",
          )}
        >
          {result.ok && <Check className="h-3.5 w-3.5" />}
          {result.message}
        </p>
      )}
    </div>
  );
}
