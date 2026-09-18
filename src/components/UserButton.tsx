"use client";

/**
 * UserButton — avatar / sign-in entry-point in the Navbar.
 *
 * - Signed out (or anonymous guest session) → labelled "Sign in" control.
 * - Signed in → avatar (or initials) with a dropdown: My Orders | Sign Out.
 *
 * Uses Better Auth's `useSession` hook. Mount guard prevents SSR hydration
 * mismatch because the session lives in a cookie that is read client-side.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { User, LogOut, Package } from "lucide-react";
import { isSignedInUser } from "@/lib/auth-redirect";

export function UserButton() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted || isPending) {
    return <span className="inline-block h-10 w-10 rounded-full sm:w-[5.5rem]" />;
  }

  if (!isSignedInUser(session?.user)) {
    return (
      <Link
        href="/sign-in"
        aria-label="Sign in"
        className="flex h-10 items-center gap-1.5 rounded-full px-2 transition hover:bg-[var(--muted)] sm:px-3"
      >
        <User className="h-5 w-5" />
        <span className="hidden text-sm font-bold sm:inline">Sign in</span>
      </Link>
    );
  }

  const user = session!.user;
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
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ring-2 ring-[var(--border)] transition hover:ring-[var(--primary)]"
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
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-48 animate-float-up rounded-2xl border border-[var(--border)] bg-[var(--card)] py-1.5 shadow-2xl"
        >
          <div className="border-b border-[var(--border)] px-4 py-2.5">
            <p className="truncate text-xs font-bold">{user.name ?? "My Account"}</p>
            <p className="truncate text-xs text-[var(--foreground)]/50">{user.email}</p>
          </div>

          <Link
            href="/account/orders"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
          >
            <Package className="h-4 w-4" />
            My Orders
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/");
              router.refresh();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
