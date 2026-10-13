/**
 * Build the RFC822 reply that SMTP sends and IMAP appends to Sent.
 * Server-only: MailComposer and Buffer.
 */

import { randomBytes } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import {
  composeReplyContent,
  MAX_REPLY_IMAGE_BYTES,
  MAX_REPLY_IMAGE_TOTAL_BYTES,
  MAX_REPLY_IMAGES,
  safeImageFilename,
  sniffReplyImage,
} from "@/lib/inbox/reply-images";

export type ReplyImage = {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  cid: string;
};

export function replySubject(subject: string): string {
  const clean = subject
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const base = clean || "(no subject)";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

export function isReplyRecipient(value: string): boolean {
  if (!value || value.length > 254 || /[\r\n\s]/.test(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number" &&
    (value as File).size > 0 &&
    typeof (value as File).name === "string"
  );
}

export async function readReplyImages(
  entries: FormDataEntryValue[],
): Promise<{ images: ReplyImage[] } | { error: string }> {
  const files = entries.filter(isUploadedFile);
  if (files.length > MAX_REPLY_IMAGES) {
    return { error: `You can attach up to ${MAX_REPLY_IMAGES} photos.` };
  }

  let total = 0;
  const images: ReplyImage[] = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index]!;
    if (file.size > MAX_REPLY_IMAGE_BYTES) {
      return { error: "Each photo must be under 1.5 MB." };
    }
    total += file.size;
    if (total > MAX_REPLY_IMAGE_TOTAL_BYTES) {
      return { error: "Those photos are too large to send together." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = sniffReplyImage(bytes);
    if (!mimeType) {
      return { error: "Only JPG, PNG, GIF, and WebP photos can be attached." };
    }
    images.push({
      filename: safeImageFilename(file.name, mimeType, index),
      mimeType,
      bytes: Buffer.from(bytes),
      cid: `y2kase-${index + 1}-${randomBytes(4).toString("hex")}@y2kase.com`,
    });
  }
  return { images };
}

export async function buildReplyRaw(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  quotedText?: string;
  images: ReplyImage[];
}): Promise<{ raw: Buffer; subject: string }> {
  const subject = replySubject(input.subject);
  const content = composeReplyContent({
    body: input.body,
    quotedText: input.quotedText,
    images: input.images.map((img) => ({
      cid: img.cid,
      filename: img.filename,
    })),
  });
  const composer = new MailComposer({
    from: input.from,
    to: input.to,
    subject,
    text: content.text,
    html: content.html,
    attachments: input.images.map((img) => ({
      filename: img.filename,
      content: img.bytes,
      contentType: img.mimeType,
      cid: img.cid,
    })),
  });
  const raw = await composer.compile().build();
  return { raw, subject };
}
