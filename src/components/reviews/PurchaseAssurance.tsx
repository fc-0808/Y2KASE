import Link from "next/link";
import { BadgeCheck, RotateCcw, Shield, Truck } from "lucide-react";
import { PURCHASE_ASSURANCE } from "@/lib/reviews/assurance";
import { SHIPPING_COUNTRIES } from "@/lib/shipping";
import { formatShippingFlat, formatShippingThreshold } from "@/lib/pricing";

/**
 * Homepage trust row, plus the short facts under the buy button.
 * MagSafe appears on a product only when that product is tagged.
 */
export function PurchaseAssurance({
  magsafe = false,
  variant,
}: {
  magsafe?: boolean;
  variant: "buybox" | "strip";
}) {
  const items =
    variant === "strip"
      ? [
          {
            title: "Cute & protective",
            href: "/about",
            detail:
              "Clear cases with a hard back. Cute in the photo, and built to cushion the phone.",
            icon: Shield,
          },
          {
            title: `Free shipping over ${formatShippingThreshold()}`,
            href: PURCHASE_ASSURANCE.shipping.href,
            detail: `${formatShippingFlat()} standard shipping on smaller orders. Tracked, across ${SHIPPING_COUNTRIES.length} markets.`,
            icon: Truck,
          },
          {
            title: "30-day returns",
            href: PURCHASE_ASSURANCE.returns.href,
            detail:
              "Changed your mind? Unused items in original condition can come back within 30 days.",
            icon: RotateCcw,
          },
        ]
      : [
          {
            ...PURCHASE_ASSURANCE.shipping,
            detail: "Every order includes a tracking number.",
            icon: Truck,
          },
          {
            ...PURCHASE_ASSURANCE.returns,
            detail: "Unused items, in original condition.",
            icon: RotateCcw,
          },
          ...(magsafe
            ? [
                {
                  ...PURCHASE_ASSURANCE.magsafe,
                  detail: "Magnet confirmed before the tag.",
                  icon: BadgeCheck,
                },
              ]
            : []),
        ];

  if (variant === "buybox") {
    return (
      <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex h-full items-center gap-2 rounded-2xl bg-[var(--muted)] px-2.5 py-2 text-[11px] font-extrabold leading-tight transition hover:bg-holo hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 sm:px-3 sm:text-xs"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="relative">
      <p className="text-center font-pixel text-[10px] uppercase text-[var(--primary)] sm:text-xs">
        ★ Always included
      </p>
      <ul className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-y-10 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-0">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex flex-col items-center px-2 text-center"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-white bg-white shadow-[0_4px_0_var(--border),0_12px_24px_rgba(255,62,165,0.18)] transition group-hover:-translate-y-0.5">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-holo-vivid text-[var(--primary)]">
                    <Icon className="h-5 w-5" />
                  </span>
                </span>
                <span className="mt-4 block max-w-[16rem] font-display text-2xl font-extrabold leading-tight text-[var(--foreground)] transition group-hover:text-[var(--primary)]">
                  {item.title}
                </span>
                <span className="mt-2 block max-w-[18rem] text-sm font-semibold leading-relaxed text-[var(--foreground)]/70">
                  {item.detail}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
