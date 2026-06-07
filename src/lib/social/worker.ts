/**
 * Social Studio — queue drain worker.
 *
 * Processes up to `max` queued generation jobs, one at a time (gpt-image-1 is
 * the rate/cost bottleneck, so sequential is intentional). Shared by the
 * scheduled cron and the admin "Process now" button. Each job is claimed
 * atomically before work begins; the daily spend cap short-circuits the run.
 */

import { runGeneration, isDailyLimitReached } from "@/lib/social/generate";
import {
  claimNextJob,
  markJobDone,
  markJobFailed,
} from "@/lib/social/jobs";

export type DrainResult = {
  processed: number;
  done: number;
  failed: number;
  stoppedReason: "empty" | "max" | "daily-limit";
};

export async function drainQueue(max = 5): Promise<DrainResult> {
  let processed = 0;
  let done = 0;
  let failed = 0;

  for (let i = 0; i < max; i++) {
    if (await isDailyLimitReached()) {
      return { processed, done, failed, stoppedReason: "daily-limit" };
    }

    const job = await claimNextJob();
    if (!job) {
      return { processed, done, failed, stoppedReason: "empty" };
    }

    processed++;
    const result = await runGeneration({
      productId: job.productId,
      preset: job.preset,
      platform: job.platform,
      quality: job.quality,
      extra: job.extra ?? undefined,
    });

    if (result.ok) {
      await markJobDone(job.id, result.creativeId);
      done++;
    } else {
      await markJobFailed(job.id, result.error, job.attempts);
      failed++;
    }
  }

  return { processed, done, failed, stoppedReason: "max" };
}
