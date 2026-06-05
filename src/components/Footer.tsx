import Link from "next/link";
import { Globe } from "lucide-react";
import { Wordmark, PixelHeart, Sparkle } from "@/components/brand/Decor";

/** lucide v1 dropped brand glyphs (trademark), so we inline them. */
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.62c-3.15 0-3.5.01-4.74.07-1.14.05-1.76.24-2.17.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.17-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.05 1.14.24 1.76.4 2.17.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.17.4 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1.14-.05 1.76-.24 2.17-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.17.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1.14-.24-1.76-.4-2.17a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.17-.4-1.24-.06-1.59-.07-4.74-.07Zm0 2.76a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6Zm0 1.62a3.68 3.68 0 1 0 0 7.36 3.68 3.68 0 0 0 0-7.36Zm5.48-2.9a1.24 1.24 0 1 1 0 2.48 1.24 1.24 0 0 1 0-2.48Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.33-.04-1.55-.14-2.84-.14C11.93 2 10 3.66 10 6.7v2.8H7v4h3V22h4v-8.5Z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-[var(--border)] bg-[var(--card)]/60">
      <div className="h-1 w-full bg-holo-vivid" />
      <div className="mx-auto grid max-w-[1800px] gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-3 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-1">
          <Wordmark className="text-xl" />
          <p className="mt-3 max-w-xs text-sm text-[var(--foreground)]/65">
            Kawaii & Y2K aesthetic phone cases, charms and accessories. Welcome
            to the Club, bestie. ✨
          </p>
          <div className="mt-4 flex gap-2">
            <Social
              href="https://instagram.com/y2kase_official"
              label="Instagram"
            >
              <InstagramIcon />
            </Social>
            <Social href="https://facebook.com/y2kase" label="Facebook">
              <FacebookIcon />
            </Social>
            <Social href="https://y2kase.com" label="Website">
              <Globe className="h-4 w-4" />
            </Social>
          </div>
        </div>

        <FooterCol
          title="Shop"
          links={[
            { href: "/products", label: "All Products" },
            { href: "/products?device=iphone", label: "iPhone Cases" },
            { href: "/collections", label: "Collections" },
            { href: "/products?tag=phone_charm", label: "Charms" },
          ]}
        />
        <FooterCol
          title="Characters"
          links={[
            { href: "/collections/sanrio", label: "Sanrio" },
            { href: "/collections/miffy", label: "Miffy" },
            { href: "/collections/tamagotchi", label: "Tamagotchi" },
            { href: "/collections/anime", label: "Anime" },
          ]}
        />
        <FooterCol
          title="Help"
          links={[
            { href: "/policies/shipping-policy", label: "Shipping" },
            { href: "/policies/refund-policy", label: "Returns" },
            { href: "/faq", label: "FAQ" },
            { href: "/contact", label: "Contact" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { href: "/about", label: "About" },
            { href: "/policies/privacy-policy", label: "Privacy Policy" },
            { href: "/policies/terms-of-service", label: "Terms of Service" },
            {
              href: "https://instagram.com/y2kase_official",
              label: "@y2kase_official",
            },
          ]}
        />
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-[var(--border)] py-4 text-center text-xs font-semibold text-[var(--foreground)]/55">
        <Sparkle className="h-3 w-3 text-[var(--accent)]" />© {new Date().getFullYear()}{" "}
        Y2KASE — made with <PixelHeart className="inline h-3.5 w-3.5" /> for
        besties everywhere
      </div>
    </footer>
  );
}

function Social({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/70 transition hover:border-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
    >
      {children}
    </a>
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
      <p className="mb-3 font-display text-sm font-extrabold uppercase tracking-wide">
        {title}
      </p>
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
