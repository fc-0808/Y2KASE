/**
 * GET /api/cron/social-publish — automated social publishing (Vercel Cron).
 *
 * Finds creatives whose scheduled time has arrived and posts them to their
 * target platform (Pinterest). Each row is claimed atomically before posting
 * (status scheduled → published) so overlapping cron invocations can never
 * double-post; a failed post reverts to "scheduled" with lastError for retry on
 * the next run.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import {
  getDueScheduled,
  claimForPublish,
  markPublishFailed,
} from "@/lib/social/creatives";
import { publishCreative } from "@/lib/social/publish";
import { isPinterestConfigured } from "@/lib/social/pinterest";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, published: 0, reason: "no-db" });
  }
  if (!isPinterestConfigured()) {
    return NextResponse.json({ ok: true, published: 0, reason: "no-pinterest-token" });
  }

  const due = await getDueScheduled(new Date());

  let published = 0;
  let failed = 0;
  let skipped = 0;

  for (const creative of due) {
    // Claim atomically: only one invocation can flip scheduled → published.
    const won = await claimForPublish(creative.id);
    if (!won) {
      skipped++;
      continue;
    }

    const outcome = await publishCreative(creative, {
      revertToScheduledOnError: true,
    });
    if (outcome.ok) {
      published++;
    } else {
      // publishCreative already recorded the error + reverted to scheduled,
      // but we claimed it to "published" first — ensure it's back to scheduled.
      await markPublishFailed(creative.id, outcome.error, true);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: due.length,
    published,
    failed,
    skipped,
  });
}
