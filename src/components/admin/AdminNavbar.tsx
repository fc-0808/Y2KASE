"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { AuthUser } from "@/lib/auth";

export function AdminNavbar({ user }: { user: AuthUser }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/admin/sign-in");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[var(--primary)]" />
            <span className="font-black">
              Y2K<span className="text-[var(--primary)]">ASE</span>
            </span>
          </Link>
          <span className="text-[var(--foreground)]/30">/</span>
          <span className="flex items-center gap-1 text-sm font-semibold text-[var(--foreground)]/60">
            <ShieldCheck className="h-4 w-4" /> Admin
          </span>
        </div>

        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link
            href="/admin/products"
            className="hover:text-[var(--primary)]"
          >
            Products
          </Link>
          <Link
            href="/admin/collections"
            className="hover:text-[var(--primary)]"
          >
            Collections
          </Link>
          <Link href="/admin/upload" className="hover:text-[var(--primary)]">
            Upload
          </Link>
          <Link href="/products" className="hover:text-[var(--primary)]">
            View Store
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[var(--foreground)]/50 sm:block">
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
