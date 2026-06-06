/**
 * /api/unsubscribe — RFC 8058 one-click unsubscribe endpoint.
 *
 * Mail clients POST here (triggered by the List-Unsubscribe-Post header) when a
 * recipient clicks the native "Unsubscribe" button. A GET is also honored and
 * redirects to the friendly confirmation page for anyone who opens the link in
 * a browser.
 */
import { NextResponse, type NextRequest } from "next/server";
import { applyUnsubscribe } from "@/lib/unsubscribe";

export const runtime = "nodejs";

function params(req: NextRequest) {
  const url = new URL(req.url);
  return {
    email: url.searchParams.get("e") ?? "",
    token: url.searchParams.get("t") ?? "",
  };
}

export async function POST(req: NextRequest) {
  const { email, token } = params(req);
  const ok = await applyUnsubscribe(email, token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export async function GET(req: NextRequest) {
  const { email, token } = params(req);
  const ok = await applyUnsubscribe(email, token);
  const dest = new URL("/unsubscribe", req.url);
  dest.searchParams.set("status", ok ? "ok" : "error");
  return NextResponse.redirect(dest);
}
