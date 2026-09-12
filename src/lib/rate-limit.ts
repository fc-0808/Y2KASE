/**
 * Lightweight rate limiting for public API routes.
 *
 * A fixed-window counter keyed by client IP + bucket name. This is a first line
 * of defense against abuse and cost-amplification attacks (spamming checkout,
 * the email subscribe endpoint, or the analytics beacon).
 *
 * NOTE ON SCALE: the store is an in-process Map, so limits are enforced per
 * serverless instance, not globally. That's intentionally pragmatic — it needs
 * no extra infra and stops the common single-source flood. For strict global
 * limits, swap `hit()` for an atomic Upstash/Vercel KV INCR with EXPIRE; the
 * call sites and return shape stay identical.
 */
import { NextResponse, type NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
const SWEEP_INTERVAL_MS = 60_000;
const MAX_BUCKETS = 10_000;
const TRIM_TO_BUCKETS = 7_500;
let nextSweepAt = 0;

/**
 * Opportunistically evict expired buckets, with a hard high-cardinality cap.
 *
 * Iterating thousands of entries on every request is itself a denial-of-service
 * vector, so routine sweeps run at most once per minute. Under pressure we trim
 * the oldest insertion-order entries immediately. Losing a few local counters
 * is safer than allowing a rotating proxy pool to exhaust a serverless worker.
 */
function sweep(now: number): void {
  const underPressure = store.size >= MAX_BUCKETS;
  if (!underPressure && now < nextSweepAt) return;

  for (const [key, b] of store) {
    if (b.resetAt <= now) store.delete(key);
  }

  if (store.size >= MAX_BUCKETS) {
    const removeCount = store.size - TRIM_TO_BUCKETS;
    const keys = store.keys();
    for (let i = 0; i < removeCount; i += 1) {
      const next = keys.next();
      if (next.done) break;
      store.delete(next.value);
    }
  }
  nextSweepAt = now + SWEEP_INTERVAL_MS;
}

export type RateLimitOptions = {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets (for Retry-After). */
  retryAfter: number;
};

/** Record a hit for `key` and report whether it's within the limit. */
export function hit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
  if (existing.count > opts.limit) {
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining: opts.limit - existing.count, retryAfter };
}

/** Best-effort client IP from the proxy chain (Vercel/edge friendly). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Convenience: enforce a limit for `bucket` keyed by client IP. Returns a 429
 * response when exceeded, or null when the request may proceed.
 */
export function enforceRateLimit(
  req: NextRequest,
  bucket: string,
  opts: RateLimitOptions,
): NextResponse | null {
  const result = hit(`${bucket}:${clientIp(req)}`, opts);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
  );
}
