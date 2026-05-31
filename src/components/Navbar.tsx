"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBag, Search, Sparkles } from "lucide-react";
import { useCart, cartCount } from "@/lib/store/cart";

export function Navbar() {
  const items = useCart((s) => s.items);
  const open = useCart((s) => s.open);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const count = mounted ? cartCount(items) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--primary)] text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-xl font-black tracking-tight">
            Y2K<span className="text-[var(--primary)]">ASE</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
          <Link href="/products" className="hover:text-[var(--primary)]">
            Shop All
          </Link>
          <Link
            href="/products?tag=kawaii_phone_case"
            className="hover:text-[var(--primary)]"
          >
            Kawaii
          </Link>
          <Link
            href="/products?tag=magsafe_case"
            className="hover:text-[var(--primary)]"
          >
            MagSafe
          </Link>
          <Link
            href="/products?tag=phone_charm"
            className="hover:text-[var(--primary)]"
          >
            Charms
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/products"
            aria-label="Search products"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--muted)]"
          >
            <Search className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={open}
            aria-label="Open cart"
            className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--muted)]"
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
