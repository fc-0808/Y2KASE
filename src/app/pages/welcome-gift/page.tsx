import type { Metadata } from "next";
import Link from "next/link";
import {
  Truck,
  Percent,
  Cake,
  Sparkles,
  ShieldCheck,
  Heart,
  ArrowRight,
} from "lucide-react";
import { WelcomeGiftForm } from "@/components/WelcomeGiftForm";
import {
  Wordmark,
  Sticker,
  SparkleField,
  PixelHeart,
} from "@/components/brand/Decor";

export const metadata: Metadata = {
  title: "Your Welcome Gift",
  description:
    "Thanks for scanning, bestie! Join the Y2KASE Club and unlock 10% off your first order, free shipping over $35, and member-only drops.",
  alternates: { canonical: "/pages/welcome-gift" },
  openGraph: {
    title: "Your Welcome Gift · Y2KASE",
    description:
      "Join the Y2KASE Club and unlock 10% off your first order, free shipping over $35, and member-only drops. ✨",
    url: "/pages/welcome-gift",
  },
};

const PERKS = [
  {
    icon: <Truck className="h-5 w-5" />,
    title: "Free shipping over $35",
    desc: "Tracked delivery, straight to your door.",
  },
  {
    icon: <Percent className="h-5 w-5" />,
    title: "Member-only discounts",
    desc: "Limited drops & codes you won't find on Etsy.",
  },
  {
    icon: <Cake className="h-5 w-5" />,
    title: "VIP tiers & birthday gifts",
    desc: "The more you shop, the more you unlock. 🎀",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "First dibs on new drops",
    desc: "Early access before everyone else.",
  },
];

const REASONS = [
  {
    icon: <Heart className="h-5 w-5" />,
    title: "The same designs you loved",
    desc: "Every case, grip and charm from our Etsy shop — now in one cuter home.",
  },
  {
    icon: <Percent className="h-5 w-5" />,
    title: "Better prices, direct",
    desc: "Shopping direct skips the marketplace fees, so you get more for less.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Secure checkout & easy returns",
    desc: "Stripe-secured payments and 30-day hassle-free returns.",
  },
];

export default function WelcomeGiftPage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero + claim form ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1100px] px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-white bg-holo-shimmer p-6 shadow-xl sm:rounded-[2.5rem] sm:p-10">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <SparkleField />

          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            {/* Pitch */}
            <div className="text-center lg:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                <Sticker className="text-[var(--primary)]">★ Good vibes</Sticker>
                <Sticker className="text-[var(--accent)]">Stay cute</Sticker>
              </div>

              <p className="mt-5 font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
                Welcome, Etsy bestie
              </p>
              <h1 className="mt-3 font-display text-3xl font-black leading-[1.1] sm:text-4xl lg:text-5xl">
                Welcome to the <Wordmark className="text-2xl sm:text-3xl lg:text-4xl" />{" "}
                Club! 🎀
              </h1>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[var(--foreground)]/75 lg:mx-0">
                Thanks for scanning your card! As a thank-you for shopping with
                us, here&apos;s{" "}
                <strong className="text-[var(--primary)]">10% off</strong> your
                first order on{" "}
                <span className="font-bold">y2kase.com</span> — plus all the perks
                of the club. 🌸
              </p>

              <ul className="mx-auto mt-6 inline-flex flex-col gap-2.5 text-left">
                {PERKS.slice(0, 3).map((p) => (
                  <li key={p.title} className="flex items-center gap-2 font-bold">
                    <PixelHeart className="h-4 w-4 shrink-0" />
                    {p.title}
                  </li>
                ))}
              </ul>
            </div>

            {/* Claim card */}
            <div className="card-cute relative overflow-hidden p-6 sm:p-8">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-holo-vivid" />
              <WelcomeGiftForm />
            </div>
          </div>
        </div>
      </section>

      {/* ── Club perks ────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1100px] px-4 pt-14 sm:px-6">
        <div className="mb-7 text-center">
          <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
            Members only
          </p>
          <h2 className="mt-2.5 font-display text-2xl font-black sm:text-3xl">
            Perks of the club
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div
              key={p.title}
              className="card-cute flex flex-col items-start gap-3 p-5"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-holo text-[var(--primary)]">
                {p.icon}
              </span>
              <div>
                <p className="font-bold leading-snug">{p.title}</p>
                <p className="mt-1 text-sm text-[var(--foreground)]/60">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why shop direct ───────────────────────────────────────────────── */}
      <section className="mx-auto mt-14 w-full max-w-[1100px] px-4 sm:px-6">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)]/70 p-6 sm:p-10">
          <div className="mb-7 text-center">
            <h2 className="font-display text-2xl font-black sm:text-3xl">
              Why shop with us direct?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--foreground)]/60">
              Loved us on Etsy? You&apos;ll love us even more here.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {REASONS.map((r) => (
              <div key={r.title} className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-holo text-[var(--primary)]">
                  {r.icon}
                </span>
                <div>
                  <p className="font-bold leading-snug">{r.title}</p>
                  <p className="mt-1 text-sm text-[var(--foreground)]/60">
                    {r.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1100px] px-4 py-16 text-center sm:px-6">
        <h2 className="font-display text-2xl font-black sm:text-3xl">
          Ready to treat your phone? ✨
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--foreground)]/60">
          Browse the full collection of kawaii &amp; Y2K cases, grips and charms.
        </p>
        <Link
          href="/products"
          className="btn-candy mt-6 inline-flex items-center gap-2 px-8 py-3.5"
        >
          Start shopping <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
