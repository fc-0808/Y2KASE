"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Search, ChevronDown, Menu, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCart, cartCount } from "@/lib/store/cart";
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";
import { Wordmark } from "@/components/brand/Decor";
import { CategoryIcon } from "@/components/brand/CategoryIcon";
import { DeviceIcon } from "@/components/brand/DeviceIcon";

// Skip SSR — useSession from better-auth is browser-only.
const UserButton = dynamic(
  () => import("@/components/UserButton").then((m) => m.UserButton),
  { ssr: false },
);

/** Serializable collection node passed from the server header. */
export type MenuCollection = {
  slug: string;
  name: string;
  kind: string;
  icon: string | null;
  accentColor: string | null;
  count: number;
  children: MenuCollection[];
};

type Panel = "devices" | "collections" | null;

export function Navbar({ collections }: { collections: MenuCollection[] }) {
  const items = useCart((s) => s.items);
  const openCart = useCart((s) => s.open);
  const [mounted, setMounted] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);

  // Hydration guard: the cart count comes from a persisted client store, so we
  // only render it after mount to avoid an SSR/client mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const count = mounted ? cartCount(items) : 0;

  // Close any open menu when the route changes (syncing UI to the router).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanel(null);
    setMobileOpen(false);
  }, [pathname]);

  // Close the mega-panel on outside click / Escape.
  useEffect(() => {
    if (!panel) return;
    function onClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setPanel(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPanel(null);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const brands = collections.filter((c) => c.kind === "brand");
  const genres = collections.filter((c) => c.kind === "genre");

  return (
    <header
      ref={headerRef}
      className="relative border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: logo + desktop triggers */}
        <div className="flex items-center gap-7">
          <Link href="/" aria-label="Y2KASE home" className="flex items-center">
            <Wordmark className="text-base sm:text-lg" />
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-bold md:flex">
            <MenuTrigger
              label="Devices"
              active={panel === "devices"}
              onClick={() => setPanel(panel === "devices" ? null : "devices")}
            />
            <MenuTrigger
              label="Collections"
              active={panel === "collections"}
              onClick={() =>
                setPanel(panel === "collections" ? null : "collections")
              }
            />
            <Link
              href="/products"
              className="rounded-full px-3 py-2 transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
            >
              Shop All
            </Link>
          </nav>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <Link
            href="/products"
            aria-label="Search products"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--muted)]"
          >
            <Search className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={openCart}
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
          <div className="hidden md:block">
            <UserButton />
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--muted)] md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Desktop mega-panel */}
      {panel === "devices" && <DevicesPanel onNavigate={() => setPanel(null)} />}
      {panel === "collections" && (
        <CollectionsPanel
          brands={brands}
          genres={genres}
          onNavigate={() => setPanel(null)}
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <MobileMenu brands={brands} genres={genres} />
      )}
    </header>
  );
}

function MenuTrigger({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex items-center gap-1 rounded-full px-3 py-2 transition ${
        active
          ? "bg-[var(--primary)] text-white shadow-[0_4px_0_#d62f88]"
          : "hover:bg-[var(--muted)] hover:text-[var(--primary)]"
      }`}
    >
      {label}
      <ChevronDown
        className={`h-4 w-4 transition ${active ? "rotate-180" : ""}`}
      />
    </button>
  );
}

/** Full-width dropdown shell shared by both panels. */
function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-full hidden animate-float-up border-b border-[var(--border)] bg-[var(--background)]/95 shadow-2xl backdrop-blur-md md:block">
      <div className="h-1 w-full bg-holo-vivid" />
      <div className="mx-auto max-w-[1800px] px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}

function DevicesPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <PanelShell>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
        {DEVICE_FAMILIES.map((family) => (
          <div key={family.id}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40">
              {family.label}
            </p>
            <ul className="space-y-1">
              {family.devices.map((device) => (
                <li key={device.id}>
                  <Link
                    href={`/products?device=${device.id}`}
                    onClick={onNavigate}
                    className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm font-semibold hover:bg-[var(--muted)]"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--muted)] text-[var(--primary)] transition group-hover:bg-[var(--primary-soft)]">
                      <DeviceIcon id={device.id} className="h-4 w-4" />
                    </span>
                    <span className="group-hover:text-[var(--primary)]">
                      {device.label}
                    </span>
                    {device.comingSoon && (
                      <span className="ml-auto rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--foreground)]/40">
                        Soon
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function CollectionsPanel({
  brands,
  genres,
  onNavigate,
}: {
  brands: MenuCollection[];
  genres: MenuCollection[];
  onNavigate: () => void;
}) {
  const empty = brands.length === 0 && genres.length === 0;
  return (
    <PanelShell>
      {empty ? (
        <p className="text-sm text-[var(--foreground)]/60">
          Collections are being curated — check back soon.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40">
              Characters & Brands
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              {brands.map((brand) => (
                <div key={brand.slug}>
                  <Link
                    href={`/collections/${brand.slug}`}
                    onClick={onNavigate}
                    className="flex items-center gap-2 font-bold hover:text-[var(--primary)]"
                  >
                    <CategoryIcon
                      slug={brand.slug}
                      color={brand.accentColor}
                      kind={brand.kind}
                      className="h-6 w-6 shrink-0"
                    />
                    {brand.name}
                  </Link>
                  {brand.children.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {brand.children.slice(0, 6).map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/collections/${child.slug}`}
                            onClick={onNavigate}
                            className="text-sm text-[var(--foreground)]/65 hover:text-[var(--primary)]"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40">
              Shop by category
            </p>
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => (
                <Link
                  key={genre.slug}
                  href={`/collections/${genre.slug}`}
                  onClick={onNavigate}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-semibold transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <CategoryIcon
                    slug={genre.slug}
                    color={genre.accentColor}
                    kind={genre.kind}
                    className="h-4 w-4"
                  />
                  {genre.name}
                </Link>
              ))}
            </div>
            <Link
              href="/collections"
              onClick={onNavigate}
              className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[var(--primary)]"
            >
              Browse all collections →
            </Link>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function MobileMenu({
  brands,
  genres,
}: {
  brands: MenuCollection[];
  genres: MenuCollection[];
}) {
  return (
    <div className="max-h-[70vh] overflow-y-auto border-t border-[var(--border)] bg-[var(--background)] px-4 py-4 md:hidden">
      <MobileSection title="Devices">
        <div className="grid grid-cols-2 gap-1.5">
          {DEVICE_FAMILIES.flatMap((f) => f.devices).map((d) => (
            <Link
              key={d.id}
              href={`/products?device=${d.id}`}
              className="flex items-center gap-2 rounded-xl bg-[var(--card)] px-3 py-2 text-sm font-semibold"
            >
              <DeviceIcon id={d.id} className="h-4 w-4 text-[var(--primary)]" />
              {d.label}
            </Link>
          ))}
        </div>
      </MobileSection>

      {brands.length > 0 && (
        <MobileSection title="Characters & Brands">
          <div className="flex flex-wrap gap-2">
            {brands.map((b) => (
              <Link
                key={b.slug}
                href={`/collections/${b.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-semibold"
              >
                <CategoryIcon
                  slug={b.slug}
                  color={b.accentColor}
                  kind={b.kind}
                  className="h-4 w-4"
                />
                {b.name}
              </Link>
            ))}
          </div>
        </MobileSection>
      )}

      {genres.length > 0 && (
        <MobileSection title="Shop by category">
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <Link
                key={g.slug}
                href={`/collections/${g.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-semibold"
              >
                <CategoryIcon
                  slug={g.slug}
                  color={g.accentColor}
                  kind={g.kind}
                  className="h-4 w-4"
                />
                {g.name}
              </Link>
            ))}
          </div>
        </MobileSection>
      )}

      <Link
        href="/products"
        className="mt-2 block rounded-full bg-[var(--primary)] px-4 py-2.5 text-center text-sm font-bold text-white"
      >
        Shop All Products
      </Link>
    </div>
  );
}

function MobileSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40">
        {title}
      </p>
      {children}
    </div>
  );
}
