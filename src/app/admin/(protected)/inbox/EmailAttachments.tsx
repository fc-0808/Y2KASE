"use client";

import { useRef, useState } from "react";
import {
  Download,
  FileText,
  ImageOff,
  Paperclip,
  X,
} from "lucide-react";
import {
  formatAttachmentSize,
  inboxAttachmentUrl,
  type InboxAttachment,
} from "@/lib/inbox/attachments";
import {
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/lib/hooks/use-modal-dialog";
import { cn } from "@/lib/utils";

export function EmailAttachments({
  uid,
  attachments,
}: {
  uid: number;
  attachments: InboxAttachment[];
}) {
  const listed = attachments.filter((att) => att.listed);
  const [preview, setPreview] = useState<InboxAttachment | null>(null);

  if (listed.length === 0) return null;

  const images = listed.filter((att) => att.isImage);
  const files = listed.filter((att) => !att.isImage);

  return (
    <section className="mt-4 border-t border-[var(--border)] pt-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
        <Paperclip className="h-3.5 w-3.5" />
        {listed.length === 1
          ? "1 attachment"
          : `${listed.length} attachments`}
      </h3>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((att) => (
            <li key={att.id}>
              <button
                type="button"
                onClick={() => setPreview(att)}
                className="group w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)] text-left transition hover:border-[var(--primary)]"
              >
                <span className="relative block aspect-square overflow-hidden bg-white">
                  <GalleryImage uid={uid} attachment={att} />
                </span>
                <span className="block truncate px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)]/70">
                  {att.filename}
                  <span className="ml-1 font-medium opacity-60">
                    {formatAttachmentSize(att.size)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className={cn("flex flex-col gap-2", images.length > 0 && "mt-3")}>
          {files.map((att) => (
            <li key={att.id}>
              <a
                href={inboxAttachmentUrl(uid, att.id, { download: true })}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:border-[var(--primary)]"
              >
                <FileText className="h-4 w-4 shrink-0 text-[var(--foreground)]/45" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {att.filename}
                </span>
                <span className="shrink-0 text-xs text-[var(--foreground)]/40">
                  {formatAttachmentSize(att.size)}
                </span>
                <Download className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]/40" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <AttachmentLightbox
          uid={uid}
          attachment={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}

function GalleryImage({
  uid,
  attachment,
}: {
  uid: number;
  attachment: InboxAttachment;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--foreground)]/40">
        <ImageOff className="h-6 w-6" />
        <span className="px-2 text-center text-[10px] font-semibold">
          Preview unavailable
        </span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={inboxAttachmentUrl(uid, attachment.id)}
      alt={attachment.filename}
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function AttachmentLightbox({
  uid,
  attachment,
  onClose,
}: {
  uid: number;
  attachment: InboxAttachment;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(true);
  useModalFocusTrap(dialogRef, true, onClose, attachment.id);

  const src = inboxAttachmentUrl(uid, attachment.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={attachment.filename}
        tabIndex={-1}
        className="relative max-h-[90dvh] max-w-4xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={attachment.filename}
          className="max-h-[80dvh] max-w-full rounded-xl object-contain"
        />
        <div className="mt-3 flex items-center justify-between gap-3 text-white">
          <p className="min-w-0 truncate text-sm font-semibold">
            {attachment.filename}
            <span className="ml-2 font-medium opacity-70">
              {formatAttachmentSize(attachment.size)}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={inboxAttachmentUrl(uid, attachment.id, { download: true })}
              className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full bg-white/15 p-1.5 hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
