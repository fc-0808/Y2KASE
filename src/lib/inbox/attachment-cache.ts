/**
 * Process-local cache of decoded inbox attachments.
 *
 * Opening a message fetches the raw RFC822 once. Inline images then hit
 * `/api/admin/inbox/attachment` — without this cache each <img> would open a
 * new IMAP connection. On serverless the cache is best-effort (one isolate);
 * a miss just re-parses the message.
 *
 * Keys include the mailbox. INBOX and Sent reuse UID numbers, so a uid-only
 * key would serve the wrong photo.
 */

import type { InboxBinaryPart, InboxMailbox } from "@/lib/inbox/attachments";

const MAX_MESSAGES = 24;
const MAX_BYTES = 48 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;

export type CachedInboxMessage = {
  mailbox: InboxMailbox;
  uid: number;
  storedAt: number;
  bytes: number;
  parts: Map<string, InboxBinaryPart>;
};

const cache = new Map<string, CachedInboxMessage>();
const inflight = new Map<string, Promise<CachedInboxMessage | null>>();

function cacheKey(mailbox: InboxMailbox, uid: number): string {
  return `${mailbox}:${uid}`;
}

export function rememberInboxAttachments(
  uid: number,
  parts: InboxBinaryPart[],
  mailbox: InboxMailbox,
): void {
  const key = cacheKey(mailbox, uid);
  const map = new Map<string, InboxBinaryPart>();
  let bytes = 0;
  for (const part of parts) {
    map.set(part.id, part);
    bytes += part.bytes.byteLength;
  }
  cache.delete(key);
  cache.set(key, { mailbox, uid, storedAt: Date.now(), bytes, parts: map });
  evict();
}

export function getInboxAttachment(
  uid: number,
  id: string,
  mailbox: InboxMailbox,
): InboxBinaryPart | null {
  const key = cacheKey(mailbox, uid);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  const part = entry.parts.get(id);
  if (!part) return null;
  cache.delete(key);
  cache.set(key, entry);
  return part;
}

export async function loadInboxAttachments(
  uid: number,
  mailbox: InboxMailbox,
  loader: () => Promise<InboxBinaryPart[] | null>,
): Promise<CachedInboxMessage | null> {
  const key = cacheKey(mailbox, uid);
  const existing = cache.get(key);
  if (existing && Date.now() - existing.storedAt <= TTL_MS) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const parts = await loader();
    if (!parts) return null;
    rememberInboxAttachments(uid, parts, mailbox);
    return cache.get(key) ?? null;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

function evict(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.storedAt > TTL_MS) cache.delete(key);
  }
  while (cache.size > MAX_MESSAGES || totalBytes() > MAX_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function totalBytes(): number {
  let sum = 0;
  for (const entry of cache.values()) sum += entry.bytes;
  return sum;
}
