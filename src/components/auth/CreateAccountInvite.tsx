"use client";

import Link from "next/link";
import { signInHref, type SignInIntent } from "@/lib/auth-redirect";

/**
 * Bridge from a newsletter opt-in to a real website account.
 *
 * "Join the club" writes `email_subscribers` only. Shoppers reasonably think
 * that *is* membership. This CTA is the missing second step: a passwordless
 * account so they can track orders. It must never auto-send a magic link —
 * marketing consent is not a sign-in request.
 */
export function CreateAccountInvite({
  email,
  intent = "club",
  className,
}: {
  email?: string;
  intent?: SignInIntent;
  className?: string;
}) {
  const href = signInHref({
    email,
    intent,
    callbackUrl: "/account/orders",
  });

  return (
    <p
      className={
        className ??
        "text-center text-[13px] leading-snug text-[var(--foreground)]/65"
      }
    >
      Want to track orders later?{" "}
      <Link
        href={href}
        className="font-bold text-[var(--primary)] underline decoration-[var(--primary)]/40 underline-offset-2 hover:decoration-[var(--primary)]"
      >
        Create a free account
      </Link>{" "}
      — no password needed.
    </p>
  );
}
