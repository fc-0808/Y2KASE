"use client";

/**
 * WelcomeGiftForm — the conversion engine of the /pages/welcome-gift landing
 * page (the destination of the printed QR-code card handed to Etsy buyers).
 *
 * Flow:
 *  1. Collect email (+ optional first name).
 *  2. POST /api/subscribe with `source: "welcome-card"` so QR conversions are
 *     attributable in the subscribers table / analytics.
 *  3. Reveal the WELCOME10 code with one-tap copy and a "Shop now" CTA.
 *
 * The API is idempotent: returning besties get their code back without a
 * duplicate welcome email (`alreadySubscribed`).
 */

import { useState } from "react";
import Link from "next/link";
import { Gift, Sparkles, Check, Copy, ArrowRight } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "success";

export function WelcomeGiftForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [code, setCode] = useState("WELCOME10");
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [copied, setCopied] = useState(false);

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

      setCode(data.code ?? "WELCOME10");
      setAlreadyMember(Boolean(data.alreadySubscribed));
      setStatus("success");
    } catch {
      setError("Connection error. Please try again.");
      setStatus("idle");
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — the code is visible
      // on screen, so this is a non-blocking nicety.
    }
  }

  if (status === "success") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)]">
          <Sparkles className="h-8 w-8 text-[var(--primary)]" />
        </div>
        <h2 className="font-display text-2xl font-black text-[var(--foreground)]">
          {alreadyMember ? "Welcome back, bestie! 💕" : "You're in, bestie! 🎉"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--foreground)]/65">
          {alreadyMember
            ? "You're already part of the club — here's your code again."
            : "Your discount is ready, and we've sent it to your inbox too. 💌"}
        </p>

        {/* Code reveal + copy */}
        <div className="mt-5 rounded-2xl border-2 border-dashed border-[var(--primary)] bg-[var(--primary-soft)] px-5 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]/70">
            Your code
          </p>
          <p className="wordmark mt-1.5 text-3xl tracking-[0.15em] sm:text-4xl">
            {code}
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/30 bg-white/70 px-4 py-1.5 text-xs font-bold text-[var(--primary)] transition hover:bg-white"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Tap to copy
              </>
            )}
          </button>
          <p className="mt-3 text-xs text-[var(--foreground)]/50">
            10% off · Enter at checkout · One-time use
          </p>
        </div>

        <Link
          href="/products"
          className="btn-candy mt-5 inline-flex w-full items-center justify-center gap-2 py-3.5 text-sm"
        >
          Shop the collection <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
          <Gift className="h-7 w-7 text-[var(--primary)]" />
        </div>
        <h2 className="font-display text-2xl font-black leading-tight text-[var(--foreground)]">
          Claim your 10% off ✨
        </h2>
        <p className="mt-2 text-sm text-[var(--foreground)]/65">
          Drop your email and we&apos;ll send your welcome code straight to your
          inbox — plus first dibs on new drops. 🌸
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>

        {error && (
          <p className="text-xs font-semibold text-red-500" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "loading" || !email}
          className="btn-candy w-full py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Sending…" : "Claim my 10% off ✨"}
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
