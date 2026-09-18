/**
 * Email attachment plumbing for the admin inbox.
 *
 * PostalMime already extracts MIME parts. The inbox used to throw that work
 * away and ship only html/text, so `cid:` photos (Gmail/iOS inline images)
 * and paperclip attachments rendered as the browser's broken-image icon.
 *
 * This module is the pure half of the fix:
 *   1. Stable, injectable attachment ids (`a0`, `a1`, …).
 *   2. Rewrite `cid:` / mail-proxy / relative `<img>` srcs to an authenticated
 *      same-origin URL.
 *   3. Decide what belongs in the attachment strip vs. already in the body.
 *
 * No Node APIs — the client reuses the URL / srcDoc helpers.
 */

export const INBOX_ATTACHMENT_PATH = "/api/admin/inbox/attachment";
export const INBOX_ATTACHMENT_ID_RE = /^a[0-9]{1,2}$/;
export const MAX_INBOX_ATTACHMENTS = 40;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type InboxAttachmentDisposition = "inline" | "attachment" | null;

export type InboxAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  disposition: InboxAttachmentDisposition;
  related: boolean;
  /** True when this part was wired into the HTML body. */
  inlined: boolean;
  isImage: boolean;
  /** Show in the attachment strip (not already visible in the body). */
  listed: boolean;
};

export type PostalAttachmentLike = {
  filename: string | null;
  mimeType: string;
  disposition: InboxAttachmentDisposition;
  related?: boolean;
  contentId?: string;
  content: ArrayBuffer | Uint8Array | string;
  encoding?: "base64" | "utf8";
};

export type InboxBinaryPart = {
  id: string;
  filename: string;
  mimeType: string;
  isImage: boolean;
  bytes: Uint8Array;
};

export type PreparedInboxBody = {
  html: string | null;
  text: string;
  attachments: InboxAttachment[];
  binaries: InboxBinaryPart[];
};

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const EXT_MIME: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  ico: "image/x-icon",
  jfif: "image/jpeg",
  jpe: "image/jpeg",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

const NOISE_MIME = [
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
  "application/pkcs7-mime",
  "application/x-pkcs7-mime",
  "application/pgp-signature",
  "application/pgp-keys",
];

const UNRELIABLE_IMAGE_HOSTS = [
  /(?:^|\.)googleusercontent\.com$/i,
  /(?:^|\.)mail\.google\.com$/i,
  /(?:^|\.)attachment\.outlook\.live\.net$/i,
  /(?:^|\.)outlook\.office(?:365)?\.com$/i,
  /(?:^|\.)protection\.outlook\.com$/i,
  /(?:^|\.)mail\.yahoo\.com$/i,
  /(?:^|\.)yimg\.com$/i,
];

function attrCidRe(): RegExp {
  return /((?:src|href|background)\s*=\s*)(["'])cid:([^"']+)\2/gi;
}
function unquotedSrcCidRe(): RegExp {
  return /(\ssrc\s*=\s*)cid:([^\s>]+)/gi;
}
function cssCidRe(): RegExp {
  return /url\(\s*(['"]?)cid:([^)'"]+)\1\s*\)/gi;
}
function imgTagRe(): RegExp {
  return /<img\b[^>]*>/gi;
}
function attachUrlRe(): RegExp {
  return /\/api\/admin\/inbox\/attachment\?uid=(\d+)&(amp;)?id=(a\d+)/g;
}

export function attachmentId(index: number): string {
  return `a${index}`;
}

export function parseInboxUid(raw: string | null | undefined): number | null {
  if (!raw) return null;
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const uid = Number(raw);
  if (!Number.isInteger(uid) || uid < 1) return null;
  return uid;
}

export function parseAttachmentId(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  return INBOX_ATTACHMENT_ID_RE.test(raw) ? raw : null;
}

export function inboxAttachmentUrl(
  uid: number,
  id: string,
  opts: { download?: boolean; html?: boolean } = {},
): string {
  const params = new URLSearchParams({ uid: String(uid), id });
  if (opts.download) params.set("download", "1");
  const url = `${INBOX_ATTACHMENT_PATH}?${params.toString()}`;
  return opts.html ? escapeHtmlAttr(url) : url;
}

export function escapeHtmlAttr(value: string): string {
  return value.replaceAll("&", "&amp;");
}

export function normalizeMimeType(raw: string, filename?: string | null): string {
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  let mime = base;
  if (mime === "image/jpg" || mime === "image/pjpeg") mime = "image/jpeg";
  if (mime === "image/x-png") mime = "image/png";
  if (mime === "image/x-ms-bmp") mime = "image/bmp";
  if (!mime || mime === "application/octet-stream") {
    const fromName = mimeFromFilename(filename ?? "");
    if (fromName) return fromName;
  }
  return mime || "application/octet-stream";
}

export function mimeFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || ext === filename.toLowerCase()) return null;
  return EXT_MIME[ext] ?? null;
}

export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME.has(normalizeMimeType(mimeType));
}

export function isNoiseAttachment(
  mimeType: string,
  filename: string | null,
): boolean {
  const mime = normalizeMimeType(mimeType, filename);
  if (NOISE_MIME.includes(mime) || mime.includes("signature")) return true;
  const name = (filename ?? "").toLowerCase();
  return (
    name.endsWith(".p7s") ||
    name === "smime.p7s" ||
    name === "signature.asc"
  );
}

export function fallbackFilename(
  index: number,
  mimeType: string,
  filename: string | null,
): string {
  const trimmed = filename?.trim();
  if (trimmed) return trimmed.replace(/[/\\]/g, "_");
  const mime = normalizeMimeType(mimeType);
  const ext =
    Object.entries(EXT_MIME).find(([, type]) => type === mime)?.[0] ?? "bin";
  const kind = mime.startsWith("image/") ? "image" : "attachment";
  return `${kind}-${index + 1}.${ext}`;
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function contentDispositionHeader(
  filename: string,
  mode: "inline" | "attachment",
): string {
  const fallback =
    filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;\r\n]/g, "_") ||
    "attachment";
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function normalizeCid(value: string): string {
  return value
    .trim()
    .replace(/^cid:/i, "")
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
}

export function cidLookupKeys(contentId: string): string[] {
  const normalized = normalizeCid(contentId);
  if (!normalized) return [];
  const keys = new Set<string>([normalized]);
  const at = normalized.indexOf("@");
  if (at > 0) keys.add(normalized.slice(0, at));
  return [...keys];
}

export function isUnreliableInlineImageSrc(src: string): boolean {
  const value = src.trim().replaceAll("&amp;", "&");
  if (!value) return true;
  if (value.startsWith(INBOX_ATTACHMENT_PATH)) return false;
  if (value.startsWith("data:")) return false;
  if (/^cid:/i.test(value)) return true;
  if (/^(file|blob|about|moz-extension|chrome):/i.test(value)) return true;
  try {
    const url = new URL(value, "https://y2kase.invalid/");
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;
    if (url.hostname === "y2kase.invalid") return true;
    return UNRELIABLE_IMAGE_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return true;
  }
}

export function isProbablyTrackingPixel(tag: string): boolean {
  const width = /\bwidth\s*=\s*["']?1["']?/i.test(tag) || /width:\s*1px/i.test(tag);
  const height =
    /\bheight\s*=\s*["']?1["']?/i.test(tag) || /height:\s*1px/i.test(tag);
  return width && height;
}

export function collectInboxAttachmentUrls(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(attachUrlRe())) {
    found.add(inboxAttachmentUrl(Number(match[1]), match[3]));
  }
  return [...found];
}

export function htmlContainsInboxAttachments(html: string): boolean {
  return collectInboxAttachmentUrls(html).length > 0;
}

export function buildEmailSrcDoc(html: string): string {
  const css =
    "img,video,svg{max-width:100%;height:auto;}img{border-radius:8px;}";
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(
        /<head([^>]*)>/i,
        `<head$1><style>${css}</style>`,
      );
    }
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1><head><style>${css}</style></head>`,
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>body{font-family:sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;word-break:break-word;margin:0;padding:16px;}${css}</style></head><body>${html}</body></html>`;
}

export function bytesFromPostalContent(
  content: ArrayBuffer | Uint8Array | string,
  encoding?: "base64" | "utf8",
): Uint8Array {
  if (typeof content === "string") {
    if (encoding === "utf8") return new TextEncoder().encode(content);
    return decodeBase64(content);
  }
  return new Uint8Array(
    content instanceof Uint8Array ? content : new Uint8Array(content),
  );
}

export function prepareInboxBody(
  parsed: {
    html?: string | null;
    text?: string | null;
    attachments?: PostalAttachmentLike[];
  },
  uid: number,
): PreparedInboxBody {
  const text = parsed.text ?? "";
  const rawParts = (parsed.attachments ?? []).slice(0, MAX_INBOX_ATTACHMENTS);

  const binaries: InboxBinaryPart[] = [];
  const attachments: InboxAttachment[] = [];

  rawParts.forEach((part, index) => {
    if (isNoiseAttachment(part.mimeType, part.filename)) return;
    const bytes = bytesFromPostalContent(part.content, part.encoding);
    if (bytes.byteLength === 0) return;
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return;

    const id = attachmentId(attachments.length);
    const mimeType = normalizeMimeType(part.mimeType, part.filename);
    const filename = fallbackFilename(index, mimeType, part.filename);
    const isImage = isImageMime(mimeType);
    const disposition = part.disposition ?? null;

    attachments.push({
      id,
      filename,
      mimeType,
      size: bytes.byteLength,
      contentId: part.contentId ? normalizeCid(part.contentId) : null,
      disposition,
      related: part.related === true,
      inlined: false,
      isImage,
      listed: true,
    });
    binaries.push({ id, filename, mimeType, isImage, bytes });
  });

  const originalHtml = parsed.html?.trim() ? parsed.html : null;
  if (!originalHtml) {
    return { html: null, text, attachments, binaries };
  }

  const inlinedIds = new Set<string>();
  const byCid = new Map<string, string>();
  for (const att of attachments) {
    if (!att.contentId) continue;
    for (const key of cidLookupKeys(att.contentId)) {
      if (!byCid.has(key)) byCid.set(key, att.id);
    }
  }

  let html = rewriteCidReferences(originalHtml, (cid) => {
    for (const key of cidLookupKeys(cid)) {
      const id = byCid.get(key);
      if (!id) continue;
      inlinedIds.add(id);
      return inboxAttachmentUrl(uid, id, { html: true });
    }
    return null;
  });

  const unusedImageIds = () =>
    attachments.filter((att) => att.isImage && !inlinedIds.has(att.id)).map((att) => att.id);

  let leftover = 0;
  const leftoverIds = unusedImageIds();
  html = rewriteCidReferences(html, () => {
    const id = leftoverIds[leftover++];
    if (!id) return null;
    inlinedIds.add(id);
    return inboxAttachmentUrl(uid, id, { html: true });
  });

  let unbound = 0;
  const unboundIds = unusedImageIds();
  html = html.replace(imgTagRe(), (tag) => {
    if (isProbablyTrackingPixel(tag)) return tag;
    const src = readImgSrc(tag);
    if (src === null) return tag;
    if (!isUnreliableInlineImageSrc(src)) return tag;
    const id = unboundIds[unbound++];
    if (!id) return tag;
    inlinedIds.add(id);
    const url = inboxAttachmentUrl(uid, id, { html: true });
    return replaceImgSrc(tag, url);
  });

  for (const att of attachments) {
    att.inlined = inlinedIds.has(att.id);
    att.listed = !att.inlined;
  }

  return { html, text, attachments, binaries };
}

export function rewriteCidReferences(
  html: string,
  resolve: (cid: string) => string | null,
): string {
  let out = html.replace(attrCidRe(), (full, prefix: string, quote: string, cid: string) => {
    const url = resolve(cid);
    return url ? `${prefix}${quote}${url}${quote}` : full;
  });
  out = out.replace(unquotedSrcCidRe(), (full, prefix: string, cid: string) => {
    const url = resolve(cid);
    return url ? `${prefix}"${url}"` : full;
  });
  out = out.replace(cssCidRe(), (full, quote: string, cid: string) => {
    const url = resolve(cid);
    if (!url) return full;
    const q = quote || '"';
    return `url(${q}${url}${q})`;
  });
  return out;
}

function readImgSrc(tag: string): string | null {
  const quoted = /\bsrc\s*=\s*(["'])([^"']*)\1/i.exec(tag);
  if (quoted) return quoted[2];
  const unquoted = /\bsrc\s*=\s*([^\s>]+)/i.exec(tag);
  return unquoted ? unquoted[1] : null;
}

function replaceImgSrc(tag: string, url: string): string {
  const quote = matchQuote(tag);
  if (/\bsrc\s*=\s*["']/i.test(tag)) {
    return tag.replace(/\bsrc\s*=\s*(["'])[^"']*\1/i, `src=${quote}${url}${quote}`);
  }
  if (/\bsrc\s*=/i.test(tag)) {
    return tag.replace(/\bsrc\s*=\s*[^\s>]+/i, `src="${url}"`);
  }
  return tag.replace(/<img\b/i, `<img src="${url}"`);
}

function matchQuote(tag: string): string {
  const quoted = /\bsrc\s*=\s*(["'])/i.exec(tag);
  return quoted?.[1] ?? '"';
}

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value.replace(/\s+/g, ""));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}
