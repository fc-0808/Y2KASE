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
import { anonymous, magicLink } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendMagicLinkEmail } from "@/lib/email";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:3000";

/** Magic link lifetime in seconds (kept in sync with the email copy). */
const MAGIC_LINK_TTL = 60 * 10; // 10 minutes

/**
 * Origins allowed to call the auth API.
 *
 * A single SITE_URL is not enough: phones hitting a LAN IP, `www` vs apex,
 * and Vercel preview URLs all send a different Origin than the build-time
 * localhost default — Better Auth then rejects the request.
 */
function authTrustedOrigins(): string[] {
  const origins = new Set<string>();

  const add = (raw: string | undefined) => {
    if (!raw) return;
    const trimmed = raw.trim().replace(/\/$/, "");
    if (!trimmed) return;
    origins.add(trimmed);
    try {
      const url = new URL(trimmed);
      if (url.hostname.startsWith("www.")) {
        origins.add(`${url.protocol}//${url.hostname.slice(4)}`);
      } else if (url.hostname !== "localhost" && !url.hostname.endsWith(".localhost")) {
        origins.add(`${url.protocol}//www.${url.hostname}`);
      }
    } catch {
      // Ignore unparseable entries — Better Auth will reject them itself.
    }
  };

  add(process.env.BETTER_AUTH_URL);
  add(process.env.NEXT_PUBLIC_SITE_URL);
  add("http://localhost:3000");
  if (process.env.VERCEL_URL) add(`https://${process.env.VERCEL_URL}`);
  for (const extra of (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")) {
    add(extra);
  }
  return [...origins];
}

export const auth = betterAuth({
  baseURL,
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

  // ── email + password (admin login only) ──────────────────────────────────
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    /**
     * Close public self-registration. Customers sign in with OAuth or a magic
     * link; the only password account is the owner's, created by
     * `npm run seed:admin`, which writes the rows directly instead of calling
     * this route.
     *
     * Without this, POST /api/auth/sign-up/email accepted anyone. Beyond the
     * junk-account problem, an open password sign-up is the setup for a
     * pre-registration hijack: register victim@example.com first, wait for the
     * real owner to arrive via Google, and hope the provider gets linked into
     * the account you control. Better Auth's `requireLocalEmailVerified`
     * default already blocks that link — this removes the first step entirely.
     */
    disableSignUp: true,
  },

  /**
   * ── account linking ───────────────────────────────────────────────────────
   * Deliberately left unconfigured, because Better Auth's defaults are the
   * strict ones and every knob here only loosens them.
   *
   * The default requires BOTH that the provider reports a verified email AND
   * that the existing local user is already verified before it will attach a
   * new provider to an existing account. Adding `trustedProviders: ["google"]`
   * would waive the first check; `requireLocalEmailVerified: false` waives the
   * second and re-opens the hijack path described above. Neither buys us
   * anything: Google always reports verification for the accounts we accept,
   * and our own users become verified through magic link or OAuth sign-up.
   *
   * If a legitimate user ever hits `account_not_linked`, the fix is to verify
   * their email — not to relax this.
   */

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
     * Magic link (passwordless): the primary customer sign-in / sign-up method.
     * The buyer enters their email, we mail a single-use link, and clicking it
     * mints a session — no password to remember or leak. This is how modern DTC
     * brands (and Slack, Notion, Substack, …) onboard customers. A brand-new
     * email automatically creates the account, so this covers sign-up too.
     */
    magicLink({
      expiresIn: MAGIC_LINK_TTL,
      // Hash tokens at rest so a DB leak can't be replayed into sessions.
      storeToken: "hashed",
      // Independent of emailAndPassword.disableSignUp — clicking the link is
      // how customers create an account. Turning this on would 302 new buyers
      // to `new_user_signup_disabled` and silently kill storefront sign-up.
      disableSignUp: false,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({
          email,
          url,
          expiresInMinutes: Math.round(MAGIC_LINK_TTL / 60),
        });
      },
    }),

    /**
     * Anonymous plugin: lets customers browse and add to cart without
     * creating an account. When they check out, they enter their email and
     * we prompt them to "claim" the account via magic link.
     * Their cart and order history transfers automatically.
     */
    anonymous(),
  ],

  // ── trusted origins ───────────────────────────────────────────────────────
  trustedOrigins: authTrustedOrigins(),

  // ── advanced ─────────────────────────────────────────────────────────────
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

// Export auth types for use in Server Components and Actions.
export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

/**
 * Which sign-in methods are actually wired up. Read on the server and passed to
 * the sign-in UI so we never render a button (e.g. "Continue with Google") that
 * would dead-end because the OAuth credentials aren't set.
 */
export const authProviders = {
  google: Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  ),
  apple: Boolean(
    process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET,
  ),
  magicLink: Boolean(process.env.RESEND_API_KEY),
} as const;

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
