import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authProviders, getSession } from "@/lib/auth";
import { SignInClient } from "./SignInClient";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";
import { sanitizeEmailParam } from "@/lib/email-address";
import {
  isSignedInUser,
  parseSignInIntent,
  safeStorefrontCallbackUrl,
  storefrontAuthErrorMessage,
} from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in or create a Y2KASE account with a one-tap email link or Google — no password needed. Track orders from any device.",
  robots: PRIVATE_PAGE_ROBOTS,
};

// Reflects per-request session + provider config — never statically cached.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    email?: string;
    intent?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeStorefrontCallbackUrl(params.callbackUrl);

  const session = await getSession(await headers());
  if (session && isSignedInUser(session.user)) {
    redirect(callbackUrl);
  }

  return (
    <div className="flex min-h-[calc(100svh-5.75rem)] items-center justify-center px-4 py-16">
      <SignInClient
        googleEnabled={authProviders.google}
        appleEnabled={authProviders.apple}
        magicLinkEnabled={authProviders.magicLink}
        callbackUrl={callbackUrl}
        initialEmail={sanitizeEmailParam(params.email)}
        intent={parseSignInIntent(params.intent)}
        authError={storefrontAuthErrorMessage(params.error)}
      />
    </div>
  );
}
