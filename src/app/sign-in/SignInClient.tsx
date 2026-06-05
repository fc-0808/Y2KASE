"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Wordmark, Sparkle } from "@/components/brand/Decor";

/** Google-branded SVG icon — inline to avoid an extra request. */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function SignInClient() {
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch (err) {
      console.error(err);
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="card-cute w-full max-w-sm overflow-hidden">
      {/* Holo stripe */}
      <div className="h-1.5 bg-holo-vivid" />

      <div className="px-8 py-10 text-center">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="relative">
            <Sparkle className="absolute -right-5 -top-2 h-5 w-5 text-[var(--accent)] opacity-80 animate-twinkle" />
            <Wordmark className="text-xl" />
          </div>
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-baloo), sans-serif" }}>
            Welcome Back ✨
          </h1>
          <p className="text-sm text-[var(--foreground)]/60">
            Sign in to track orders and save your faves.
          </p>
        </div>

        {/* Google button */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-[var(--border)] bg-white px-5 py-3 text-sm font-bold text-[var(--foreground)] shadow-sm transition hover:border-[var(--primary)]/40 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        {error && (
          <p className="mt-3 text-xs font-semibold text-red-500">{error}</p>
        )}

        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-xs text-[var(--foreground)]/40 font-semibold">OR</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Guest / back to shop */}
        <button
          type="button"
          onClick={() => router.back()}
          className="w-full text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)] transition"
        >
          Continue as guest →
        </button>

        <p className="mt-6 text-xs text-[var(--foreground)]/40 leading-relaxed">
          By signing in you agree to our{" "}
          <a href="/policies/terms-of-service" className="underline hover:text-[var(--primary)]">
            Terms
          </a>{" "}
          and{" "}
          <a href="/policies/privacy-policy" className="underline hover:text-[var(--primary)]">
            Privacy Policy
          </a>.
        </p>
      </div>
    </div>
  );
}
