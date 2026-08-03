"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import type { BrandOption } from "@/lib/catalog/brands";
import {
  reclassifyBrandFromVision,
  updateProductBrand,
  type BrandSuggestion,
} from "./actions";

/** The product's stored classification, already resolved against the registry. */
export type BrandState = {
  brandId: string | null;
  brandName: string | null;
  characterId: string | null;
  characterName: string | null;
  confidence: string | null;
  evidence: string[];
  /**
   * The raw stored value when it no longer resolves to a registry entry — an
   * older classifier wrote it, or the brand was retired. Shown so the operator
   * understands why the picker looks empty.
   */
  unresolved: string | null;
};

/**
 * The operator's control panel for correcting a product's brand and character.
 *
 * Three ways in, one way out: review the stored verdict, ask the vision model
 * for a fresh read of the photos, or pick from the registry by hand. Every path
 * commits through `updateProductBrand`, which validates against the registry and
 * reconciles collection membership, so the browse tree can't fall out of step
 * with the label.
 *
 * The selectable brands arrive as a prop from the page's server component. They
 * used to be a hand-maintained copy of the server registry living in this file,
 * which had already drifted — a character could be listed here that the server
 * would then reject on save.
 */
export function BrandReassignmentCard({
  productId,
  current,
  options,
  filedIn,
}: {
  productId: number;
  current: BrandState;
  options: BrandOption[];
  /** Collections this product currently sits in, in taxonomy order. */
  filedIn: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [brandId, setBrandId] = useState(current.brandId ?? "");
  const [characterId, setCharacterId] = useState(current.characterId ?? "");
  const [detecting, setDetecting] = useState(false);
  const [detectMessage, setDetectMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<BrandSuggestion | null>(null);
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const characters = useMemo(
    () => options.find((o) => o.id === brandId)?.characters ?? [],
    [options, brandId],
  );

  function startEditing() {
    setBrandId(current.brandId ?? "");
    setCharacterId(current.characterId ?? "");
    setResult(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSuggestion(null);
    setDetectMessage(null);
    setResult(null);
  }

  function selectBrand(nextBrandId: string) {
    setBrandId(nextBrandId);
    // A character only means something inside its own brand.
    setCharacterId("");
  }

  function applySuggestion() {
    if (!suggestion) return;
    setBrandId(suggestion.brandId);
    setCharacterId(suggestion.characterId ?? "");
    setSuggestion(null);
  }

  async function detect() {
    setDetecting(true);
    setSuggestion(null);
    setDetectMessage(null);
    try {
      const res = await reclassifyBrandFromVision(productId);
      setDetectMessage(res.message);
      setSuggestion(res.suggestion);
    } catch (err) {
      setDetectMessage(
        err instanceof Error ? err.message : "Detection failed.",
      );
    } finally {
      setDetecting(false);
    }
  }

  function save() {
    startSaving(async () => {
      const res = await updateProductBrand(
        productId,
        brandId || null,
        characterId || null,
      );
      setResult({ ok: res.ok, message: res.message });
      if (res.ok) {
        setEditing(false);
        setSuggestion(null);
        setDetectMessage(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">Brand &amp; character</h2>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="text-xs font-semibold text-[var(--primary)] hover:underline"
          >
            Reassign
          </button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {current.brandName ? (
              <>
                <Pill>{current.brandName}</Pill>
                {current.characterName && <Pill>{current.characterName}</Pill>}
              </>
            ) : (
              <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)]/50">
                No brand set
              </span>
            )}
          </div>
          {current.unresolved && (
            <p className="flex items-start gap-1 text-[11px] font-semibold text-amber-600">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              Stored as “{current.unresolved}”, which is no longer a known brand.
              Reassign it to keep this product in the browse tree.
            </p>
          )}
          {current.confidence && (
            <p className="text-[11px] text-[var(--foreground)]/45">
              Confidence: {current.confidence}
              {current.evidence.length > 0 &&
                ` · Evidence: ${current.evidence.join(", ")}`}
            </p>
          )}
          <FiledIn slugs={filedIn} />
          {result && <ResultLine result={result} />}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Brand">
            <select
              value={brandId}
              onChange={(e) => selectBrand(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="">— No brand —</option>
              {options.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          {characters.length > 0 && (
            <Field label="Character">
              <select
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              >
                <option value="">— Brand only —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[var(--foreground)]/55">
                Read the brand off the product photos.
              </p>
              <button
                type="button"
                onClick={detect}
                disabled={detecting}
                className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold hover:border-[var(--primary)] disabled:opacity-50"
              >
                {detecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Detect
              </button>
            </div>
            {detectMessage && (
              <p className="mt-1.5 text-[11px] text-[var(--foreground)]/60">
                {detectMessage}
              </p>
            )}
            {suggestion && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  <Pill small>{suggestion.brandName}</Pill>
                  {suggestion.characterName && (
                    <Pill small>{suggestion.characterName}</Pill>
                  )}
                  <span className="rounded-full bg-[var(--foreground)]/5 px-2 py-0.5 text-[11px] text-[var(--foreground)]/60">
                    {suggestion.source === "vision" ? "photos" : "title"} ·{" "}
                    {suggestion.confidence}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={applySuggestion}
                  className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
                >
                  Use this
                </button>
                {suggestion.evidence.length > 0 && (
                  <p className="w-full text-[11px] text-[var(--foreground)]/45">
                    Evidence: {suggestion.evidence.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>

          {result && <ResultLine result={result} />}
        </div>
      )}
    </div>
  );
}

/**
 * Brand and title writes re-file the product on the way through. Showing the
 * result closes the loop: if a reassignment didn't move the product where the
 * operator expected, they see it here rather than on the storefront.
 */
function FiledIn({ slugs }: { slugs: string[] }) {
  return (
    <div className="border-t border-[var(--border)] pt-2">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--foreground)]/40">
        Filed in
      </p>
      {slugs.length === 0 ? (
        <p className="text-[11px] text-[var(--foreground)]/45">
          No collections. Set a brand, or check that the taxonomy is seeded.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {slugs.map((slug) => (
            <Link
              key={slug}
              href={`/collections/${slug}`}
              target="_blank"
              className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
            >
              {slug}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[var(--foreground)]/40">
        {label}
      </label>
      {children}
    </div>
  );
}

function Pill({
  children,
  small = false,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <span
      className={`rounded-full bg-[var(--primary)]/10 font-semibold text-[var(--primary)] ${
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      {children}
    </span>
  );
}

function ResultLine({ result }: { result: { ok: boolean; message: string } }) {
  return (
    <p
      className={`flex items-start gap-1 text-xs font-semibold ${
        result.ok ? "text-green-600" : "text-red-500"
      }`}
    >
      {result.ok && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {result.message}
    </p>
  );
}
