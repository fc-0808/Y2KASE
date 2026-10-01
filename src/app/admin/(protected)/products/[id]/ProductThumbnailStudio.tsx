"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  Crop,
  Eraser,
  ExternalLink,
  Flag,
  Globe,
  Loader2,
  SkipForward,
  Sparkles,
  Redo2,
  Undo2,
  Upload,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react";
import {
  actionsForThumbnailPhase,
  isNormalizedListingThumbnail,
  primaryThumbnailAction,
  thumbnailActionBlock,
  thumbnailStudioPhase,
  thumbnailStudioShowsProposal,
  type ThumbnailProposalView,
  type ThumbnailStudioAction,
  type ThumbnailStudioPhase,
} from "@/lib/admin/thumbnail-studio";
import {
  adjustThumbnailCrop,
  aiCleanupThumbnail,
  aiRemoveThumbnailArtifact,
  approveThumbnailProposal,
  decideThumbnailProposal,
  generateThumbnailProposal,
  redoThumbnail,
  removeThumbnailBackground,
  restorePreviousThumbnail,
} from "../actions";
import { ThumbnailCropModal } from "../thumbnails/ThumbnailCropModal";

const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

/** Image-model and upload work. Flag, skip, and approve are database writes. */
const SLOW_ACTIONS = new Set([
  "Generate",
  "Regenerate",
  "Remove hand",
  "Remove BG",
  "Remove Tag",
  "Adjust",
  "Upload",
]);

type ActionResult = { ok: boolean; message: string };

const PHASE_LABEL: Record<ThumbnailStudioPhase, string> = {
  pending: "Not started",
  review: "To review",
  flagged: "Needs attention",
  live: "Live",
  skipped: "Skipped",
  broken: "No preview",
};

const PHASE_TONE: Record<ThumbnailStudioPhase, string> = {
  pending: "bg-[var(--muted)] text-[var(--foreground)]/70",
  review: "bg-[var(--primary)]/10 text-[var(--primary)]",
  flagged: "bg-amber-100 text-amber-800",
  live: "bg-green-100 text-green-700",
  skipped: "bg-[var(--muted)] text-[var(--foreground)]/70",
  broken: "bg-amber-100 text-amber-800",
};

const PHASE_COPY: Record<ThumbnailStudioPhase, string> = {
  pending:
    "Nothing generated yet. Generate from this product’s photos, or upload an image. Approving a result places it first in the gallery.",
  review:
    "Compare the proposal with the photo shoppers see now. Approve to make the proposal the listing thumbnail.",
  flagged:
    "Generation didn’t produce a usable result. Remove the hand, upload a photo, or skip.",
  live:
    "Shoppers see this thumbnail. Regenerate, remove the background, or remove a tag — the new version goes to review before it replaces the live image.",
  skipped:
    "Left as-is, and the generated preview was discarded. Generate or upload to start a new review.",
  broken:
    "A proposal was saved without a preview. Generate again or upload a photo.",
};

function formatCategory(category: string): string {
  if (category === "manual") return "Manual upload";
  return category.replaceAll("_", " ");
}

function actionCopy(
  action: ThumbnailStudioAction,
  phase: ThumbnailStudioPhase,
  publishDrafts: boolean,
  draft: boolean,
): { label: string; hint: string } {
  switch (action) {
    case "generate":
      return {
        label: "Generate",
        hint: "Picks the cleanest photo and builds a white thumbnail. Plain shots are framed locally; hands and props use the image model.",
      };
    case "approve":
      return {
        label: publishDrafts && draft ? "Approve & publish" : "Approve",
        hint: draft
          ? publishDrafts
            ? "Approves the thumbnail and publishes this draft."
            : "Approves the thumbnail only. This draft stays unpublished."
          : "Approves the thumbnail and places it first in the gallery.",
      };
    case "regenerate":
      return {
        label: phase === "flagged" ? "Remove hand" : "Regenerate",
        hint:
          phase === "flagged"
            ? "Removes the hand or props and rebuilds the preview on white."
            : "Rebuilds the thumbnail with the image model. The result goes to review before it replaces the listing image.",
      };
    case "restorePrevious":
      return {
        label: "Previous",
        hint: "Restores the thumbnail this one replaced. Redo can bring this one back.",
      };
    case "redo":
      return {
        label: "Redo",
        hint: "Brings back the thumbnail you left when you chose Previous.",
      };
    case "removeBackground":
      return {
        label: "Remove BG",
        hint: "Cuts the product out of the current preview and re-centers it on white, without repainting it.",
      };
    case "removeTag":
      return {
        label: "Remove Tag",
        hint: "Clears the top-left tag artifact, then sends the result back to review.",
      };
    case "adjust":
      return {
        label: "Adjust",
        hint: "Crop the preview down to the case, then re-center it on white.",
      };
    case "flag":
      return {
        label: "Flag",
        hint: "Mark this preview as needing a better source photo.",
      };
    case "skip":
      return {
        label: "Skip",
        hint: "Leave the listing thumbnail as it is and discard the generated preview.",
      };
    case "upload":
      return {
        label: "Upload",
        hint: "Upload your own image (max 15 MB). It is normalized onto white and sent to review.",
      };
  }
}

function ActionIcon({ action }: { action: ThumbnailStudioAction }) {
  const className = "h-3.5 w-3.5";
  switch (action) {
    case "generate":
    case "removeTag":
      return <Sparkles className={className} />;
    case "approve":
      return <Check className={className} />;
    case "regenerate":
      return <Wand2 className={className} />;
    case "restorePrevious":
      return <Undo2 className={className} />;
    case "redo":
      return <Redo2 className={className} />;
    case "removeBackground":
      return <Eraser className={className} />;
    case "adjust":
      return <Crop className={className} />;
    case "flag":
      return <Flag className={className} />;
    case "skip":
      return <SkipForward className={className} />;
    case "upload":
      return <Upload className={className} />;
  }
}

export function ProductThumbnailStudio({
  productId,
  title,
  productStatus,
  currentUrl,
  currentFilename,
  proposal,
}: {
  productId: number;
  title: string;
  productStatus: string;
  currentUrl: string | null;
  currentFilename: string | null;
  proposal: ThumbnailProposalView | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [transitionPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [publishDrafts, setPublishDrafts] = useState(false);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [cropping, setCropping] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(
    null,
  );

  const phase = thumbnailStudioPhase(proposal);
  const proposalUrl = proposal?.proposalUrl ?? null;
  const history = {
    previous: proposal?.previousCount ?? 0,
    next: proposal?.nextCount ?? 0,
  };
  const draft = productStatus === "draft";
  const actions = actionsForThumbnailPhase(phase);
  const primary = primaryThumbnailAction(phase);
  const showsProposal = thumbnailStudioShowsProposal(
    phase,
    currentUrl,
    proposalUrl,
  );
  const normalized = isNormalizedListingThumbnail(currentFilename);
  const locked = busy || transitionPending;

  const lead = actions.filter(
    (action) =>
      action === primary || (phase === "review" && action === "regenerate"),
  );
  const rest = actions.filter((action) => !lead.includes(action));

  function flash(result: ActionResult) {
    setToast(result);
    if (result.ok) setTimeout(() => setToast(null), 3500);
  }

  function run(label: string, fn: () => Promise<ActionResult>) {
    setBusy(true);
    setActiveLabel(label);
    startTransition(async () => {
      try {
        const res = await fn();
        flash(
          res.ok && !res.message.trim()
            ? { ok: true, message: `${label} complete.` }
            : res,
        );
        await router.refresh();
      } catch (err) {
        flash({
          ok: false,
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      } finally {
        setBusy(false);
        setActiveLabel(null);
      }
    });
  }

  function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      flash({ ok: false, message: "Please choose an image file." });
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      flash({ ok: false, message: "Image is too large (max 15 MB)." });
      return;
    }
    setBusy(true);
    setActiveLabel("Upload");
    void (async () => {
      try {
        const body = new FormData();
        body.append("productId", String(productId));
        body.append("file", file);
        const res = await fetch("/api/admin/thumbnails/upload", {
          method: "POST",
          body,
        });
        const json = (await res.json().catch(() => null)) as ActionResult | null;
        flash(json ?? { ok: false, message: "Upload failed." });
        await router.refresh();
      } catch {
        flash({ ok: false, message: "Upload failed." });
      } finally {
        setBusy(false);
        setActiveLabel(null);
      }
    })();
  }

  function perform(action: ThumbnailStudioAction) {
    if (thumbnailActionBlock(action, currentUrl, proposalUrl, history)) return;
    switch (action) {
      case "generate":
        run("Generate", () => generateThumbnailProposal(productId));
        return;
      case "approve":
        run(
          publishDrafts && draft ? "Approve & publish" : "Approve",
          () => approveThumbnailProposal(productId, publishDrafts),
        );
        return;
      case "regenerate":
        run(phase === "flagged" ? "Remove hand" : "Regenerate", () =>
          aiCleanupThumbnail(productId),
        );
        return;
      case "restorePrevious":
        run("Previous", () => restorePreviousThumbnail(productId));
        return;
      case "redo":
        run("Redo", () => redoThumbnail(productId));
        return;
      case "removeBackground":
        run("Remove BG", () => removeThumbnailBackground(productId));
        return;
      case "removeTag":
        run("Remove Tag", () => aiRemoveThumbnailArtifact(productId));
        return;
      case "adjust":
        if (proposalUrl) setCropping(true);
        return;
      case "flag":
        run("Flag", () => decideThumbnailProposal(productId, "flagged"));
        return;
      case "skip":
        run("Skip", () => decideThumbnailProposal(productId, "skipped"));
        return;
      case "upload":
        fileRef.current?.click();
        return;
    }
  }

  const listingLabel = phase === "live" && !showsProposal ? "Live" : "Listing";
  const proposalLabel =
    phase === "flagged" ? "Flagged" : phase === "live" ? "Approved" : "Proposed";

  return (
    <section
      id="listing-thumbnail"
      aria-busy={locked}
      data-thumbnail-phase={phase}
      className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_10px_30px_-26px_rgba(120,60,120,0.5)] sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">Listing thumbnail</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PHASE_TONE[phase]}`}
            >
              {PHASE_LABEL[phase]}
            </span>
            {draft && (
              <span
                title="Draft — not on the storefront yet."
                className="rounded-full bg-[var(--foreground)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/55"
              >
                Draft
              </span>
            )}
          </div>
          <p className="mt-1 max-w-xl text-sm text-[var(--foreground)]/60">
            {PHASE_COPY[phase]}
          </p>
        </div>
        <Link
          href="/admin/products/thumbnails"
          className="shrink-0 text-xs font-semibold text-[var(--primary)] hover:underline"
        >
          Review queue
        </Link>
      </div>

      <div
        className={`mt-4 grid gap-3 ${showsProposal ? "sm:grid-cols-2" : "max-w-xs"}`}
      >
        <div>
          <PreviewFrame
            label={listingLabel}
            url={currentUrl}
            alt={`${title} listing thumbnail`}
            fit={
              normalized || phase === "live" ? "contain" : "cover"
            }
            badge={normalized ? "Normalized" : null}
            onOpen={
              currentUrl
                ? () =>
                    setViewer({
                      url: currentUrl,
                      title: `${title} — listing thumbnail`,
                    })
                : undefined
            }
          />
          <p className="mt-1.5 truncate text-[11px] font-medium text-[var(--foreground)]/45">
            {currentFilename ?? "No filename"}
            {normalized ? " · first in the gallery" : ""}
          </p>
        </div>
        {showsProposal && proposalUrl && (
          <div>
            <PreviewFrame
              label={proposalLabel}
              url={proposalUrl}
              alt={`${title} proposed thumbnail`}
              fit="contain"
              highlight
              onOpen={() =>
                setViewer({
                  url: proposalUrl,
                  title: `${title} — ${proposalLabel.toLowerCase()} thumbnail`,
                })
              }
            />
            <p className="mt-1.5 truncate text-[11px] font-medium text-[var(--foreground)]/45">
              {proposal?.score != null ? proposal.score.toFixed(2) : "Unscored"}
              {proposal?.category
                ? ` · ${formatCategory(proposal.category)}`
                : ""}
            </p>
          </div>
        )}
      </div>

      {proposal?.reason && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            phase === "flagged"
              ? "bg-amber-50 text-amber-950"
              : "bg-[var(--muted)] text-[var(--foreground)]/70"
          }`}
        >
          {proposal.reason}
        </p>
      )}

      {phase === "review" && draft && (
        <label
          className={`mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
            publishDrafts
              ? "border-[var(--primary)]/40 bg-[var(--primary)]/[0.06]"
              : "border-[var(--border)] bg-[var(--muted)]/50"
          } ${locked ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={publishDrafts}
            disabled={locked}
            onChange={(event) => setPublishDrafts(event.target.checked)}
          />
          <span className="min-w-0">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Globe className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
              Publish draft on approve
            </span>
            <span className="mt-0.5 block text-xs font-medium text-[var(--foreground)]/55">
              Off by default. When on, Approve also sets this listing live.
            </span>
          </span>
        </label>
      )}

      {phase === "review" && !draft && (
        <p className="mt-3 text-xs font-medium text-[var(--foreground)]/50">
          Approving replaces the listing thumbnail. This product stays published.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {lead.map((action) => (
            <ActionButton
              key={action}
              action={action}
              phase={phase}
              primary={action === primary}
              draft={draft}
              publishDrafts={publishDrafts}
              locked={locked}
              spinning={activeLabel === actionCopy(action, phase, publishDrafts, draft).label}
              block={thumbnailActionBlock(action, currentUrl, proposalUrl, history)}
              onPerform={perform}
            />
          ))}
        </div>
        {rest.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rest.map((action) => (
              <ActionButton
                key={action}
                action={action}
                phase={phase}
                primary={false}
                draft={draft}
                publishDrafts={publishDrafts}
                locked={locked}
                spinning={
                  activeLabel ===
                  actionCopy(action, phase, publishDrafts, draft).label
                }
                block={thumbnailActionBlock(action, currentUrl, proposalUrl, history)}
                onPerform={perform}
              />
            ))}
          </div>
        )}
      </div>

      {locked && activeLabel && (
        <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--primary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {activeLabel} in progress
          {SLOW_ACTIONS.has(activeLabel)
            ? " — this can take up to a minute."
            : "."}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.currentTarget.value = "";
        }}
      />

      {cropping && proposalUrl && (
        <ThumbnailCropModal
          url={proposalUrl}
          title={title}
          busy={locked}
          onCancel={() => setCropping(false)}
          onApply={(rect) => {
            setCropping(false);
            run("Adjust", () => adjustThumbnailCrop(productId, rect));
          }}
        />
      )}

      {viewer && (
        <ThumbnailLightbox
          url={viewer.url}
          title={viewer.title}
          onClose={() => setViewer(null)}
        />
      )}

      {toast && (
        <button
          type="button"
          onClick={() => setToast(null)}
          title="Dismiss"
          className={`fixed bottom-6 left-1/2 z-[80] flex max-w-[min(90vw,42rem)] -translate-x-1/2 items-center gap-2 rounded-2xl px-5 py-2.5 text-left text-sm font-bold text-white shadow-lg ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          <span>{toast.message}</span>
          <X className="h-4 w-4 shrink-0 opacity-70" />
        </button>
      )}
    </section>
  );
}

function ActionButton({
  action,
  phase,
  primary,
  draft,
  publishDrafts,
  locked,
  spinning,
  block,
  onPerform,
}: {
  action: ThumbnailStudioAction;
  phase: ThumbnailStudioPhase;
  primary: boolean;
  draft: boolean;
  publishDrafts: boolean;
  locked: boolean;
  spinning: boolean;
  block: string | null;
  onPerform: (action: ThumbnailStudioAction) => void;
}) {
  const copy = actionCopy(action, phase, publishDrafts, draft);
  const tone = primary
    ? "primary"
    : action === "flag"
      ? "amber"
      : action === "skip" || action === "upload"
        ? "ghost"
        : "accent";
  return (
    <StudioButton
      tone={tone}
      disabled={locked || Boolean(block)}
      title={block ?? copy.hint}
      onClick={() => onPerform(action)}
    >
      {spinning ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ActionIcon action={action} />
      )}
      {copy.label}
    </StudioButton>
  );
}

function StudioButton({
  children,
  onClick,
  disabled,
  tone,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone: "primary" | "accent" | "amber" | "ghost";
  title: string;
}) {
  const tones = {
    primary: "bg-[var(--primary)] text-white hover:brightness-105",
    accent:
      "border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/5",
    amber: "border border-amber-300 text-amber-700 hover:bg-amber-50",
    ghost:
      "border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function PreviewFrame({
  label,
  url,
  alt,
  fit,
  highlight,
  badge,
  onOpen,
}: {
  label: string;
  url: string | null;
  alt: string;
  fit: "cover" | "contain";
  highlight?: boolean;
  badge?: string | null;
  onOpen?: () => void;
}) {
  const frame = (
    <>
      <div className="relative h-64 w-full bg-[var(--product-surface)] sm:h-80">
        {url ? (
          <Image
            src={url}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 45vw, 320px"
            className={fit === "contain" ? "object-contain" : "object-cover"}
          />
        ) : (
          <div className="grid h-full place-items-center px-4 text-center text-sm font-semibold text-[var(--foreground)]/40">
            No photo yet
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
            highlight ? "bg-[var(--primary)]" : "bg-black/55"
          }`}
        >
          {label}
        </span>
        {badge && (
          <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/70">
            {badge}
          </span>
        )}
        {url && (
          <span className="pointer-events-none absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIn className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </>
  );

  if (!url || !onOpen) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        {frame}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${label.toLowerCase()} thumbnail`}
      className="group block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-[var(--border)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      {frame}
    </button>
  );
}

function ThumbnailLightbox({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] max-w-[min(92vw,48rem)] flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 text-white">
          <p className="line-clamp-1 text-sm font-bold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/10"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* The crop tool uses a plain img so the browser reports natural layout size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={title}
          className="max-h-[78vh] w-auto max-w-full rounded-xl bg-white object-contain"
        />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 self-end text-xs font-semibold text-white/80 hover:text-white"
        >
          Open full size
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
