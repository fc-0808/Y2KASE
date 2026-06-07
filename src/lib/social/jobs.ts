/**
 * Social Studio — generation queue data access (social_jobs).
 *
 * The queue decouples "I want N creatives" from the request lifecycle. Jobs are
 * claimed atomically (queued → processing) so overlapping workers never process
 * the same job twice; success records the resulting creative, failure records
 * the error and (for transient failures) leaves the job retryable.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { socialJobs } from "@/lib/db/schema";

export type SocialJob = {
  id: number;
  productId: number;
  preset: string;
  platform: string;
  quality: string;
  extra: string | null;
  status: string;
  resultCreativeId: number | null;
  error: string | null;
  attempts: number;
  createdAt: Date;
  processedAt: Date | null;
};

export type NewJob = {
  productId: number;
  preset: string;
  platform: string;
  quality: string;
  extra?: string | null;
};

/** Bulk-enqueue jobs (one per product × preset). Returns the count inserted. */
export async function enqueueJobs(jobs: NewJob[]): Promise<number> {
  if (jobs.length === 0) return 0;
  const rows = await db
    .insert(socialJobs)
    .values(
      jobs.map((j) => ({
        productId: j.productId,
        preset: j.preset,
        platform: j.platform,
        quality: j.quality,
        extra: j.extra ?? null,
        status: "queued",
      })),
    )
    .returning({ id: socialJobs.id });
  return rows.length;
}

/**
 * Atomically claim the next queued job (oldest first). Flips it to "processing"
 * and bumps attempts so a concurrent worker can't grab the same row. Returns the
 * claimed job or null when the queue is empty.
 */
export async function claimNextJob(): Promise<SocialJob | null> {
  // Single-statement claim using a subquery + FOR UPDATE SKIP LOCKED semantics
  // emulated via a guarded UPDATE on the oldest queued id.
  const [next] = await db
    .select({ id: socialJobs.id })
    .from(socialJobs)
    .where(eq(socialJobs.status, "queued"))
    .orderBy(asc(socialJobs.createdAt))
    .limit(1);
  if (!next) return null;

  const claimed = await db
    .update(socialJobs)
    .set({
      status: "processing",
      attempts: sql`${socialJobs.attempts} + 1`,
    })
    .where(and(eq(socialJobs.id, next.id), eq(socialJobs.status, "queued")))
    .returning();
  return (claimed[0] as SocialJob) ?? null;
}

export async function markJobDone(
  id: number,
  resultCreativeId: number,
): Promise<void> {
  await db
    .update(socialJobs)
    .set({
      status: "done",
      resultCreativeId,
      error: null,
      processedAt: new Date(),
    })
    .where(eq(socialJobs.id, id));
}

/**
 * Mark a job failed. Retryable jobs (< maxAttempts) go back to "queued";
 * otherwise they're parked as "failed" with the error for inspection.
 */
export async function markJobFailed(
  id: number,
  error: string,
  attempts: number,
  maxAttempts = 3,
): Promise<void> {
  const retry = attempts < maxAttempts;
  await db
    .update(socialJobs)
    .set({
      status: retry ? "queued" : "failed",
      error: error.slice(0, 500),
      processedAt: new Date(),
    })
    .where(eq(socialJobs.id, id));
}

export type JobQueueCounts = {
  queued: number;
  processing: number;
  done: number;
  failed: number;
};

export async function getJobCounts(): Promise<JobQueueCounts> {
  if (!isDbConfigured()) {
    return { queued: 0, processing: 0, done: 0, failed: 0 };
  }
  const rows = await db
    .select({ status: socialJobs.status, count: sql<number>`count(*)::int` })
    .from(socialJobs)
    .groupBy(socialJobs.status);
  const out: JobQueueCounts = { queued: 0, processing: 0, done: 0, failed: 0 };
  for (const r of rows) {
    if (r.status in out) out[r.status as keyof JobQueueCounts] = r.count;
  }
  return out;
}

/** Recent failed jobs for surfacing errors in the admin UI. */
export async function getRecentFailedJobs(limit = 10): Promise<SocialJob[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select()
    .from(socialJobs)
    .where(eq(socialJobs.status, "failed"))
    .orderBy(desc(socialJobs.processedAt))
    .limit(limit);
  return rows as SocialJob[];
}

/** Clear finished/failed jobs to keep the queue table tidy. */
export async function clearFinishedJobs(): Promise<void> {
  await db
    .delete(socialJobs)
    .where(sql`${socialJobs.status} in ('done', 'failed')`);
}
