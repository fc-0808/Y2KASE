/**
 * Better Auth server-side configuration.
 *
 * Rules:
 *  - This file is SERVER ONLY. Never import it in client components.
 *  - All auth enforcement (session checks) must happen in Server Components
 *    or Server Actions — NOT only in proxy.ts — because CVE-2025-29927 showed
 *    proxy/middleware can be bypassed. Next.js 16 is patched, but defense-in-
 *    depth means we always validate at the data layer too.
 *
 * OAuth setup:
 *  - Google:  https://console.cloud.google.com → Credentials → OAuth 2.0 Client
 *    Redirect URI: https://YOUR_DOMAIN/api/auth/callback/google
 *  - Apple:   https://developer.apple.com/account → Sign In with Apple
 *    Redirect URI: https://YOUR_DOMAIN/api/auth/callback/apple
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  // ── session ───────────────────────────────────────────────────────────────
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // re-read cookie every 5 minutes max
    },
  },

  // ── user ──────────────────────────────────────────────────────────────────
  user: {
    /** Expose the `role` column on the session so requireAdmin() can read it. */
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false, // don't allow client to set this field directly
      },
    },
  },

  // ── email + password (admin login) ───────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    // Disable public self-registration — admin creates their account via the
    // CLI seed script; customers use OAuth or magic link only.
    autoSignIn: true,
  },

  // ── social OAuth ──────────────────────────────────────────────────────────
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET,
          },
        }
      : {}),
  },

  // ── plugins ───────────────────────────────────────────────────────────────
  plugins: [
    /**
     * Anonymous plugin: lets customers browse and add to cart without
     * creating an account. When they check out, they enter their email and
     * we prompt them to "claim" the account via magic link.
     * Their cart and order history transfers automatically.
     */
    anonymous(),
  ],

  // ── trusted origins ───────────────────────────────────────────────────────
  trustedOrigins: process.env.NEXT_PUBLIC_SITE_URL
    ? [process.env.NEXT_PUBLIC_SITE_URL]
    : ["http://localhost:3000"],

  // ── advanced ─────────────────────────────────────────────────────────────
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

// Export auth types for use in Server Components and Actions.
export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

/**
 * Server-side helper: get the session from the current request headers.
 * Use this in Server Components and Server Actions — not proxy.ts.
 *
 * @example
 *   const session = await getSession(headers());
 *   if (!session) redirect('/sign-in');
 */
export async function getSession(requestHeaders: Headers) {
  return auth.api.getSession({ headers: requestHeaders });
}

/**
 * Admin-only guard for Server Components.
 * Throws a redirect to /admin/sign-in if the user is not logged in or not admin.
 */
export async function requireAdmin(requestHeaders: Headers) {
  const session = await getSession(requestHeaders);
  if (!session || session.user.role !== "admin") {
    return null;
  }
  return session;
}
