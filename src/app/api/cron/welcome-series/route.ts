/**
 * GET /api/cron/welcome-series — Club welcome steps 2 and 3.
 *
 * Step 1 is sent at subscribe time. This cron only advances subscribers who
 * already have a logged welcome-1 send, honour the 48h / 72h delays, and are
 * outside the 20-hour quiet window. Buyers are skipped: they do not need a
 * coupon reminder.
 *
 * Two daily slots (see vercel.json) so a signup just after a run is not stuck
 * until the following calendar day.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { marketingMailReadiness } from "@/lib/marketing/compliance";
import { runWelcomeSeries } from "@/lib/marketing/welcome-series";

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
    return NextResponse.json({ ok: true, sent: 0, reason: "no-db" });
  }
  const readiness = marketingMailReadiness();
  if (!readiness.ready) {
    console.error(
      `[cron:welcome-series] withheld; unmet prerequisites: ${readiness.missing.join(", ")}.`,
    );
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: "marketing-not-ready",
      missing: readiness.missing,
    });
  }

  const result = await runWelcomeSeries();
  return NextResponse.json({ ok: true, ...result });
}
