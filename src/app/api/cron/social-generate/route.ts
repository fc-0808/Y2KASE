/**
 * GET /api/cron/social-generate — batch creative generation worker (Vercel Cron).
 *
 * Drains the social_jobs queue, generating a bounded number of creatives per
 * run so each invocation stays well within the serverless function timeout
 * (gpt-image-1 takes ~15s/image). Remaining jobs are picked up on the next run.
 *
 * `maxDuration` is raised so a single run can comfortably process its batch.
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { isImageGenConfigured } from "@/lib/social/image-gen";
import { drainQueue } from "@/lib/social/worker";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds (Vercel Pro allows up to 300)

const PER_RUN = Number(process.env.SOCIAL_CRON_BATCH ?? 10);

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
    return NextResponse.json({ ok: true, processed: 0, reason: "no-db" });
  }
  if (!isImageGenConfigured()) {
    return NextResponse.json({ ok: true, processed: 0, reason: "no-openai-key" });
  }

  const res = await drainQueue(PER_RUN);
  return NextResponse.json({ ok: true, ...res });
}
