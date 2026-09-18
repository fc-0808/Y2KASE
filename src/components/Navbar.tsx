"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Search, ChevronDown, Menu, X, ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useCart, cartCount } from "@/lib/store/cart";
import { DEVICE_FAMILIES, deviceBrowseHref, deviceIsLive } from "@/lib/catalog/devices";
import { MAGSAFE_FACETS, magsafeFacetHref } from "@/lib/catalog/magsafe";
import { ORIGINALS_SLUG } from "@/lib/catalog/collections-config";
import { Wordmark } from "@/components/brand/Decor";
import { useSession } from "@/lib/auth-client";
import { isSignedInUser } from "@/lib/auth-redirect";

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

export function Navbar({
  collections,
  deviceCounts,
}: {
  collections: MenuCollection[];
  deviceCounts?: Record<string, number>;
}) {
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
          <UserButton />
        </div>
      </div>

      {/* Desktop mega-panel */}
      {panel === "devices" && (
        <DevicesPanel
          onNavigate={() => setPanel(null)}
          deviceCounts={deviceCounts}
        />
      )}
      {panel === "collections" && (
        <CollectionsPanel
          brands={brands}
          genres={genres}
          onNavigate={() => setPanel(null)}
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <MobileMenu
          brands={brands}
          originals={genres.find((genre) => genre.slug === ORIGINALS_SLUG)}
          deviceCounts={deviceCounts}
        />
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
function PanelShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 top-full hidden animate-float-up border-b border-[var(--border)] bg-[var(--background)]/95 shadow-2xl backdrop-blur-md md:block">
      <div className="h-1 w-full bg-holo-vivid" />
      <div className="flex max-h-[min(70vh,40rem)] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-[1800px] px-4 py-8 sm:px-6">{children}</div>
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-md">
            <div className="mx-auto max-w-[1800px] px-4 py-3.5 sm:px-6">{footer}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DevicesPanel({
  onNavigate,
  deviceCounts,
}: {
  onNavigate: () => void;
  deviceCounts?: Record<string, number>;
}) {
  return (
    <PanelShell>
      <div className="grid grid-cols-2 gap-x-10 gap-y-8 lg:grid-cols-4">
        {DEVICE_FAMILIES.map((family) => (
          <div key={family.id}>
            <p className="mb-3 border-b border-[var(--border)] pb-2.5 font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
              {family.label}
            </p>
            <ul>
              {family.devices.map((device) => {
                const live = deviceIsLive(device, deviceCounts);
                return (
                <li key={device.id}>
                  <Link
                    href={deviceBrowseHref(device, deviceCounts)}
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
                    {!live && (
                      <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground)]/45 transition group-hover:bg-white">
                        Soon
                      </span>
                    )}
                  </Link>
                </li>
                );
              })}
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
  const originals = genres.find((genre) => genre.slug === ORIGINALS_SLUG);

  return (
    <PanelShell
      footer={
        empty ? undefined : (
          <CollectionsFooter originals={originals} onNavigate={onNavigate} />
        )
      }
    >
      {empty ? (
        <p className="text-sm text-[var(--foreground)]/60">
          Collections are being curated — check back soon.
        </p>
      ) : (
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
      )}
    </PanelShell>
  );
}

/**
 * Featured originals + catalog index. Lives in the pinned panel chrome so
 * the two destinations keep matching hit targets and never collide.
 */
function CollectionsFooter({
  originals,
  onNavigate,
}: {
  originals?: MenuCollection;
  onNavigate: () => void;
}) {
  const showOriginals = (originals?.count ?? 0) > 0;
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

  return (
    <nav
      aria-label="More collections"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
    >
      {showOriginals && originals && (
        <Link
          href={`/collections/${ORIGINALS_SLUG}`}
          onClick={onNavigate}
          aria-label={`Original designs, ${originals.count} products`}
          className={`group inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-bold whitespace-nowrap shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] ${focusRing}`}
        >
          <span aria-hidden>{originals.icon ?? "✨"}</span>
          Original designs
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--foreground)]/45">
            {originals.count}
          </span>
        </Link>
      )}

      <Link
        href="/collections"
        onClick={onNavigate}
        className={`group inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap text-[var(--primary)] transition hover:bg-[var(--muted)] ${focusRing}`}
      >
        Browse all collections
        <ArrowRight
          aria-hidden
          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </Link>
    </nav>
  );
}

type MobileSectionId = "devices" | "brands" | "compat";

function MobileMenu({
  brands,
  originals,
  deviceCounts,
}: {
  brands: MenuCollection[];
  originals?: MenuCollection;
  deviceCounts?: Record<string, number>;
}) {
  // Sections are collapsed by default and expand one at a time — dumping every
  // device, brand and character into one continuous scroll (the old drawer)
  // reads as a wall of identical pills. An accordion gives each browse axis
  // its own scannable header and keeps the initial view short.
  const [openSection, setOpenSection] = useState<MobileSectionId | null>(null);
  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const toggleSection = (id: MobileSectionId) =>
    setOpenSection((current) => (current === id ? null : id));
  const showOriginals = (originals?.count ?? 0) > 0;

  return (
    <div
      id="mobile-navigation"
      className="max-h-[75vh] overflow-y-auto border-t border-[var(--border)] bg-[var(--background)] px-4 py-2 md:hidden"
    >
      <div className="divide-y divide-[var(--border)]">
        <MobileAccordion
          title="Devices"
          open={openSection === "devices"}
          onToggle={() => toggleSection("devices")}
        >
          <div className="grid grid-cols-2 gap-1.5 pb-4">
            {DEVICE_FAMILIES.flatMap((f) => f.devices).map((d) => {
              const live = deviceIsLive(d, deviceCounts);
              return (
              <Link
                key={d.id}
                href={deviceBrowseHref(d, deviceCounts)}
                className="flex items-center justify-between gap-2 rounded-xl bg-[var(--card)] px-3.5 py-2.5 text-sm font-bold"
              >
                {d.label}
                {!live && (
                  <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
                    Soon
                  </span>
                )}
              </Link>
              );
            })}
          </div>
        </MobileAccordion>

        {(brands.length > 0 || showOriginals) && (
          <MobileAccordion
            title="Characters & Brands"
            open={openSection === "brands"}
            onToggle={() => toggleSection("brands")}
          >
            {showOriginals && originals && (
              <Link
                href={`/collections/${ORIGINALS_SLUG}`}
                className="mb-1 flex items-center gap-2.5 rounded-xl bg-[var(--card)] px-3.5 py-2.5 text-[15px] font-bold"
              >
                <span aria-hidden>{originals.icon ?? "✨"}</span>
                Original designs
                <span className="text-xs font-semibold text-[var(--foreground)]/35">
                  {originals.count}
                </span>
              </Link>
            )}
            <ul className="pb-2">
              {brands.map((brand) => {
                const children = brand.children.filter((c) => c.count > 0);
                const expanded = openBrand === brand.slug;
                return (
                  <li
                    key={brand.slug}
                    className={`border-t border-[var(--border)]/60 ${
                      showOriginals ? "" : "first:border-t-0"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/collections/${brand.slug}`}
                        className="flex flex-1 items-center gap-2.5 py-2.5 text-[15px] font-bold text-[var(--foreground)]"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: brand.accentColor ?? "var(--primary)",
                          }}
                        />
                        {brand.name}
                        {brand.count > 0 && (
                          <span className="text-xs font-semibold text-[var(--foreground)]/35">
                            {brand.count}
                          </span>
                        )}
                      </Link>
                      {children.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenBrand(expanded ? null : brand.slug)
                          }
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} ${brand.name} characters`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--foreground)]/40 transition hover:bg-[var(--muted)]"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              expanded ? "rotate-180 text-[var(--primary)]" : ""
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    {expanded && children.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pb-3 pl-4">
                        {children.map((child) => (
                          <Link
                            key={child.slug}
                            href={`/collections/${child.slug}`}
                            className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--foreground)]/75"
                          >
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </MobileAccordion>
        )}

        <MobileAccordion
          title="Shop by compatibility"
          open={openSection === "compat"}
          onToggle={() => toggleSection("compat")}
        >
          <div className="flex flex-wrap gap-2 pb-4">
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
        </MobileAccordion>

        <Link
          href="/blog"
          className="flex items-center justify-between py-3 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/55"
        >
          Blog
        </Link>
        <MobileAccountLink />
      </div>

      <Link
        href="/products"
        className="my-3 block rounded-full bg-[var(--primary)] px-4 py-2.5 text-center text-sm font-bold text-white"
      >
        Shop All Products
      </Link>
    </div>
  );
}

function MobileAccountLink() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  const signedIn = isSignedInUser(session?.user);
  return (
    <Link
      href={signedIn ? "/account/orders" : "/sign-in"}
      className="flex items-center justify-between py-3 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/55"
    >
      {signedIn ? "My orders" : "Sign in / Create account"}
    </Link>
  );
}

function MobileAccordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/55"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${
            open ? "rotate-180 text-[var(--primary)]" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
