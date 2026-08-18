"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Search, ChevronDown, Menu, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCart, cartCount } from "@/lib/store/cart";
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";
import { MAGSAFE_FACETS, magsafeFacetHref } from "@/lib/catalog/magsafe";
import { Wordmark } from "@/components/brand/Decor";

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
      <div className="mx-auto grid h-16 max-w-[1800px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        {/* Left: mobile menu toggle + desktop nav triggers */}
        <div className="flex items-center gap-1 justify-self-start">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--muted)] md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

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
            <Link
              href="/blog"
              className="rounded-full px-3 py-2 transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
            >
              Blog
            </Link>
          </nav>
        </div>

        {/* Center: wordmark */}
        <Link
          href="/"
          aria-label="Y2KASE home"
          className="flex items-center justify-self-center"
        >
          <Wordmark className="text-lg sm:text-xl" />
        </Link>

        {/* Right: actions */}
        <div className="flex items-center gap-1 justify-self-end">
          <Link
            href="/products"
            aria-label="Browse products"
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
      {mobileOpen && <MobileMenu brands={brands} />}
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
      <div className="grid grid-cols-2 gap-x-10 gap-y-8 lg:grid-cols-4">
        {DEVICE_FAMILIES.map((family) => (
          <div key={family.id}>
            <p className="mb-3 border-b border-[var(--border)] pb-2.5 font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
              {family.label}
            </p>
            <ul>
              {family.devices.map((device) => (
                <li key={device.id}>
                  <Link
                    href={`/products?device=${device.id}`}
                    onClick={onNavigate}
                    className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[15px] font-bold text-[var(--foreground)]/75 transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)] opacity-0 transition duration-200 group-hover:opacity-100"
                      />
                      <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                        {device.label}
                      </span>
                    </span>
                    {device.comingSoon && (
                      <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground)]/45 transition group-hover:bg-white">
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
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            <p className="mb-4 border-b border-[var(--border)] pb-2.5 font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
              Characters &amp; Brands
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
              {brands.map((brand) => (
                <div key={brand.slug}>
                  <Link
                    href={`/collections/${brand.slug}`}
                    onClick={onNavigate}
                    className="group inline-flex items-baseline gap-2 text-[15px] font-extrabold text-[var(--foreground)] transition hover:text-[var(--primary)]"
                  >
                    <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                      {brand.name}
                    </span>
                    {brand.count > 0 && (
                      <span className="text-[11px] font-bold tabular-nums text-[var(--foreground)]/35">
                        {brand.count}
                      </span>
                    )}
                  </Link>
                  {brand.children.length > 0 && (
                    <ul className="mt-2.5 space-y-0.5">
                      {brand.children.slice(0, 6).map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/collections/${child.slug}`}
                            onClick={onNavigate}
                            className="group flex items-center gap-2 rounded-lg py-1 text-sm font-semibold text-[var(--foreground)]/65 transition hover:text-[var(--primary)]"
                          >
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)] opacity-0 transition duration-200 group-hover:opacity-100"
                            />
                            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                              {child.name}
                            </span>
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
            <p className="mb-4 border-b border-[var(--border)] pb-2.5 font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
              Shop by category
            </p>
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => (
                <Link
                  key={genre.slug}
                  href={`/collections/${genre.slug}`}
                  onClick={onNavigate}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-sm font-semibold text-[var(--foreground)]/80 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: genre.accentColor ?? "var(--primary)" }}
                  />
                  {genre.name}
                </Link>
              ))}
            </div>
            <Link
              href="/collections"
              onClick={onNavigate}
              className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[var(--primary)] hover:underline"
            >
              Browse all collections →
            </Link>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function MobileMenu({ brands }: { brands: MenuCollection[] }) {
  // Flatten brand → characters so Hello Kitty, Kuromi, My Melody … are all one
  // tap away instead of being buried a level deep (the desktop mega-panel shows
  // them as sub-lists; the drawer has no room for that nesting).
  //
  // Children are filtered to STOCKED collections so the drawer never dead-ends
  // on an empty page. Roots are left alone so they keep honouring the header's
  // "stocked or featured" rule.
  const brandLinks = brands.flatMap((brand) => [
    brand,
    ...brand.children.filter((child) => child.count > 0),
  ]);

  return (
    <div
      id="mobile-navigation"
      className="max-h-[70vh] overflow-y-auto border-t border-[var(--border)] bg-[var(--background)] px-4 py-4 md:hidden"
    >
      <MobileSection title="Devices">
        <div className="grid grid-cols-2 gap-1.5">
          {DEVICE_FAMILIES.flatMap((f) => f.devices).map((d) => (
            <Link
              key={d.id}
              href={`/products?device=${d.id}`}
              className="flex items-center justify-between gap-2 rounded-xl bg-[var(--card)] px-3.5 py-2.5 text-sm font-bold"
            >
              {d.label}
              {d.comingSoon && (
                <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
                  Soon
                </span>
              )}
            </Link>
          ))}
        </div>
      </MobileSection>

      {brandLinks.length > 0 && (
        <MobileSection title="Characters & Brands">
          <div className="flex flex-wrap gap-2">
            {brandLinks.map((c) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-semibold"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: c.accentColor ?? "var(--primary)" }}
                />
                {c.name}
              </Link>
            ))}
          </div>
        </MobileSection>
      )}

      <MobileSection title="Shop by compatibility">
        <div className="flex flex-wrap gap-2">
          {MAGSAFE_FACETS.map((facet) => (
            <Link
              key={facet.id}
              href={magsafeFacetHref(facet.magsafe)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-semibold"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: facet.accentColor }}
              />
              {facet.label}
            </Link>
          ))}
        </div>
      </MobileSection>

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
