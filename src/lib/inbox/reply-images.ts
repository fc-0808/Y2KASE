/**
 * Pure helpers for photos attached to an admin inbox reply.
 * Safe to import from the client — no Node or SMTP APIs.
 */

export const MAX_REPLY_IMAGES = 4;
/** Stay under the platform request-body limit once a few photos are combined. */
export const MAX_REPLY_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024);
export const MAX_REPLY_IMAGE_TOTAL_BYTES = 4 * 1024 * 1024;

export type ReplyImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

const EXT_FOR_MIME: Record<ReplyImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function sniffReplyImage(bytes: Uint8Array): ReplyImageMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function safeImageFilename(
  name: string,
  mimeType: ReplyImageMime,
  index: number,
): string {
  const ext = EXT_FOR_MIME[mimeType];
  const cleaned = name
    .replace(/[/\\]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 80);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return `photo-${index + 1}.${ext}`;
  }
  if (new RegExp(`\\.${ext}$`, "i").test(cleaned) || (ext === "jpg" && /\.jpeg$/i.test(cleaned))) {
    return cleaned;
  }
  const stem = cleaned.replace(/\.[^.]+$/, "") || `photo-${index + 1}`;
  return `${stem}.${ext}`;
}

export function composeReplyContent(input: {
  body: string;
  quotedText?: string;
  images: Array<{ cid: string; filename: string }>;
  sentOn?: Date;
}): { text: string; html: string } {
  const dateLabel = (input.sentOn ?? new Date()).toDateString();
  const body = input.body.replace(/\r\n/g, "\n").trim();
  const quote = input.quotedText?.replace(/\r\n/g, "\n").trim() ?? "";

  const textParts: string[] = [];
  if (body) textParts.push(body);
  if (input.images.length > 0) {
    textParts.push(
      input.images.map((img) => `[Image: ${img.filename}]`).join("\n"),
    );
  }
  let text = textParts.join("\n\n");
  if (quote) {
    const quoted = quote
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    text = `${text}\n\n---\nOn ${dateLabel}, you wrote:\n${quoted}`.trim();
  }
  text = `${text}\n\n— Y2KASE Team · https://y2kase.com`.trim();

  const paragraphs = body
    ? body
        .split("\n")
        .map(
          (line) =>
            `<p style="margin:0 0 8px">${escapeHtml(line) || "&nbsp;"}</p>`,
        )
        .join("")
    : "";
  const images = input.images
    .map(
      (img) =>
        `<p style="margin:12px 0 8px"><img src="cid:${escapeHtml(img.cid)}" alt="${escapeHtml(img.filename)}" style="max-width:100%;height:auto;border-radius:12px" /></p>`,
    )
    .join("");
  const quoteHtml = quote
    ? `<br/>
       <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
       <p style="color:#6b7280;font-size:12px">On ${escapeHtml(dateLabel)}, you wrote:</p>
       <blockquote style="border-left:3px solid #e5e7eb;margin:0;padding:0 0 0 12px;color:#6b7280;font-size:13px">
         ${quote
           .split("\n")
           .map(
             (line) =>
               `<p style="margin:0 0 4px">${escapeHtml(line) || "&nbsp;"}</p>`,
           )
           .join("")}
       </blockquote>`
    : "";

  const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px">${paragraphs}${images}${quoteHtml}<br/><p style="color:#6b7280;font-size:13px;border-top:1px solid #f3f4f6;padding-top:12px;margin-top:16px">— Y2KASE Team &middot; <a href="https://y2kase.com" style="color:#6366f1">y2kase.com</a></p></div>`;

  return { text, html };
}
