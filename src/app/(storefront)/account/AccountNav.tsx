"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/account/orders",
    label: "My Orders",
    icon: Package,
    isActive: (pathname: string) =>
      pathname === "/account" || pathname.startsWith("/account/orders"),
  },
  {
    href: "/products",
    label: "Keep Shopping",
    icon: Sparkles,
    isActive: () => false,
  },
] as const;

/**
 * Account links. Icon boxes are a fixed width so both labels share one left edge.
 */
export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="flex gap-1 md:flex-col">
      {LINKS.map((link) => {
        const active = link.isActive(pathname);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition md:flex-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active
                ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                : "text-[var(--foreground)]/75 hover:bg-[var(--muted)] hover:text-[var(--primary)]",
            )}
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="truncate">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
