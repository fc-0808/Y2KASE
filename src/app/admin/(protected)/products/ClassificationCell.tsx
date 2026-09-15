"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { BrandOption } from "@/lib/catalog/brands";
import type { AdminCollectionOption } from "@/lib/collections";
import { ORIGINALS_SLUG } from "@/lib/catalog/collections-config";
import {
  isMotifFamilySlug,
  motifFamily,
  type MotifFamilySlug,
} from "@/lib/catalog/motifs";
import { MotifMark } from "@/components/catalog/MotifMark";
import type {
  ClassificationHealth,
  ClassificationState,
} from "@/lib/catalog/classification-health";
import {
  createBrand,
  setProductClassification,
  setProductCollection,
} from "./actions";

/**
 * A product's identity, shown and edited in place.
 *
 * The console used to list titles and nothing else, which meant the single most
 * consequential field on a product — who is on the case — was invisible until
 * you opened it. A Crayon Shin-chan case sitting in the Hello Kitty collection
 * looked exactly like a correct row. So the classification is rendered under
 * every title with a verdict attached, and the same row can fix it: the states
 * that need a human are the ones you can act on without navigating away.
 */
export function ClassificationCell({
  productId,
  health,
  brandOptions,
  collectionOptions,
  motifs = [],
}: {
  productId: number;
  health: ClassificationHealth;
  brandOptions: BrandOption[];
  collectionOptions: AdminCollectionOption[];
  motifs?: MotifFamilySlug[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ClassificationEditor
        productId={productId}
        health={health}
        brandOptions={brandOptions}
        collectionOptions={collectionOptions}
        onClose={() => setEditing(false)}
      />
    );
  }

  const tone = STATE_TONE[health.state];
  const label = health.characterName ?? health.brandName ?? health.storedRaw;
  const inOriginals = health.otherSlugs.includes(ORIGINALS_SLUG);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={health.detail}
        className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset transition ${tone.chip}`}
      >
        {tone.icon}
        <span className="truncate">{label ?? "No brand"}</span>
        {health.confirmed && <ShieldCheck className="h-3 w-3 shrink-0" />}
        <Pencil className="h-2.5 w-2.5 shrink-0 opacity-50" />
      </button>

      {health.brandSlugs.map((slug) => (
        <CollectionChip
          key={slug}
          slug={slug}
          unsupported={health.unsupportedSlugs.includes(slug)}
        />
      ))}
      {inOriginals && (
        <span
          title="No licensed character — shoppers browse this under Originals and Theme."
          className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20"
        >
          Originals
        </span>
      )}
      {motifs.filter(isMotifFamilySlug).map((slug) => {
        const family = motifFamily(slug);
        if (!family) return null;
        return (
          <span
            key={slug}
            title={`Theme: ${family.label}`}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--foreground)]/70 ring-1 ring-inset ring-black/5"
          >
            <MotifMark family={family} size="sm" className="bg-white/70" />
            {family.label}
          </span>
        );
      })}
      {health.brandSlugs.length === 0 &&
        health.state !== "unclassified" &&
        !inOriginals && (
        <span
          title="This product is in no brand collection, so it can't be browsed by character."
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20"
        >
          <TriangleAlert className="h-3 w-3" /> Not browsable
        </span>
      )}
    </div>
  );
}

/** Per-state colour and icon. Only the actionable states are loud. */
const STATE_TONE: Record<
  ClassificationState,
  { chip: string; icon: React.ReactNode }
> = {
  ok: {
    chip: "bg-green-50 text-green-700 ring-green-600/20 hover:bg-green-100",
    icon: <Check className="h-3 w-3 shrink-0" />,
  },
  unconfirmed: {
    chip: "bg-[var(--muted)] text-[var(--foreground)]/65 ring-black/5 hover:bg-[var(--muted)]/70",
    icon: <Sparkles className="h-3 w-3 shrink-0" />,
  },
  conflict: {
    chip: "bg-red-50 text-red-700 ring-red-600/20 hover:bg-red-100",
    icon: <TriangleAlert className="h-3 w-3 shrink-0" />,
  },
  misfiled: {
    chip: "bg-red-50 text-red-700 ring-red-600/20 hover:bg-red-100",
    icon: <TriangleAlert className="h-3 w-3 shrink-0" />,
  },
  supplier_name: {
    chip: "bg-orange-50 text-orange-700 ring-orange-600/20 hover:bg-orange-100",
    icon: <TriangleAlert className="h-3 w-3 shrink-0" />,
  },
  unknown_brand: {
    chip: "bg-amber-50 text-amber-700 ring-amber-600/20 hover:bg-amber-100",
    icon: <TriangleAlert className="h-3 w-3 shrink-0" />,
  },
  unclassified: {
    chip: "bg-[var(--muted)] text-[var(--foreground)]/45 ring-black/5 hover:bg-[var(--muted)]/70",
    icon: <TriangleAlert className="h-3 w-3 shrink-0" />,
  },
};

function CollectionChip({
  slug,
  unsupported,
}: {
  slug: string;
  unsupported: boolean;
}) {
  return (
    <span
      title={
        unsupported
          ? `Filed under ${slug}, but neither the brand field nor the title supports that.`
          : `Filed under ${slug}`
      }
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        unsupported
          ? "bg-red-50 text-red-600 line-through ring-red-600/20"
          : "bg-[var(--muted)] text-[var(--foreground)]/55 ring-black/5"
      }`}
    >
      {slug}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel option value: "the answer isn't in this list yet". */
const NEW_ENTRY = "__new__";

/**
 * Define a missing IP without leaving the row.
 *
 * The moment you discover a brand is missing is the moment you are looking at
 * the product that needs it — so the create form belongs here, and it hands the
 * new entry straight back to the dropdown that sent you.
 */
function InlineBrandCreator({
  kind,
  parentBrandId,
  parentBrandName,
  pending,
  onCancel,
  onCreated,
  onNote,
}: {
  kind: "brand" | "character";
  parentBrandId: string | null;
  parentBrandName: string;
  pending: boolean;
  onCancel: () => void;
  onCreated: (slug: string) => void;
  onNote: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [busy, startBusy] = useTransition();

  function submit() {
    if (!name.trim()) return;
    startBusy(async () => {
      const res = await createBrand({
        name,
        aliases,
        parentBrandId: kind === "character" ? parentBrandId : null,
      });
      onNote(res.message);
      if (res.ok) onCreated(res.slug);
    });
  }

  const disabled = pending || busy;

  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--foreground)]/55">
        {kind === "brand"
          ? "New brand"
          : `New character in ${parentBrandName || "this brand"}`}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder={kind === "brand" ? "Sumikko Gurashi" : "Shirokuma"}
          disabled={disabled}
          className="min-w-36 flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold outline-none focus:border-[var(--primary)] disabled:opacity-50"
        />
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="other spellings, comma separated"
          disabled={disabled}
          className="min-w-36 flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] outline-none focus:border-[var(--primary)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !name.trim()}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-full px-2 py-1 text-xs font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The registry entry a title's reading corresponds to, ready to apply. */
function findSuggestion(
  brandOptions: BrandOption[],
  titleReadsAs: string | null,
): { brandId: string; characterId: string; label: string } | null {
  if (!titleReadsAs) return null;
  for (const brand of brandOptions) {
    if (brand.name === titleReadsAs) {
      return { brandId: brand.id, characterId: "", label: brand.name };
    }
    const character = brand.characters.find((c) => c.name === titleReadsAs);
    if (character) {
      return {
        brandId: brand.id,
        characterId: character.id,
        label: character.name,
      };
    }
  }
  return null;
}

function ClassificationEditor({
  productId,
  health,
  brandOptions,
  collectionOptions,
  onClose,
}: {
  productId: number;
  health: ClassificationHealth;
  brandOptions: BrandOption[];
  collectionOptions: AdminCollectionOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [showCollections, setShowCollections] = useState(false);

  // Plain derivations, not memos: the registry is a dozen entries, and this
  // editor is mounted for exactly one row at a time and unmounted on close.
  const initialBrand = brandOptions.find((b) => b.name === health.brandName);
  const initialBrandId = initialBrand?.id ?? "";
  const initialCharacterId =
    initialBrand?.characters.find((c) => c.name === health.characterName)?.id ??
    "";

  const [brandId, setBrandId] = useState(initialBrandId);
  const [characterId, setCharacterId] = useState(initialCharacterId);
  const [retitle, setRetitle] = useState(true);
  const [creating, setCreating] = useState<"brand" | "character" | null>(null);

  const characters =
    brandOptions.find((b) => b.id === brandId)?.characters ?? [];

  // The title's own reading, offered as a one-click answer. In a catalogue
  // where the brand column is frequently a supplier name, the title is usually
  // the better evidence, and typing it again by hand is just friction.
  const suggestion = findSuggestion(brandOptions, health.titleReadsAs);

  // Confirming an unchanged classification is a real action, not a no-op: it
  // records that a human agreed with the classifier, which is what promotes the
  // IP into the title and lets filing act on it. Only clearing an already-empty
  // brand does nothing.
  const isNoop = !brandId && !initialBrandId;

  function save() {
    startTransition(async () => {
      const res = await setProductClassification(
        productId,
        brandId || null,
        characterId || null,
        retitle,
      );
      setNote(res.message);
      if (res.ok) {
        router.refresh();
        // Held open when a title was rewritten, so the operator can read what
        // it became before the row re-renders underneath them.
        if (!res.title) onClose();
      }
    });
  }

  function toggleCollection(collectionId: number, member: boolean) {
    startTransition(async () => {
      const res = await setProductCollection(productId, collectionId, member);
      setNote(res.message);
      if (res.ok) router.refresh();
    });
  }

  const memberSlugs = new Set([...health.brandSlugs, ...health.otherSlugs]);

  return (
    <div className="mt-2 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/[0.04] p-2.5">
      <p className="mb-2 text-[11px] text-[var(--foreground)]/60">
        {health.detail}
      </p>

      {suggestion && (
        <button
          type="button"
          onClick={() => {
            setBrandId(suggestion.brandId);
            setCharacterId(suggestion.characterId);
          }}
          className="mb-2 inline-flex items-center gap-1 rounded-full border border-[var(--primary)] px-2.5 py-1 text-[11px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10"
        >
          <Sparkles className="h-3 w-3" /> Use “{suggestion.label}” from the
          title
        </button>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={brandId}
          onChange={(e) => {
            if (e.target.value === NEW_ENTRY) {
              setCreating("brand");
              return;
            }
            setBrandId(e.target.value);
            setCharacterId("");
          }}
          disabled={pending}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs font-semibold outline-none focus:border-[var(--primary)] disabled:opacity-50"
        >
          <option value="">— No brand —</option>
          {brandOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          {/* The list is finite but the world is not: a Sumikko Gurashi case
              has to be classifiable the moment it arrives, not after a deploy. */}
          <option value={NEW_ENTRY}>+ New brand…</option>
        </select>

        {brandId && (
          <select
            value={characterId}
            onChange={(e) => {
              if (e.target.value === NEW_ENTRY) {
                setCreating("character");
                return;
              }
              setCharacterId(e.target.value);
            }}
            disabled={pending}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs font-semibold outline-none focus:border-[var(--primary)] disabled:opacity-50"
          >
            <option value="">— Brand only —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_ENTRY}>+ New character…</option>
          </select>
        )}

        <button
          type="button"
          onClick={save}
          disabled={pending || isNoop}
          title={
            isNoop
              ? "Pick a brand first."
              : retitle
                ? "Save the classification, then rewrite the title from the product photos with vision AI. Takes a few seconds."
                : "Save the classification and re-file the product, leaving the title alone."
          }
          className="inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : retitle ? (
            <Sparkles className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {pending && retitle
            ? "Reading photos…"
            : retitle
              ? "Confirm & retitle"
              : "Confirm"}
        </button>

        <label
          title="Uses vision AI on the product photos to write a distinctive descriptive title (IP + devices + MagSafe still come from your data). Turn off to keep a hand-written title."
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold hover:border-[var(--primary)]"
        >
          <input
            type="checkbox"
            checked={retitle}
            onChange={(e) => setRetitle(e.target.checked)}
            disabled={pending}
            className="h-3 w-3 accent-[var(--primary)]"
          />
          AI retitle
        </label>

        <button
          type="button"
          onClick={() => setShowCollections((v) => !v)}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-50"
        >
          Collections
          <ChevronDown
            className={`h-3 w-3 transition ${showCollections ? "rotate-180" : ""}`}
          />
        </button>

        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Close
        </button>
      </div>

      {creating && (
        <InlineBrandCreator
          kind={creating}
          parentBrandId={creating === "character" ? brandId : null}
          parentBrandName={
            brandOptions.find((b) => b.id === brandId)?.name ?? ""
          }
          pending={pending}
          onCancel={() => setCreating(null)}
          onCreated={(slug) => {
            // Select what was just made, so Confirm applies it immediately.
            if (creating === "brand") {
              setBrandId(slug);
              setCharacterId("");
            } else {
              setCharacterId(slug);
            }
            setCreating(null);
            router.refresh();
          }}
          onNote={setNote}
        />
      )}

      {showCollections && (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-1.5">
          {collectionOptions.map((option) => {
            const member = memberSlugs.has(option.slug);
            const unsupported = health.unsupportedSlugs.includes(option.slug);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleCollection(option.id, !member)}
                disabled={pending}
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-semibold hover:bg-[var(--muted)] disabled:opacity-50 ${
                  unsupported ? "text-red-600" : ""
                }`}
                style={{ paddingLeft: `${option.depth * 12 + 8}px` }}
              >
                <span
                  className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border ${
                    member
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--border)]"
                  }`}
                >
                  {member && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="truncate">{option.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-[var(--foreground)]/35">
                  {option.kind}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {note && (
        <p className="mt-1.5 text-[11px] font-semibold text-[var(--foreground)]/70">
          {note}
        </p>
      )}
    </div>
  );
}
