"use client";

/**
 * Post-purchase account claim — the Shopify / Glossier pattern.
 *
 * Guest checkout is the default (forcing a password before pay kills
 * conversion). After the order is paid we already have a verified email, so
 * the highest-intent moment to create an account is this page: one tap sends
 * a magic link, and `/account/orders` will pick up the guest order by email.
 *
 * We do not offer Google here. A different Google account than the checkout
 * email would split the identity and hide this order.
 */

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { gaEvent } from "@/lib/analytics/gtag";
import {
  DEFAULT_STOREFRONT_CALLBACK,
  SIGN_IN_PATH,
  withNewAccountWelcome,
} from "@/lib/auth-redirect";
import { normalizeEmail } from "@/lib/email-address";

export function ClaimAccountCard({
  email,
  magicLinkEnabled,
}: {
  email: string;
  magicLinkEnabled: boolean;
}) {
  const normalized = normalizeEmail(email);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!magicLinkEnabled) return;
    setError("");
    setLoading(true);
    try {
      const { error: linkError } = await signIn.magicLink({
        email: normalized,
        callbackURL: DEFAULT_STOREFRONT_CALLBACK,
        newUserCallbackURL: withNewAccountWelcome(DEFAULT_STOREFRONT_CALLBACK),
        errorCallbackURL: `${SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(DEFAULT_STOREFRONT_CALLBACK)}`,
      });
      if (linkError) {
        setError(linkError.message ?? "Couldn't send the link. Try again.");
        return;
      }
      gaEvent("login", { method: "magic_link", engagement: "checkout_claim" });
      setSent(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!normalized) return null;

  return (
    <div className="border-t border-[var(--border)] px-6 py-5 text-left">
      {sent ? (
        <div className="rounded-2xl bg-[var(--muted)] px-4 py-4 text-center">
          <p className="text-sm font-black">Check your inbox 💌</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]/70">
            We sent a one-tap sign-in link to{" "}
            <span className="font-bold text-[var(--foreground)]">
              {normalized}
            </span>
            . Tap it to save this order to your account — it expires in 10
            minutes.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-black">Save this order to an account</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]/65">
                Track shipping and reorder later. No password — we&apos;ll email
                a sign-in link to{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {normalized}
                </span>
                .
              </p>
            </div>
          </div>

          {magicLinkEnabled ? (
            <form onSubmit={handleSubmit} className="mt-4">
              <button
                type="submit"
                disabled={loading}
                className="btn-candy flex w-full items-center justify-center py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending…" : "Email me a sign-in link ✨"}
              </button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-[var(--foreground)]/50">
              Sign-in email is being set up. Use the confirmation email we just
              sent to keep this receipt handy.
            </p>
          )}

          {error ? (
            <p className="mt-2 text-xs font-semibold text-red-500" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
