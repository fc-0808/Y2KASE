"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Sparkles,
  TriangleAlert,
  Wand2,
  X,
} from "lucide-react";
import type { TitleIssue } from "@/lib/catalog/listing-title";
import {
  applyTitleProposal,
  regenerateListingTitle,
  updateProductTitle,
  type TitleProposal,
  type TitleProposalMode,
} from "./actions";

/** Mirrors the server-side bound so the counter turns red before you submit. */
const TITLE_MAX_LENGTH = 140;

/**
 * The listing title: what it says now, what is wrong with it, and two ways to
 * fix it.
 *
 * The title is the product's primary search surface — it is what the brand
 * classifier reads, what the storefront and the product feeds show, and what a
 * shopper matches against. It used to be an unlabelled string with an edit
 * pencil, which meant a title advertising an iPhone model the product does not
 * fit looked exactly like a correct one.
 *
 * So the panel leads with the audit. "Instant fix" is deterministic and free —
 * it keeps the existing wording and re-emits only the parts composed from data
 * (the character, the device coverage, the MagSafe suffix). "Rewrite with AI"
 * spends a vision call on a fresh description, and is only worth it when the
 * existing wording is not worth keeping. Neither writes until you accept.
 */
export function ListingTitleEditor({
  productId,
  title,
  issues,
}: {
  productId: number;
  title: string;
  issues: TitleIssue[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [proposing, setProposing] = useState<TitleProposalMode | null>(null);
  const [proposal, setProposal] = useState<TitleProposal | null>(null);
  const [proposalNote, setProposalNote] = useState<string | null>(null);

  const trimmed = value.replace(/\s+/g, " ").trim();
  const tooLong = trimmed.length > TITLE_MAX_LENGTH;
  const unchanged = trimmed === title;

  function reset() {
    setError(null);
    setNotice(null);
    setProposal(null);
    setProposalNote(null);
  }

  function cancel() {
    setValue(title);
    setEditing(false);
    setError(null);
  }

  function saveManualEdit() {
    setError(null);
    startSaving(async () => {
      const res = await updateProductTitle(productId, trimmed);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditing(false);
      setNotice(
        res.brandHint
          ? `${res.message} This title reads as ${res.brandHint} — check the brand below.`
          : res.message,
      );
      router.refresh();
    });
  }

  async function propose(mode: TitleProposalMode) {
    reset();
    setProposing(mode);
    try {
      const res = await regenerateListingTitle(productId, mode);
      setProposal(res.proposal);
      setProposalNote(res.message);
    } catch (err) {
      setProposalNote(
        err instanceof Error ? err.message : "Could not build a proposal.",
      );
    } finally {
      setProposing(null);
    }
  }

  function acceptProposal() {
    if (!proposal) return;
    startSaving(async () => {
      const res = await applyTitleProposal(
        productId,
        proposal.title,
        proposal.brand
          ? {
              brandId: proposal.brand.brandId,
              characterId: proposal.brand.characterId,
            }
          : null,
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
      reset();
      setNotice(res.message);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="mt-1">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          autoFocus
          className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        />
        <div className="mt-1 flex items-center justify-between">
          <span
            className={`text-[11px] font-semibold ${
              tooLong ? "text-red-500" : "text-[var(--foreground)]/40"
            }`}
          >
            {trimmed.length}/{TITLE_MAX_LENGTH}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={saveManualEdit}
              disabled={saving || tooLong || unchanged || trimmed.length === 0}
              className="flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-1 text-[11px] font-semibold text-red-500">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h1 className="mt-1 break-words text-lg font-black">{title}</h1>
        <button
          type="button"
          onClick={() => {
            setValue(title);
            reset();
            setEditing(true);
          }}
          aria-label="Edit title"
          className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--foreground)]/50 hover:bg-[var(--muted)] hover:text-[var(--primary)]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {issues.map((issue) => (
            <IssueLine key={issue.code} issue={issue} />
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <ProposeButton
          onClick={() => propose("repair")}
          busy={proposing === "repair"}
          disabled={proposing !== null || saving}
          icon={<Wand2 className="h-3 w-3" />}
          label="Instant fix"
          title="Rebuild the title from this product's brand, variants and MagSafe status. Free, no AI."
        />
        <ProposeButton
          onClick={() => propose("rewrite")}
          busy={proposing === "rewrite"}
          disabled={proposing !== null || saving}
          icon={<Sparkles className="h-3 w-3" />}
          label="Rewrite with AI"
          title="Re-read the product photos and write a fresh description."
        />
      </div>

      {proposalNote && !proposal && (
        <p className="mt-2 text-[11px] text-[var(--foreground)]/55">
          {proposalNote}
        </p>
      )}

      {proposal && (
        <div className="mt-2.5 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/[0.04] p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--foreground)]/40">
            Proposed · {proposal.source === "vision" ? "from photos" : "from product data"}
          </p>
          <p className="mt-1 break-words text-sm font-bold">{proposal.title}</p>

          {proposal.brand && (
            <p className="mt-1.5 text-[11px] font-semibold text-[var(--primary)]">
              Also reassigns this product to{" "}
              {proposal.brand.characterName ?? proposal.brand.brandName}.
            </p>
          )}

          {proposal.issuesAfter.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {proposal.issuesAfter.map((issue) => (
                <IssueLine key={issue.code} issue={issue} />
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-green-600">
              <Check className="h-3 w-3" /> Resolves every issue above.
            </p>
          )}

          {proposal.notes.length > 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--foreground)]/45">
              {proposal.notes.join(" · ")}
            </p>
          )}

          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={acceptProposal}
              disabled={saving}
              className="flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setValue(proposal.title);
                setProposal(null);
                setEditing(true);
              }}
              disabled={saving}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-50"
            >
              Edit first
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="rounded-full px-2.5 py-1 text-xs font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-[11px] font-semibold text-red-500">{error}</p>
      )}
      {notice && (
        <p className="mt-1.5 text-[11px] font-semibold text-green-600">
          {notice}
        </p>
      )}
    </div>
  );
}

function IssueLine({ issue }: { issue: TitleIssue }) {
  const error = issue.severity === "error";
  return (
    <li
      className={`flex items-start gap-1 text-[11px] font-semibold ${
        error ? "text-red-500" : "text-amber-600"
      }`}
    >
      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="font-normal">{issue.detail}</span>
    </li>
  );
}

function ProposeButton({
  onClick,
  busy,
  disabled,
  icon,
  label,
  title,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold hover:border-[var(--primary)] disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}
