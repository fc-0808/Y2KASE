import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/brand/Decor";

/**
 * Minimal checkout header — the Y2KASE wordmark centred, with a single way back
 * to the catalog.
 *
 * Every other exit point (mega-menu, search, account, cart icon, promo bar)
 * is intentionally removed: once a shopper reaches the bag, extra navigation is
 * pure leakage. The 1px holo strip keeps the Y2K identity without adding noise.
 */
export function CheckoutHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-md">
      <div className="h-1 w-full bg-holo-vivid" />
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/products"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--foreground)]/60 transition hover:text-[var(--primary)]"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Continue shopping</span>
          <span className="sm:hidden">Back</span>
        </Link>

        <Link href="/" aria-label="Y2KASE home" className="justify-self-center">
          <Wordmark className="text-lg sm:text-xl" />
        </Link>

        {/* Empty third column balances the grid so the wordmark stays centred. */}
        <span aria-hidden />
      </div>
    </header>
  );
}
