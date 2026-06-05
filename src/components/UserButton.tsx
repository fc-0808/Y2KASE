"use client";

/**
 * UserButton — avatar / sign-in entry-point in the Navbar.
 *
 * - Signed out → shows a user icon that links to /sign-in.
 * - Signed in  → shows the user's avatar (or initials fallback) with a
 *   dropdown: My Orders | Sign Out.
 *
 * Uses Better Auth's `useSession` hook. Mount guard prevents SSR hydration
 * mismatch because the session lives in a cookie that is read client-side.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";
import { User, LogOut, Package } from "lucide-react";

export function UserButton() {
  const { data: session, isPending } = useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!mounted || isPending) {
    // Placeholder to prevent layout shift.
    return <span className="h-10 w-10 rounded-full" />;
  }

  // ── Signed OUT ──────────────────────────────────────────────────────────────
  if (!session?.user) {
    return (
      <Link
        href="/sign-in"
        aria-label="Sign in"
        className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--muted)] transition"
      >
        <User className="h-5 w-5" />
      </Link>
    );
  }

  // ── Signed IN ───────────────────────────────────────────────────────────────
  const user = session.user;
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((s: string) => s[0])
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-[var(--border)] hover:ring-[var(--primary)] transition overflow-hidden"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={user.name ?? "User avatar"} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[var(--primary-soft)] text-xs font-black text-[var(--primary)]">
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-[var(--border)] bg-[var(--card)] py-1.5 shadow-2xl animate-float-up z-50">
          <div className="px-4 py-2.5 border-b border-[var(--border)]">
            <p className="text-xs font-bold truncate">{user.name ?? "My Account"}</p>
            <p className="text-xs text-[var(--foreground)]/50 truncate">{user.email}</p>
          </div>

          <Link
            href="/account/orders"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--muted)] hover:text-[var(--primary)] transition"
          >
            <Package className="h-4 w-4" />
            My Orders
          </Link>

          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await signOut();
              window.location.href = "/";
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
