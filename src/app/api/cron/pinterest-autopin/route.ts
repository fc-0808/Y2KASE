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
import { notePinDeletedByHygiene } from "@/lib/social/creatives";
import {
  deletePin,
  isPinterestConfigured,
  PinterestError,
} from "@/lib/social/pinterest";
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

  // Secret-gated `?delete=<pinId>` removes a bad pin (DB row stays published
  // so auto-pin does not dump that still again).
  const deleteId = req.nextUrl.searchParams.get("delete");
  let deleted: string | null = null;
  if (deleteId) {
    if (!/^\d{6,32}$/.test(deleteId)) {
      return NextResponse.json({ error: "Invalid delete id." }, { status: 400 });
    }
    try {
      await deletePin(deleteId);
      await notePinDeletedByHygiene(deleteId);
      deleted = deleteId;
    } catch (err) {
      const status = err instanceof PinterestError ? err.status : 0;
      if (status === 404) {
        await notePinDeletedByHygiene(deleteId);
        deleted = deleteId;
      } else {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { ok: false, deleted: null, error: message },
          { status: 502 },
        );
      }
    }
  }

  // Each run posts up to AUTO_PIN_PER_RUN pins, but never more than the
  // per-day pin cap across all runs combined. `?max=` (secret-gated) lets
  // ops post a single replacement without raising the daily firehose.
  const rawMax = Number(req.nextUrl.searchParams.get("max"));
  const max =
    Number.isFinite(rawMax) && rawMax >= 1
      ? Math.min(4, Math.floor(rawMax))
      : undefined;
  const result = await runAutoPin({ dailyCap: AUTO_PIN_PER_DAY, max });
  return NextResponse.json({ ...result, deleted });
}
