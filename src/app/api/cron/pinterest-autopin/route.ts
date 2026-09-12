/**
 * GET /api/cron/pinterest-autopin — curated Pinterest drip (Vercel Cron).
 *
 * Each run publishes a small number of fresh pins (default 2), never a whole
 * listing gallery. Video-first, one pin per SKU, multi-day cooldown, 2:3 pin
 * cards. Daily cap is pin-level (default 4). See lib/social/pinterest-strategy
 * and lib/social/auto-pin.
 *
 * Auth: runAutoPin ensures a live OAuth token (refreshing when due) before any
 * claims, so an expired access token cannot burn the retry budget on 401s.
 *
 * Opt-in: only runs when PINTEREST_AUTOPIN_ENABLED="true".
 * Auth header: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { isPinterestConfigured } from "@/lib/social/pinterest";
import {
  isAutoPinEnabled,
  runAutoPin,
  AUTO_PIN_PER_DAY,
} from "@/lib/social/auto-pin";

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

  // Each run posts up to AUTO_PIN_PER_RUN pins, but never more than the
  // per-day pin cap across all runs combined.
  const result = await runAutoPin({ dailyCap: AUTO_PIN_PER_DAY });
  return NextResponse.json(result);
}
