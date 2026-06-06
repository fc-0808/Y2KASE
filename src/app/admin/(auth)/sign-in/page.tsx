"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { signIn } from "@/lib/auth-client";

/** Where admins land after signing in when no (valid) callback is supplied. */
const DEFAULT_CALLBACK = "/admin/products";

/**
 * Resolve the post-login destination to a SAFE internal admin path.
 *
 * This guards against two problems:
 *  1. Open redirects — an attacker-supplied `?callbackUrl=https://evil.com`
 *     (or protocol-relative `//evil.com`) must never be followed.
 *  2. Dead-end navigations — values like `/admins` that aren't real admin
 *     routes would push the user straight into a 404 after a successful login.
 *
 * We therefore only accept relative paths that live inside the admin area and
 * are not the sign-in page itself; everything else falls back to the default.
 */
function resolveCallbackUrl(raw: string | null): string {
  if (!raw) return DEFAULT_CALLBACK;
  // Must be a relative path on this origin. Reject absolute URLs and
  // protocol-relative URLs ("//host") that browsers treat as cross-origin.
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_CALLBACK;
  // Never bounce back to the sign-in page (would look like a failed login).
  if (raw === "/admin/sign-in" || raw.startsWith("/admin/sign-in")) {
    return DEFAULT_CALLBACK;
  }
  // Only navigate within the admin area; "/admins" & friends are not admin.
  if (raw === "/admin" || raw.startsWith("/admin/")) return raw;
  return DEFAULT_CALLBACK;
}

// Inner component isolates useSearchParams() inside the required Suspense boundary.
function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = resolveCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Invalid credentials.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl shadow-pink-100/50"
    >
      <div>
        <label className="mb-1.5 block text-sm font-semibold">Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-3 font-bold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function AdminSignInPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-5 w-5 text-[var(--primary)]" />
            <span className="text-xl font-black">
              Y2K<span className="text-[var(--primary)]">ASE</span> Admin
            </span>
          </span>
          <p className="mt-2 text-sm text-[var(--foreground)]/60">
            Sign in to manage your catalog.
          </p>
        </div>

        {/* Suspense required because SignInForm uses useSearchParams() */}
        <Suspense
          fallback={
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--foreground)]/40">
              Loading…
            </div>
          }
        >
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
