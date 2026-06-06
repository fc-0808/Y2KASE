"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
  LogOut,
  ShieldCheck,
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  Star,
  Users,
  Mail,
  Globe,
  UploadCloud,
  ExternalLink,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/collections", label: "Collections", icon: FolderTree },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/subscribers", label: "Subscribers", icon: Mail },
  { href: "/admin/visitors", label: "Visitors", icon: Globe },
  { href: "/admin/upload", label: "Upload", icon: UploadCloud },
];

export function AdminNavbar({ user }: { user: AuthUser }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    await signOut();
    router.push("/admin/sign-in");
    router.refresh();
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1.5">
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

        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="hidden items-center gap-1 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)] sm:flex"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View Store
          </Link>
          <span className="hidden text-xs text-[var(--foreground)]/50 lg:block">
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

      {/* Section tabs — horizontally scrollable on small screens. */}
      <nav className="mx-auto max-w-6xl px-2 sm:px-4">
        <ul className="flex items-center gap-1 overflow-x-auto pb-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition",
                    active
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--foreground)]/60 hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
