/**
 * GET /api/cron/pinterest-autopin — autonomous daily Pinterest drip (Vercel Cron).
 *
 * Each run posts the next un-pinned listing(s) to Pinterest — every product
 * photo as an image pin plus the product video as a video pin — and records each
 * asset as pinned, so the whole catalog is distributed one listing at a time on a
 * steady cadence (the consistency-first approach Pinterest's algorithm rewards).
 * Idempotent and safe to overlap: every asset is claimed atomically, so a given
 * photo/video becomes exactly one Pin (see lib/social/auto-pin).
 *
 * Opt-in: only runs when PINTEREST_AUTOPIN_ENABLED="true".
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { isPinterestConfigured } from "@/lib/social/pinterest";
import { isAutoPinEnabled, runAutoPin } from "@/lib/social/auto-pin";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds — leaves room for rate-limit pauses.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isAutoPinEnabled()) {
    return NextResponse.json({ ok: true, pinned: 0, reason: "disabled" });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, pinned: 0, reason: "no-db" });
  }
  if (!isPinterestConfigured()) {
    return NextResponse.json({
      ok: true,
      pinned: 0,
      reason: "no-pinterest-token",
    });
  }

  const result = await runAutoPin();
  return NextResponse.json(result);
}
