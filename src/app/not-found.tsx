import Link from "next/link";
import type { Metadata } from "next";
import { Home, ShoppingBag, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-24 text-center sm:px-6">
      <p className="font-pixel text-4xl text-[var(--primary)]">404</p>
      <h1 className="mt-5 font-display text-3xl font-black sm:text-4xl">
        Oops — this page wandered off ✨
      </h1>
      <p className="mt-3 text-[var(--foreground)]/70">
        The link might be broken or the page may have moved. Let&apos;s get you
        back to the cute stuff, bestie. 💕
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm font-bold transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Home className="h-4 w-4" /> Home
        </Link>
        <Link
          href="/products"
          className="btn-candy inline-flex items-center gap-2 px-6 py-3 text-sm"
        >
          <ShoppingBag className="h-4 w-4" /> Shop all
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-semibold text-[var(--foreground)]/55">
        <Link href="/collections" className="hover:text-[var(--primary)]">
          Collections
        </Link>
        <Link href="/devices/iphone" className="hover:text-[var(--primary)]">
          iPhone Cases
        </Link>
        <Link href="/blog" className="hover:text-[var(--primary)]">
          Blog
        </Link>
      </div>
      <Sparkles className="mt-10 h-6 w-6 text-[var(--accent)]" />
    </div>
  );
}
