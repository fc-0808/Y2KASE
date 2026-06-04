import Link from "next/link";
import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";

export const metadata: Metadata = {
  title: "Checkout cancelled",
  robots: { index: false },
};

/**
 * Buyer backed out of Stripe Checkout. Their cart is still intact (we never
 * cleared it), so we just reassure them and send them back to keep shopping.
 */
export default function CheckoutCancelPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 text-center sm:px-6">
      <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-[var(--muted)] text-3xl">
        🛍️
      </span>
      <h1 className="font-display text-2xl font-black">No worries, bestie!</h1>
      <p className="mt-2 text-[var(--foreground)]/70">
        Your checkout was cancelled and nothing was charged. Your bag is still
        saved whenever you&apos;re ready.
      </p>
      <Link
        href="/products"
        className="btn-candy mt-6 inline-flex items-center justify-center gap-2 px-6 py-3"
      >
        <ShoppingBag className="h-4 w-4" /> Back to shopping
      </Link>
    </div>
  );
}
