"use client";

import { useState, useEffect } from "react";
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
  Megaphone,
  ExternalLink,
  Inbox,
  Menu,
  X,
  ChevronRight,
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

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/bestsellers", label: "Bestsellers", icon: Star },
      { href: "/admin/collections", label: "Collections", icon: FolderTree },
      { href: "/admin/upload", label: "Upload", icon: UploadCloud },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
      { href: "/admin/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    label: "Audience",
    items: [
      { href: "/admin/members", label: "Members", icon: Users },
      { href: "/admin/subscribers", label: "Subscribers", icon: Mail },
      { href: "/admin/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: "/admin/visitors", label: "Visitors", icon: Globe }],
  },
  {
    label: "Marketing",
    items: [{ href: "/admin/social", label: "Social", icon: Megaphone }],
  },
];

function SidebarContent({
  user,
  pathname,
  onNavigate,
}: {
  user: AuthUser;
  pathname: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleSignOut() {
    await signOut();
    router.push("/admin/sign-in");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-5">
        <Link
          href="/admin"
          className="flex items-center gap-2"
          onClick={onNavigate}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-black tracking-tight">
              Y2K<span className="text-primary">ASE</span>
            </p>
            <p className="flex items-center gap-1 text-[10px] font-semibold text-(--foreground)/40">
              <ShieldCheck className="h-3 w-3" />
              Admin Console
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-(--foreground)/35">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon, exact }) => {
                  const active = isActive(href, exact);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
                          active
                            ? "bg-(--primary)/10 text-primary"
                            : "text-(--foreground)/60 hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active
                              ? "text-primary"
                              : "text-(--foreground)/40 group-hover:text-(--foreground)/70",
                          )}
                        />
                        <span className="truncate">{label}</span>
                        {active && (
                          <ChevronRight className="ml-auto h-3 w-3 text-(--primary)/60" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer: View Store + User + Sign out */}
      <div className="shrink-0 space-y-1 border-t border-border p-3">
        <Link
          href="/products"
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-(--foreground)/50 transition hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          View Store
        </Link>

        <div className="flex items-center gap-3 rounded-lg px-2.5 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--primary)/15 text-xs font-bold uppercase text-primary">
            {user.email?.[0] ?? "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-(--foreground)/70">
              {user.email}
            </p>
            <p className="text-[10px] text-(--foreground)/40">Administrator</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-(--foreground)/50 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AdminNavbar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const activeLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((item) => {
      if (item.exact) return pathname === item.href;
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    })?.label ?? "Admin";

  return (
    <>
      {/* ─── Desktop sidebar (fixed, always visible on lg+) ─── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <SidebarContent user={user} pathname={pathname} />
      </aside>

      {/* ─── Mobile: top bar ─── */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-(--card)/90 px-4 backdrop-blur-md lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-1.5 text-(--foreground)/60 hover:bg-muted hover:text-foreground"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/admin" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-black">
            Y2K<span className="text-primary">ASE</span>
          </span>
        </Link>

        <span className="text-(--foreground)/30">/</span>
        <span className="text-sm font-semibold text-(--foreground)/60">
          {activeLabel}
        </span>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile slide-over */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card shadow-2xl transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="absolute right-3 top-4">
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-(--foreground)/50 hover:bg-muted hover:text-foreground"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarContent
          user={user}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
    </>
  );
}
