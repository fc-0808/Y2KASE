/**
 * GET /api/cron/meta-autopost — autonomous daily Instagram + Facebook drip.
 *
 * Each run posts the next un-posted listing to every connected Meta surface:
 * an Instagram carousel + Reel, and a Facebook multi-photo post + video. Each
 * post is recorded so a listing reaches each platform exactly once; failures
 * retry up to a cap (see lib/social/meta-autopost).
 *
 * Opt-in: only runs when META_AUTOPOST_ENABLED="true" and a Meta account is
 * connected. Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { isMetaConfigured } from "@/lib/social/meta";
import { isMetaAutopostEnabled, runMetaAutopost } from "@/lib/social/meta-autopost";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds — video processing + rate-limit pauses.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isMetaAutopostEnabled()) {
    return NextResponse.json({ ok: true, posted: 0, reason: "disabled" });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, posted: 0, reason: "no-db" });
  }
  if (!isMetaConfigured()) {
    return NextResponse.json({ ok: true, posted: 0, reason: "not-configured" });
  }

  const result = await runMetaAutopost();
  return NextResponse.json(result);
}
