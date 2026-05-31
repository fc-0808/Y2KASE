import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--card)]/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <p className="text-xl font-black">
            Y2K<span className="text-[var(--primary)]">ASE</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-[var(--foreground)]/60">
            Kawaii & Y2K aesthetic phone cases, charms, and accessories. Express
            your vibe. ✨
          </p>
        </div>
        <FooterCol
          title="Shop"
          links={[
            { href: "/products", label: "All Products" },
            { href: "/products?tag=kawaii_phone_case", label: "Kawaii" },
            { href: "/products?tag=magsafe_case", label: "MagSafe" },
            { href: "/products?tag=phone_charm", label: "Charms" },
          ]}
        />
        <FooterCol
          title="Help"
          links={[
            { href: "#", label: "Shipping" },
            { href: "#", label: "Returns" },
            { href: "#", label: "Contact" },
          ]}
        />
        <FooterCol
          title="Brand"
          links={[
            { href: "#", label: "About" },
            { href: "#", label: "Instagram" },
            { href: "#", label: "TikTok" },
          ]}
        />
      </div>
      <div className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--foreground)]/50">
        © {new Date().getFullYear()} Y2KASE. All rights reserved.
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-bold uppercase tracking-wide">{title}</p>
      <ul className="space-y-2 text-sm text-[var(--foreground)]/70">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="hover:text-[var(--primary)]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
