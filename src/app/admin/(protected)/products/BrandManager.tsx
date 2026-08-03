"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Loader2,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { BrandOption } from "@/lib/catalog/brands";
import {
  createBrand,
  deleteBrand,
  listBrandVocabulary,
  updateBrand,
} from "./actions";

/**
 * The brand vocabulary, editable.
 *
 * The set of IPs this catalogue could recognise used to be a hard-coded array,
 * so meeting a new one — a Sumikko Gurashi case — meant a code change and a
 * deploy before the product could even be classified. This is that list, with
 * the four operations it was missing.
 *
 * Entries from the code taxonomy are marked and cannot be deleted: a taxonomy
 * sync would recreate them, so offering the button would be a lie. They can
 * still be renamed and taught new spellings, which is the part that actually
 * goes stale.
 */
export function BrandManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Bumped after every successful write to re-run the load below. A counter
  // rather than an imperative refetch, so the effect stays the single place
  // that knows how to fill this panel.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const data = await listBrandVocabulary();
      if (cancelled) return;
      setBrands(data.brands);
      setCounts(data.counts);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  if (!open) return null;

  function run(work: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const res = await work();
      setNote(res.message);
      if (res.ok) {
        setReloadKey((k) => k + 1);
        // The rows behind the panel show classification too — a rename there is
        // stale the moment it succeeds here.
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-xl flex-col bg-[var(--background)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-xl font-black">Brands &amp; characters</h2>
            <p className="mt-0.5 text-xs text-[var(--foreground)]/60">
              The vocabulary products are classified into. Adding one here makes
              it selectable on every product and browsable on the storefront
              straight away.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <NewEntryForm
            brands={brands}
            pending={pending}
            onCreate={(input) => run(() => createBrand(input))}
          />

          {!loaded ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-[var(--foreground)]/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : (
            <ul className="mt-6 space-y-2">
              {brands.map((brand) => (
                <BrandRow
                  key={brand.id}
                  brand={brand}
                  counts={counts}
                  pending={pending}
                  onSave={(input) => run(() => updateBrand(input))}
                  onDelete={(slug, unfile) =>
                    run(() => deleteBrand(slug, unfile))
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {note && (
          <footer className="border-t border-[var(--border)] px-5 py-3 text-sm font-semibold">
            {note}
          </footer>
        )}
      </div>
    </div>
  );
}

function NewEntryForm({
  brands,
  pending,
  onCreate,
}: {
  brands: BrandOption[];
  pending: boolean;
  onCreate: (input: {
    name: string;
    aliases: string;
    parentBrandId: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [parent, setParent] = useState("");

  function submit() {
    if (!name.trim()) return;
    onCreate({ name, aliases, parentBrandId: parent || null });
    setName("");
    setAliases("");
  }

  return (
    <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary)]/[0.04] p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/60">
        Add a brand or character
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Sumikko Gurashi"
          disabled={pending}
          className="min-w-44 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-semibold outline-none focus:border-[var(--primary)] disabled:opacity-50"
        />
        <select
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          disabled={pending}
          title="Leave as a brand, or nest it as a character inside one"
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-semibold outline-none focus:border-[var(--primary)] disabled:opacity-50"
        >
          <option value="">Top-level brand</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              Character of {brand.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add
        </button>
      </div>
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder="Other spellings, comma separated — sumikkogurashi, sumiko"
        disabled={pending}
        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)] disabled:opacity-50"
      />
    </div>
  );
}

function BrandRow({
  brand,
  counts,
  pending,
  onSave,
  onDelete,
}: {
  brand: BrandOption;
  counts: Record<string, number>;
  pending: boolean;
  onSave: (input: { slug: string; name: string; aliases: string }) => void;
  onDelete: (slug: string, unfile: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-xl border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition ${expanded ? "rotate-90" : ""}`}
        />
        <span className="font-bold">{brand.name}</span>
        {brand.builtIn && (
          <Lock
            className="h-3 w-3 shrink-0 text-[var(--foreground)]/35"
            aria-label="Defined in code"
          />
        )}
        <span className="ml-auto shrink-0 text-xs text-[var(--foreground)]/45">
          {counts[brand.id] ?? 0} filed
          {brand.characters.length > 0 &&
            ` · ${brand.characters.length} character${brand.characters.length === 1 ? "" : "s"}`}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-[var(--border)] px-3 py-2">
          <EntryEditor
            slug={brand.id}
            name={brand.name}
            aliases={brand.aliases}
            builtIn={brand.builtIn}
            filed={counts[brand.id] ?? 0}
            pending={pending}
            onSave={onSave}
            onDelete={onDelete}
          />
          {brand.characters.map((character) => (
            <div key={character.id} className="border-l-2 border-[var(--border)] pl-3">
              <EntryEditor
                slug={character.id}
                name={character.name}
                aliases={[]}
                builtIn={brand.builtIn}
                filed={counts[character.id] ?? 0}
                pending={pending}
                onSave={onSave}
                onDelete={onDelete}
              />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function EntryEditor({
  slug,
  name,
  aliases,
  builtIn,
  filed,
  pending,
  onSave,
  onDelete,
}: {
  slug: string;
  name: string;
  aliases: string[];
  builtIn: boolean;
  filed: number;
  pending: boolean;
  onSave: (input: { slug: string; name: string; aliases: string }) => void;
  onDelete: (slug: string, unfile: boolean) => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftAliases, setDraftAliases] = useState(aliases.join(", "));
  const [confirming, setConfirming] = useState(false);

  const dirty = draftName !== name || draftAliases !== aliases.join(", ");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        disabled={pending}
        className="min-w-32 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm font-semibold outline-none focus:border-[var(--primary)] disabled:opacity-50"
      />
      <input
        value={draftAliases}
        onChange={(e) => setDraftAliases(e.target.value)}
        placeholder="other spellings"
        disabled={pending}
        className="min-w-40 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs outline-none focus:border-[var(--primary)] disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() =>
          onSave({ slug, name: draftName, aliases: draftAliases })
        }
        disabled={pending || !dirty}
        className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-bold hover:border-[var(--primary)] disabled:opacity-30"
      >
        Save
      </button>

      {builtIn ? (
        <span
          title="Defined in collections-config.ts. A taxonomy sync would recreate it, so it can be renamed but not deleted."
          className="grid h-7 w-7 place-items-center text-[var(--foreground)]/25"
        >
          <Lock className="h-3.5 w-3.5" />
        </span>
      ) : confirming ? (
        <button
          type="button"
          onClick={() => {
            onDelete(slug, true);
            setConfirming(false);
          }}
          disabled={pending}
          className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40"
        >
          {filed > 0 ? `Delete & unfile ${filed}` : "Confirm delete"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          title="Delete this entry"
          className="grid h-7 w-7 place-items-center rounded-full text-red-500 hover:bg-red-50 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
