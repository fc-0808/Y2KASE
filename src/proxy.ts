/**
 * proxy.ts — Next.js 16 (renamed from middleware.ts).
 *
 * PURPOSE: Optimistic UX redirects only.
 * This file is NOT the security boundary for auth. Per CVE-2025-29927 (fixed
 * in Next.js 15.2.3+, we're on 16.x) and official Next.js guidance, middleware
 * / proxy should never be the sole auth gate. The real enforcement happens
 * server-side in each protected Server Component via `requireAdmin()`.
 *
 * What this does:
 *  - Reads the Better Auth session cookie to quickly redirect unauthenticated
 *    requests away from /admin routes (fast UX, no DB round-trip).
 *  - If the cookie is missing → redirect to /admin/sign-in.
 *  - The admin Server Component ALSO calls requireAdmin() to enforce this
 *    properly at the data layer.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Protect /admin routes ────────────────────────────────────────────────
  // Match the admin area precisely: the bare "/admin" route and anything under
  // "/admin/". A plain startsWith("/admin") check would also capture unrelated
  // paths like "/admins" or "/administrator", redirecting them into the auth
  // flow and then bouncing back to a 404 after login.
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdminPath) {
    // Skip the sign-in page itself to avoid redirect loops.
    if (pathname === "/admin/sign-in") return NextResponse.next();

    // Better Auth stores the session cookie as "better-auth.session_token"
    // (or "__Secure-better-auth.session_token" in production).
    const sessionCookie =
      request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token");

    if (!sessionCookie) {
      const signIn = new URL("/admin/sign-in", request.url);
      // Keep `?view=` (and any other query) so a cadence deep link survives login.
      signIn.searchParams.set(
        "callbackUrl",
        `${pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(signIn);
    }
  }

  return NextResponse.next();
}

export const config = {
  // This proxy only implements optimistic admin redirects. Keeping the matcher
  // equally narrow lets public pages and cached assets bypass the Node runtime.
  matcher: ["/admin/:path*"],
};
