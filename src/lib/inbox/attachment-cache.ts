/**
 * Process-local cache of decoded inbox attachments.
 *
 * Opening a message fetches the raw RFC822 once. Inline images then hit
 * `/api/admin/inbox/attachment` — without this cache each <img> would open a
 * new IMAP connection. On serverless the cache is best-effort (one isolate);
 * a miss just re-parses the message.
 */

import type { InboxBinaryPart } from "@/lib/inbox/attachments";

const MAX_MESSAGES = 24;
const MAX_BYTES = 48 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;

export type CachedInboxMessage = {
  uid: number;
  storedAt: number;
  bytes: number;
  parts: Map<string, InboxBinaryPart>;
};

const cache = new Map<number, CachedInboxMessage>();
const inflight = new Map<number, Promise<CachedInboxMessage | null>>();

export function rememberInboxAttachments(
  uid: number,
  parts: InboxBinaryPart[],
): void {
  const map = new Map<string, InboxBinaryPart>();
  let bytes = 0;
  for (const part of parts) {
    map.set(part.id, part);
    bytes += part.bytes.byteLength;
  }
  cache.delete(uid);
  cache.set(uid, { uid, storedAt: Date.now(), bytes, parts: map });
  evict();
}

export function getInboxAttachment(
  uid: number,
  id: string,
): InboxBinaryPart | null {
  const entry = cache.get(uid);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    cache.delete(uid);
    return null;
  }
  const part = entry.parts.get(id);
  if (!part) return null;
  // LRU: re-insert so this message is last to evict.
  cache.delete(uid);
  cache.set(uid, entry);
  return part;
}

export async function loadInboxAttachments(
  uid: number,
  loader: () => Promise<InboxBinaryPart[] | null>,
): Promise<CachedInboxMessage | null> {
  const existing = cache.get(uid);
  if (existing && Date.now() - existing.storedAt <= TTL_MS) {
    cache.delete(uid);
    cache.set(uid, existing);
    return existing;
  }

  const pending = inflight.get(uid);
  if (pending) return pending;

  const promise = (async () => {
    const parts = await loader();
    if (!parts) return null;
    rememberInboxAttachments(uid, parts);
    return cache.get(uid) ?? null;
  })().finally(() => {
    inflight.delete(uid);
  });

  inflight.set(uid, promise);
  return promise;
}

function evict(): void {
  const now = Date.now();
  for (const [uid, entry] of cache) {
    if (now - entry.storedAt > TTL_MS) cache.delete(uid);
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
