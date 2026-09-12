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
import {
  generateFashionStill,
  markInstagramPostedInApp,
  writeInstagramCaption,
} from "./actions";
import { InstagramFashionMix } from "./InstagramFashionMix";

export function ManualInstagramPack({
  desk,
  captionReady,
  imageReady,
}: {
  desk: InstagramDesk;
  captionReady: boolean;
  imageReady: boolean;
}) {
  const router = useRouter();
  const [captionPending, startCaption] = useTransition();
  const [markPending, startMark] = useTransition();
  const [fashionPending, startFashion] = useTransition();
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [fashionUrl, setFashionUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"caption" | "overlay" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const {
    slot,
    slotUsedToday,
    igPostedToday,
    igPostsPerDay,
    igPosts,
    remainingProducts,
    phase,
    bootstrapRemaining,
    mix,
  } = desk;

  const fashion = slot?.fashion;
  const isReel = fashion?.assetSource === "reel";
  const overlay = fashion?.overlay ?? "";
  const allowGenerate = Boolean(fashion?.allowGenerate);
  const listingClipUrl = !isReel ? (slot?.videoUrl ?? null) : null;

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

  function handleGenerateStill() {
    if (!slot) return;
    setMsg(null);
    startFashion(async () => {
      const res = await generateFashionStill(slot.productId);
      if (!res.ok || !res.imageUrl) {
        setMsg({ ok: false, text: res.message });
        return;
      }
      setFashionUrl(res.imageUrl);
      setMsg({ ok: true, text: res.message });
    });
  }

  async function handleCopy(which: "caption" | "overlay") {
    const text = which === "caption" ? caption : overlay;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setMsg({ ok: false, text: "Could not copy. Select the text and copy it yourself." });
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
        imageUrl: fashionUrl,
        preset: fashion?.preset,
      });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setFashionUrl(null);
        setCaption("");
        setHashtags([]);
        router.refresh();
      }
    });
  }

  const catalogUrls = isReel
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
            <h3 className="text-sm font-black">Today&apos;s fashion pack</h3>
            <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
              A look, not a listing photo. Generate the still (or save the
              Reel), paste the caption in Instagram, then mark it posted so
              tomorrow advances the mix.
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
        <MiniStat
          label="Today's pillar"
          value={fashion?.label ?? "—"}
        />
        <MiniStat
          label={phase === "bootstrap" ? "Grid bootstrap" : "Sustain"}
          value={
            phase === "bootstrap"
              ? `${igPosts}/${igPosts + bootstrapRemaining}`
              : "1/day"
          }
        />
      </div>

      <div className="grid gap-px border-b border-[var(--border)] bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="bg-[var(--card)] px-5 py-4">
          {!slot ? (
            <p className="py-6 text-center text-sm text-[var(--foreground)]/55">
              {remainingProducts === 0
                ? "Every listing already has an Instagram post in the ledger."
                : "No postable photos or video on the next listing."}
            </p>
          ) : (
            <div className="flex items-start gap-3">
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
                <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#E1306C]">
                  <ArrowRight className="h-3 w-3" />
                  {slotUsedToday ? "Tomorrow" : "Post this"}
                  {isReel ? " · Reel" : " · Feed still"}
                  {fashion ? ` · ${fashion.label}` : ""}
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
          )}
        </div>
        <div className="bg-[var(--card)] px-5 py-4">
          <InstagramFashionMix mix={mix} caption="Mix" />
        </div>
      </div>

      {slot && fashion && (
        <>
          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
              Art direction
            </p>
            <p className="text-sm font-semibold">{fashion.shoot}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
                Cover sticker
              </p>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold">
                {overlay}
              </span>
              <button
                type="button"
                onClick={() => void handleCopy("overlay")}
                disabled={!overlay}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-[11px] font-bold disabled:opacity-50"
              >
                {copied === "overlay" ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copied === "overlay" ? "Copied" : "Copy overlay"}
              </button>
            </div>
          </div>

          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
              1. {isReel ? "Save the Reel" : "Post the fashion still — not the listing clip"}
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
                <p className="text-[11px] text-[var(--foreground)]/45">
                  Detail-day Reel only. The clip has to read as jewelry, not a
                  listing. Cover sticker is the fashion layer.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {fashionUrl ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fashionUrl}
                      alt="Fashion still"
                      className="max-h-80 w-full rounded-xl bg-[var(--muted)] object-contain"
                    />
                    <a
                      href={fashionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Open still
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--foreground)]/55">
                    {allowGenerate
                      ? "Generate a product-hero still from this listing's real photos. The case should fill at least half the frame. Download it and upload it in Instagram."
                      : "Use a tight catalog crop for this detail day, or generate a macro still."}
                  </p>
                )}
                {allowGenerate && (
                  <button
                    type="button"
                    onClick={handleGenerateStill}
                    disabled={fashionPending || markPending || !imageReady}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#833AB4] to-[#E1306C] px-4 text-xs font-bold text-white disabled:opacity-50"
                    title={
                      imageReady
                        ? "Generate today's fashion still"
                        : "Set OPENAI_API_KEY to generate stills"
                    }
                  >
                    {fashionPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {fashionUrl ? "Regenerate still" : "Generate fashion still"}
                  </button>
                )}
                {allowGenerate && (
                  <p className="text-[11px] leading-snug text-[var(--foreground)]/45">
                    The case is the hero — large, sharp, matching the listing
                    photos below. Reject a still if the phone is a speck by
                    her cheek, the print is invented, or the face looks CGI.
                  </p>
                )}
                {!imageReady && allowGenerate && (
                  <p className="text-[11px] text-[var(--foreground)]/45">
                    OPENAI_API_KEY / KIE_API_KEY is not set — shoot the look
                    yourself, or use a catalog crop below.
                  </p>
                )}
                {listingClipUrl && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Park this listing clip — do not post it today
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-[var(--foreground)]/55">
                      Studio close-up of the SKU. Fine for Stories later or a
                      Detail day. On a Look day it makes the profile look like
                      a shop. A sticker will not save it.
                    </p>
                    <video
                      src={listingClipUrl}
                      controls
                      className="mt-2 max-h-40 w-full rounded-lg bg-black object-contain"
                    />
                  </div>
                )}
                {catalogUrls.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
                      Listing photos — the real SKU the still must copy
                    </p>
                    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {catalogUrls.map((url, i) => (
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
                  </div>
                )}
              </div>
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
              placeholder={fashion.captionSeed}
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
                    ? "Generate a fashion caption"
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
                onClick={() => void handleCopy("caption")}
                disabled={!caption.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold disabled:opacity-50"
              >
                {copied === "caption" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === "caption" ? "Copied" : "Copy"}
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
                OPENAI_API_KEY is not set — paste the overlay as a caption
                starter, then mark posted.
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
      <div className="mt-1 truncate text-lg font-black tabular-nums">{value}</div>
    </div>
  );
}
