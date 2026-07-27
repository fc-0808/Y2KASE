import Link from "next/link";
import { Lock } from "lucide-react";

/** The only links a buyer may legitimately need before paying. */
const LEGAL_LINKS = [
  { href: "/policies/privacy-policy", label: "Privacy Policy" },
  { href: "/policies/terms-of-service", label: "Terms of Service" },
  { href: "/policies/refund-policy", label: "Refund Policy" },
] as const;

/**
 * Minimal checkout footer — copyright, the three policies a buyer may want to
 * check before paying, and a quiet SSL reassurance.
 *
 * Deliberately centred and muted: it must reassure without ever competing with
 * the "Proceed to secure checkout" CTA, which is why the mega-footer's Shop /
 * Characters / Help / Company columns are suppressed in the funnel.
 */
export function CheckoutFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--card)]/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2.5 px-4 py-6 text-center sm:px-6">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--foreground)]/45">
          <Lock className="h-3 w-3 shrink-0" /> Secure SSL encrypted checkout
        </p>

        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-semibold text-[var(--foreground)]/50 transition hover:text-[var(--primary)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-xs font-semibold text-[var(--foreground)]/40">
          © {new Date().getFullYear()} Y2KASE
        </p>
      </div>
    </footer>
  );
}
