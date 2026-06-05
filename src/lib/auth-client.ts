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
  baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  plugins: [anonymousClient(), magicLinkClient()],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession: getClientSession,
} = authClient;
