"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, RefreshCw, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAX_REPLY_IMAGE_BYTES,
  MAX_REPLY_IMAGES,
  MAX_REPLY_IMAGE_TOTAL_BYTES,
} from "@/lib/inbox/reply-images";

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

export function ReplyComposer({
  recipient,
  subject,
  quotedText,
  onClose,
  onSent,
}: {
  recipient: string;
  subject: string;
  quotedText: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [replyBody, setReplyBody] = useState("");
  const [quoteOriginal, setQuoteOriginal] = useState(true);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "ok" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const photosRef = useRef<PendingPhoto[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  });

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;

    const room = MAX_REPLY_IMAGES - photos.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_REPLY_IMAGES} photos.`);
      return;
    }

    const next: PendingPhoto[] = [];
    let error: string | null = null;
    for (const file of picked.slice(0, room)) {
      try {
        const prepared = await prepareOutgoingPhoto(file);
        next.push({
          id: crypto.randomUUID(),
          file: prepared,
          previewUrl: URL.createObjectURL(prepared),
        });
      } catch (err) {
        error = err instanceof Error ? err.message : "Could not attach that photo.";
        break;
      }
    }
    if (picked.length > room && !error) {
      error = `You can attach up to ${MAX_REPLY_IMAGES} photos.`;
    }

    const total =
      photos.reduce((sum, photo) => sum + photo.file.size, 0) +
      next.reduce((sum, photo) => sum + photo.file.size, 0);
    if (total > MAX_REPLY_IMAGE_TOTAL_BYTES) {
      for (const photo of next) URL.revokeObjectURL(photo.previewUrl);
      setAttachError("Those photos are too large to send together.");
      return;
    }

    setPhotos((current) => [...current, ...next]);
    setAttachError(error);
  }

  async function handleSend() {
    if (!replyBody.trim() && photos.length === 0) return;
    setSending(true);
    setSendStatus("idle");
    setSendError(null);
    try {
      const form = new FormData();
      form.set("to", recipient);
      form.set("subject", subject);
      form.set("body", replyBody.trim());
      if (quoteOriginal && quotedText.trim()) {
        form.set("quotedText", quotedText);
      }
      for (const photo of photos) {
        form.append("images", photo.file, photo.file.name);
      }
      const res = await fetch("/api/admin/inbox/reply", {
        method: "POST",
        body: form,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        archived?: boolean;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      setSendStatus("ok");
      setReplyBody("");
      setPhotos((current) => {
        for (const photo of current) URL.revokeObjectURL(photo.previewUrl);
        return [];
      });
      if (payload.archived === false) {
        setSendError("Sent. A copy could not be saved in Sent.");
        return;
      }
      window.setTimeout(onSent, 900);
    } catch (err) {
      console.error(err);
      setSendStatus("error");
      setSendError(err instanceof Error ? err.message : "Failed — try again");
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(replyBody.trim() || photos.length > 0);

  return (
    <div className="border-t border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--foreground)]/60">
          Replying to <span className="text-[var(--foreground)]">{recipient}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--foreground)]/40 hover:text-[var(--foreground)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        value={replyBody}
        onChange={(e) => setReplyBody(e.target.value)}
        placeholder="Type your reply…"
        rows={5}
        disabled={sending}
        className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--foreground)]/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/30 disabled:opacity-60"
      />

      {photos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {photos.map((photo) => (
            <li key={photo.id} className="relative h-14 w-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt={photo.file.name}
                className="h-full w-full rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                aria-label={`Remove ${photo.file.name}`}
                disabled={sending}
                className="absolute -right-1 -top-1 rounded-full bg-[var(--foreground)] p-0.5 text-[var(--background)]"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {attachError && (
        <p className="mt-2 text-xs font-semibold text-red-500">{attachError}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]/60 transition hover:border-[var(--primary)] hover:text-[var(--primary)]">
            <ImagePlus className="h-3.5 w-3.5" />
            Photos
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
              multiple
              disabled={sending || photos.length >= MAX_REPLY_IMAGES}
              onChange={onPick}
              className="sr-only"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--foreground)]/50">
            <input
              type="checkbox"
              checked={quoteOriginal}
              onChange={(e) => setQuoteOriginal(e.target.checked)}
              className="rounded"
            />
            Quote original message
          </label>
        </div>

        <div className="flex items-center gap-2">
          {sendStatus === "ok" && !sendError && (
            <span className="text-xs font-semibold text-emerald-500">Sent</span>
          )}
          {sendError && (
            <span
              className={cn(
                "max-w-[240px] text-xs font-semibold",
                sendStatus === "ok" ? "text-amber-600" : "text-red-500",
              )}
            >
              {sendError}
            </span>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !canSend}
            className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--foreground)]/40">
        JPG, PNG, GIF, or WebP. Up to {MAX_REPLY_IMAGES} photos. Large photos are resized.
      </p>
    </div>
  );
}

async function prepareOutgoingPhoto(file: File): Promise<File> {
  const name = file.name || "photo";
  const type = file.type.toLowerCase();
  const looksGif = type === "image/gif" || /\.gif$/i.test(name);
  if (looksGif) {
    if (file.size > MAX_REPLY_IMAGE_BYTES) {
      throw new Error("That GIF is too large. Use a JPG, PNG, or WebP instead.");
    }
    return file;
  }

  const allowed =
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    /\.(jpe?g|png|webp)$/i.test(name);
  if (!allowed) {
    throw new Error("Use a JPG, PNG, GIF, or WebP photo.");
  }
  if (file.size <= 900_000) return file;

  const compressed = await compressPhoto(file);
  if (compressed.size > MAX_REPLY_IMAGE_BYTES) {
    throw new Error("That photo is still too large after resizing.");
  }
  return compressed;
}

async function compressPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("That photo is too large to attach from this browser.");
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Use a JPG, PNG, GIF, or WebP photo.");
  });
  try {
    let edge = 1600;
    let quality = 0.84;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare that photo.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= 900_000) break;
      edge = Math.round(edge * 0.75);
      quality = Math.max(0.55, quality - 0.1);
    }
    if (!blob) throw new Error("Could not prepare that photo.");
    const stem =
      (file.name || "photo")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .slice(0, 40) || "photo";
    return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
