"use client";

/**
 * Better Auth browser client.
 *
 * Import this in "use client" components only.
 * For server-side session access, use `getSession()` from `@/lib/auth`.
 */
import { createAuthClient } from "better-auth/react";
import { anonymousClient, magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // Same origin as the page. A baked-in NEXT_PUBLIC_SITE_URL made the
  // browser post to localhost (or production) even when the admin UI was
  // opened from a phone on the LAN / a preview URL.
  plugins: [anonymousClient(), magicLinkClient()],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession: getClientSession,
} = authClient;
