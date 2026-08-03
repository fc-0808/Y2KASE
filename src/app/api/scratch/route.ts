/**
 * POST /api/scratch — record this visitor's draw. Reveals NOTHING about it.
 *
 * The response is deliberately empty of prize information: not the code, and
 * not the amount either. The discount is only named after an email address is
 * on the table, so shipping the value here would defeat the exchange — and a
 * value the UI must not display has no business being in the payload at all,
 * where the network tab and the DOM would both leak it.
 *
 * Why hide the amount and not just the code: the announcement bar already
 * advertises BESTIE10, and the most common prize tier is only a few points
 * better than it. Naming the number invites that comparison at the exact
 * moment we are asking for something; withholding it keeps the offer's real
 * claim — "better than any public code", true of every tier — intact.
 *
 * The draw still happens HERE rather than at signup so it is fixed the moment
 * the shopper plays. Abandon the form and come back tomorrow and the cookie
 * hands back the same prize: the game was real, not re-rolled to suit us.
 */
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  SCRATCH_COOKIE,
  SCRATCH_COOKIE_MAX_AGE_S,
  decodeScratchCookie,
  drawPrize,
  encodeScratchCookie,
} from "@/lib/scratch";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "scratch", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  // Idempotent by design. A visitor who reloads, opens a second tab, or comes
  // back tomorrow sees the prize they already drew — refusing to re-roll is
  // most of this endpoint's job.
  const existing = decodeScratchCookie(request.cookies.get(SCRATCH_COOKIE)?.value);
  const prize = existing ?? drawPrize();

  // Every tier retired at once. /api/subscribe falls back to the public coupon,
  // so the shopper still gets a real offer — there is just no draw to record.
  if (!prize) return NextResponse.json({ ok: true });

  const response = NextResponse.json({ ok: true });

  // Only write on a fresh draw, so re-reads don't keep sliding the expiry
  // forward and a prize can't be kept alive indefinitely by reopening the tab.
  if (!existing) {
    response.cookies.set(SCRATCH_COOKIE, encodeScratchCookie(prize), {
      httpOnly: true, // the browser must not be able to read or rewrite the draw
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SCRATCH_COOKIE_MAX_AGE_S,
    });
  }

  return response;
}
