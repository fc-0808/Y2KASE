"use client";

/**
 * Footer email capture — always-available opt-in that matches the welcome
 * pop-up's consent language and posts to the same /api/subscribe ledger.
 */

import { useState } from "react";
import Link from "next/link";
import { usePromoActions } from "@/lib/store/promo";
import { WELCOME_COUPON } from "@/lib/promotions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "success";

export function FooterSubscribe() {
  const { autoApply } = usePromoActions();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [alreadyMember, setAlreadyMember] = useState(false);

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
        body: JSON.stringify({ email: trimmed, source: "footer" }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        alreadySubscribed?: boolean;
      };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }

      autoApply(data.code ?? WELCOME_COUPON.code, "footer");
      setAlreadyMember(Boolean(data.alreadySubscribed));
      setStatus("success");
    } catch {
      setError("Connection error. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    return (
      <div className="mt-5" role="status">
        <p className="text-sm font-extrabold text-[var(--foreground)]">
          {alreadyMember ? "You're already on the list 💕" : "You're in ✨"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--foreground)]/60">
          {WELCOME_COUPON.label} is saved to your bag — shop whenever you&apos;re
          ready.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-2" noValidate>
      <label
        htmlFor="footer-email"
        className="block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50"
      >
        Join the club
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="footer-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
          placeholder="you@example.com"
          required
          autoComplete="email"
          inputMode="email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "footer-email-error" : "footer-email-note"}
          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
        />
        <button
          type="submit"
          disabled={status === "loading" || !email.trim()}
          className="btn-candy min-h-11 shrink-0 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Joining…" : "Subscribe"}
        </button>
      </div>
      {error ? (
        <p
          id="footer-email-error"
          role="alert"
          className="text-xs font-semibold text-red-500"
        >
          {error}
        </p>
      ) : (
        <p
          id="footer-email-note"
          className="text-[11px] leading-snug text-[var(--foreground)]/40"
        >
          Marketing emails only, with {WELCOME_COUPON.code}. Unsubscribe anytime.
          See our{" "}
          <Link href="/policies/privacy-policy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      )}
    </form>
  );
}
