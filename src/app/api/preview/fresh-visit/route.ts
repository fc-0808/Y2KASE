/**
 * GET /api/preview/fresh-visit — start a clean-slate storefront visit.
 *
 * Stage one of two. This handler owns the half of visitor state the browser
 * cannot reach: the httpOnly cookies. It verifies the signed ticket, expires
 * those cookies on the redirect itself, decides whether the coming session
 * counts as real traffic, and hands off to `/__fresh-visit`, which clears Web
 * Storage before forwarding to the landing page.
 *
 * Split across two hops on purpose. Cookies can only be expired by a response,
 * and `localStorage` can only be cleared by a script — so one of them has to
 * happen on a page the storefront has not booted on yet. Doing the wipe on the
 * destination instead would race the Zustand stores, which rehydrate the cart
 * during the same tick the document parses.
 *
 * Unauthenticated by design: the ticket is the credential, so the operator can
 * paste the link into a private window — the one place a genuinely signed-out
 * first visit can be observed — without an admin session tagging along.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyFreshVisitToken } from "@/lib/preview/fresh-visit";
import {
  FRESH_VISIT_BOOTSTRAP_PATH,
  FRESH_VISIT_STATUS_PARAM,
  FRESH_VISIT_TOKEN_PARAM,
} from "@/lib/preview/routes";
import {
  QA_EXCLUSION_COOKIE,
  QA_EXCLUSION_MAX_AGE_S,
  SERVER_VISITOR_COOKIES,
} from "@/lib/preview/visitor-state";
import { hit } from "@/lib/rate-limit";

/** Pull the first public IP from the proxy chain. */
function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

/**
 * Expiring a cookie only works on an exact (name, path) match, and every cookie
 * in the set is written at the root.
 */
function expireCookie(response: NextResponse, name: string): void {
  response.cookies.set(name, "", { path: "/", maxAge: 0 });
}

export async function GET(req: NextRequest) {
  // A signed link is cheap to refuse but not free — cap the verification work a
  // single source can demand. Well above anything a human operator generates.
  if (!hit(`fresh-visit:${clientIp(req)}`, { limit: 30, windowMs: 60_000 }).ok) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const token = req.nextUrl.searchParams.get(FRESH_VISIT_TOKEN_PARAM);
  const verification = verifyFreshVisitToken(token);

  const destination = new URL(FRESH_VISIT_BOOTSTRAP_PATH, req.nextUrl.origin);
  if (!verification.ok) {
    // The bootstrap page renders the explanation, so a bad ticket lands on one
    // branded screen rather than a raw 4xx body.
    destination.searchParams.set(
      FRESH_VISIT_STATUS_PARAM,
      verification.reason,
    );
    return noStore(NextResponse.redirect(destination, 303));
  }

  // Forward the ticket rather than the resolved path. The bootstrap re-verifies
  // it, which keeps every landing destination signed end to end — there is no
  // point in the chain where an unsigned `?to=` could be swapped in.
  destination.searchParams.set(FRESH_VISIT_TOKEN_PARAM, token!);

  const response = noStore(NextResponse.redirect(destination, 303));
  for (const name of SERVER_VISITOR_COOKIES) expireCookie(response, name);

  if (verification.ticket.excludeFromAnalytics) {
    response.cookies.set(QA_EXCLUSION_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: QA_EXCLUSION_MAX_AGE_S,
      path: "/",
    });
  } else {
    // A full-fidelity ticket must also *undo* a previous exclusion, or the
    // operator silently keeps testing under the flag they just turned off.
    expireCookie(response, QA_EXCLUSION_COOKIE);
  }

  return response;
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
