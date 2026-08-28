"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Film,
  ImageOff,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { InstagramDesk } from "@/lib/social/meta-autopost";
import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_PROFILE_URL,
} from "@/lib/social/instagram-strategy";
import { markInstagramPostedInApp, writeInstagramCaption } from "./actions";

export function ManualInstagramPack({
  desk,
  captionReady,
}: {
  desk: InstagramDesk;
  captionReady: boolean;
}) {
  const router = useRouter();
  const [captionPending, startCaption] = useTransition();
  const [markPending, startMark] = useTransition();
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { slot, slotUsedToday, igPostedToday, igPostsPerDay, igPosts, remainingProducts, phase, bootstrapRemaining } =
    desk;

  function handleWriteCaption() {
    if (!slot) return;
    setMsg(null);
    startCaption(async () => {
      const res = await writeInstagramCaption(slot.productId);
      if (!res.ok || !res.caption) {
        setMsg({ ok: false, text: res.message });
        return;
      }
      setCaption(res.caption);
      setHashtags(res.hashtags ?? []);
      setMsg({ ok: true, text: res.message });
    });
  }

  async function handleCopy() {
    if (!caption.trim()) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg({ ok: false, text: "Could not copy. Select the caption and copy it yourself." });
    }
  }

  function handleMarkPosted() {
    if (!slot) return;
    setMsg(null);
    startMark(async () => {
      const res = await markInstagramPostedInApp({
        productId: slot.productId,
        mediaType: slot.plannedMediaType,
        caption,
        hashtags,
      });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  const isReel = slot?.plannedMediaType === "video";
  const mediaUrls = isReel
    ? slot?.videoUrl
      ? [slot.videoUrl]
      : []
    : (slot?.photoUrls ?? []);

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] text-white">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-black">Today&apos;s post pack</h3>
            <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
              No Meta app needed. Save the real catalog media, paste the caption
              in the Instagram app, then mark it posted so tomorrow advances.
            </p>
          </div>
        </div>
        <a
          href={INSTAGRAM_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold text-[var(--foreground)]/70 transition hover:border-[#E1306C] hover:text-[#E1306C]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open @{INSTAGRAM_HANDLE}
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[var(--border)] px-5 py-4 sm:grid-cols-4">
        <MiniStat
          label="IG slot today"
          value={`${igPostedToday}/${igPostsPerDay}`}
          accent
        />
        <MiniStat label="IG posts" value={String(igPosts)} />
        <MiniStat label="Listings left" value={remainingProducts.toLocaleString()} />
        <MiniStat
          label={phase === "bootstrap" ? "Grid bootstrap" : "Sustain"}
          value={
            phase === "bootstrap"
              ? `${igPosts}/${igPosts + bootstrapRemaining}`
              : "1/day"
          }
        />
      </div>

      {!slot ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--foreground)]/55">
          {remainingProducts === 0
            ? "Every listing already has an Instagram post in the ledger."
            : "No postable photos or video on the next listing."}
        </p>
      ) : (
        <>
          <div className="flex items-start gap-3 border-b border-[var(--border)] bg-[var(--muted)]/30 px-5 py-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
              {slot.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slot.coverUrl}
                  alt={slot.productTitle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--foreground)]/30">
                  <ImageOff className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#E1306C]">
                <ArrowRight className="h-3 w-3" />
                {slotUsedToday ? "Tomorrow" : "Post this"}
                {isReel ? " · Reel" : " · Carousel"}
              </div>
              <p className="truncate text-sm font-semibold">
                <a
                  href={`/products/${slot.productSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#E1306C] hover:underline"
                >
                  {slot.productTitle}
                </a>
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[var(--foreground)]/50">
                {slot.plannedReason}
              </p>
            </div>
          </div>

          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
              1. Save {isReel ? "the video" : "these photos"} — then upload in Instagram
            </p>
            {isReel && slot.videoUrl ? (
              <div className="space-y-2">
                <video
                  src={slot.videoUrl}
                  controls
                  className="max-h-64 w-full rounded-xl bg-black object-contain"
                />
                <a
                  href={slot.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold"
                >
                  <Film className="h-3.5 w-3.5" />
                  Open video
                </a>
              </div>
            ) : (
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {mediaUrls.map((url, i) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg bg-[var(--muted)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Photo ${i + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {mediaUrls.length > 0 && !isReel && (
              <p className="mt-2 text-[11px] text-[var(--foreground)]/45">
                Tap each photo to open the original. Upload in that order.
                <Download className="ml-1 inline h-3 w-3" />
              </p>
            )}
          </div>

          <div className="px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
              2. Caption — paste into Instagram (link in bio, no URL)
            </p>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              placeholder="Write caption, or generate one…"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[#E1306C]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleWriteCaption}
                disabled={captionPending || markPending || !captionReady}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#E1306C] to-[#F77737] px-4 text-xs font-bold text-white disabled:opacity-50"
                title={
                  captionReady
                    ? "Generate an on-brand caption"
                    : "Set OPENAI_API_KEY to generate captions"
                }
              >
                {captionPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Write caption
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!caption.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold disabled:opacity-50"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleMarkPosted}
                disabled={captionPending || markPending || slotUsedToday}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#E1306C]/30 bg-[#E1306C]/10 px-4 text-xs font-bold text-[#E1306C] disabled:opacity-50"
                title={
                  slotUsedToday
                    ? "Today's slot is already used"
                    : "Only after it is live on Instagram"
                }
              >
                {markPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                I posted this
              </button>
            </div>
            {!captionReady && (
              <p className="mt-2 text-[11px] text-[var(--foreground)]/45">
                OPENAI_API_KEY is not set — write the caption yourself, then mark
                posted.
              </p>
            )}
          </div>
        </>
      )}

      {msg && (
        <p
          className={
            "px-5 pb-4 text-xs font-semibold " +
            (msg.ok ? "text-emerald-600" : "text-red-500")
          }
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border px-3 py-2.5 " +
        (accent
          ? "border-[#E1306C]/20 bg-[#E1306C]/5"
          : "border-[var(--border)] bg-[var(--muted)]/40")
      }
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/50">
        {label}
      </div>
      <div className="mt-1 text-lg font-black tabular-nums">{value}</div>
    </div>
  );
}
