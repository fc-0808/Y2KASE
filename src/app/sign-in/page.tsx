import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authProviders, getSession } from "@/lib/auth";
import { SignInClient } from "./SignInClient";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your Y2KASE account to track orders and save your favourites.",
};

// Reflects per-request session + provider config — never statically cached.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  // Already signed in? Skip the form.
  const session = await getSession(await headers());
  if (session?.user && !session.user.isAnonymous) {
    redirect(callbackUrl || "/account/orders");
  }

  return (
    <div className="flex min-h-[80dvh] items-center justify-center px-4 py-16">
      <SignInClient
        googleEnabled={authProviders.google}
        magicLinkEnabled={authProviders.magicLink}
        callbackUrl={callbackUrl || "/account/orders"}
      />
    </div>
  );
}
