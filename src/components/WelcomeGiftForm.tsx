"use client";

/**
 * WelcomeGiftForm — gated discount capture on the /welcome-gift landing page.
 *
 * The promo code is revealed only after a valid email is submitted — that
 * exchange is what drives conversion on the QR welcome flow. On success the
 * code is auto-saved to the bag and the shopper gets a one-tap shop CTA.
 *
 * Flow:
 *  1. Collect email (+ optional first name).
 *  2. POST /api/subscribe with `source: "welcome-card"`.
 *  3. Reveal the issued code + "Shop Now" deep link.
 */

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { PromoCodeBlock } from "@/components/PromoCodeBlock";
import { WELCOME_COUPON } from "@/lib/promotions";
import { usePromoActions } from "@/lib/store/promo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "success";

export function WelcomeGiftForm() {
  const { autoApply } = usePromoActions();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [issuedCode, setIssuedCode] = useState(WELCOME_COUPON.code);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setStatus("loading");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          name: name.trim(),
          source: "welcome-card",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }

      const code: string = data.code ?? WELCOME_COUPON.code;
      autoApply(code, "welcome-gift");
      setIssuedCode(code);
      setAlreadyMember(Boolean(data.alreadySubscribed));
      setStatus("success");
    } catch {
      setError("Connection error. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    const shopHref = `/discount/${encodeURIComponent(issuedCode)}?redirect=${encodeURIComponent("/")}`;

    return (
      <div role="status" className="text-center">
        <div className="mx-auto mb-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)]">
          <Sparkles className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <h2 className="font-display text-lg font-black leading-tight text-[var(--foreground)] sm:text-xl">
          {alreadyMember ? "Welcome back, bestie! 💕" : "You're in, bestie! 🎉"}
        </h2>
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-snug text-[var(--foreground)]/65">
          {alreadyMember
            ? "Your code is ready — tap below to shop with your discount applied."
            : "Check your inbox 💌 Your welcome code is below."}
        </p>

        <div className="mt-4">
          <PromoCodeBlock code={issuedCode} hideEyebrow copyLabel="Copy Code" />
        </div>

        <Link
          href={shopHref}
          className="btn-candy mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 py-3 text-sm"
        >
          Shop Now ({WELCOME_COUPON.percentOff}% Off Applied){" "}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 text-center">
        <h2 className="font-display text-lg font-black leading-tight text-[var(--foreground)] sm:text-xl">
          Claim Your Welcome Gift! 🎀
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5" noValidate>
        <div>
          <label
            htmlFor="wg-name"
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50"
          >
            Your name (optional)
          </label>
          <input
            id="wg-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sakura"
            autoComplete="given-name"
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>

        <div>
          <label
            htmlFor="wg-email"
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50"
          >
            Your email <span className="text-[var(--primary)]">*</span>
          </label>
          <input
            id="wg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            inputMode="email"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "wg-email-error" : undefined}
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>

        {error && (
          <p
            id="wg-email-error"
            className="text-xs font-semibold text-red-500"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "loading" || !email}
          className="btn-candy min-h-11 w-full py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Claiming…" : "Claim My Welcome Gift ✨"}
        </button>

        <p className="text-center text-[11px] text-[var(--foreground)]/40">
          No spam, ever. Unsubscribe anytime. By joining you agree to our{" "}
          <Link href="/policies/privacy-policy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
