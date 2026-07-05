/**
 * Bounded-concurrency async map — a tiny, dependency-free worker pool.
 *
 * Runs `fn` over `items` with at most `limit` in flight at once, preserving
 * result order (results[i] corresponds to items[i]). Used to parallelise the
 * I/O-bound parts of ingestion (image conversion, R2 uploads, whole products)
 * without flooding the network, the AI provider's rate limits, or memory.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const max = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: max }, worker));
  return results;
}
