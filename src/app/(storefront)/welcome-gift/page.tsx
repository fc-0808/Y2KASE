import type { Metadata } from "next";
import Link from "next/link";
import {
  Percent,
  Cake,
  Sparkles,
  ShieldCheck,
  Heart,
  ArrowRight,
} from "lucide-react";
import { WelcomeGiftForm } from "@/components/WelcomeGiftForm";
import { Wordmark, SparkleField, PixelHeart } from "@/components/brand/Decor";
import { WELCOME_COUPON } from "@/lib/promotions";
import { ROUTES } from "@/lib/routes";
import { FREE_SHIPPING_OFFER } from "@/lib/pricing";

const OFF = `${WELCOME_COUPON.percentOff}% off`;

const PITCH = `Unlock ${OFF} your first order — plus ${FREE_SHIPPING_OFFER.toLowerCase()}, member-only drops and VIP perks from the Y2KASE Club.`;

export const metadata: Metadata = {
  title: "Your Welcome Gift",
  description: PITCH,
  // Aliases and the retired /pages/ URL all redirect here, so every variant
  // reports one canonical and search engines pool the ranking on it.
  alternates: { canonical: ROUTES.welcomeGift },
  openGraph: {
    siteName: "Y2KASE",
    locale: "en_US",
    title: "Your Welcome Gift · Y2KASE",
    description: `${PITCH} ✨`,
    url: ROUTES.welcomeGift,
    images: [
      {
        url: "/brand/og.webp",
        width: 1200,
        height: 630,
        alt: "Your Y2KASE welcome gift",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your Welcome Gift · Y2KASE",
    description: PITCH,
    images: ["/brand/og.webp"],
  },
};

const PERKS = [
  {
    icon: <Percent className="h-5 w-5" />,
    title: "Member-only discounts",
    desc: "Exclusive codes and prices, just for the club.",
  },
  {
    icon: <Cake className="h-5 w-5" />,
    title: "VIP tiers & birthday gifts",
    desc: "The more you shop, the more you unlock. 🎀",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "First dibs on new drops",
    desc: "Early access before anyone else.",
  },
];

const REASONS = [
  {
    icon: <Heart className="h-5 w-5" />,
    title: "Designs made to love",
    desc: "Kawaii & Y2K cases, grips and charms — all in one cute place.",
  },
  {
    icon: <Percent className="h-5 w-5" />,
    title: "Members save more",
    desc: "Exclusive discounts and codes you won't find anywhere else.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Shop with confidence",
    desc: "Stripe-secured checkout and 30-day hassle-free returns.",
  },
];

export default function WelcomeGiftPage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero + claim form ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1080px] px-4 pt-2 pb-3 sm:px-6 sm:pt-12 sm:pb-0">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-holo-shimmer p-3 shadow-[0_30px_80px_-40px_rgba(120,60,120,0.45)] sm:rounded-[2.5rem] sm:p-10">
          <div className="bg-grid absolute inset-0 opacity-30" />
          <SparkleField />

          <div className="relative grid items-center gap-4 sm:gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
            {/* Pitch — compact on mobile so the form is the focal point */}
            <div className="text-center lg:text-left">
              <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
                Your welcome gift
              </p>
              <h1 className="mt-2 font-display text-[1.4rem] font-black leading-[1.12] sm:text-4xl lg:text-[2.9rem]">
                Welcome to the{" "}
                <Wordmark className="text-xl sm:text-3xl lg:text-[2.4rem]" />{" "}
                Club! 🎀
              </h1>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-snug text-[var(--foreground)]/75 sm:mt-4 sm:text-[15px] sm:leading-relaxed lg:mx-0">
                Enjoy <strong className="text-[var(--primary)]">{OFF}</strong>{" "}
                your order on us — plus free shipping, member-only drops, and
                perks made for besties like you. 🌸
              </p>

              {/* Perk bullets: desktop only (mirrored in the section below) */}
              <ul className="mt-7 hidden flex-col gap-3 text-left lg:inline-flex">
                {PERKS.slice(0, 3).map((p) => (
                  <li
                    key={p.title}
                    className="flex items-center gap-2.5 font-bold"
                  >
                    <PixelHeart className="h-4 w-4 shrink-0" />
                    {p.title}
                  </li>
                ))}
              </ul>
            </div>

            {/* Claim card — gated discount: email unlocks the code. */}
            <div className="card-cute relative overflow-hidden p-3 ring-1 ring-white/60 sm:p-6">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-holo-vivid" />
              <WelcomeGiftForm />
            </div>
          </div>
        </div>
      </section>

      {/* ── Club perks ────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1080px] px-4 pt-16 sm:px-6">
        <SectionHeading eyebrow="Members only" title="Perks of the club" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map((p) => (
            <div
              key={p.title}
              className="card-cute flex flex-col items-start gap-3.5 p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(120,60,120,0.45)]"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-holo text-[var(--primary)]">
                {p.icon}
              </span>
              <div>
                <p className="font-bold leading-snug">{p.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]/60">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why join ──────────────────────────────────────────────────────── */}
      <section className="mx-auto mt-16 w-full max-w-[1080px] px-4 sm:px-6">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)]/70 p-6 sm:p-10">
          <SectionHeading
            eyebrow="The club difference"
            title="Why you'll love it here"
            className="mb-8"
          />
          <div className="grid grid-cols-1 gap-7 sm:grid-cols-3">
            {REASONS.map((r) => (
              <div key={r.title} className="flex items-start gap-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-holo text-[var(--primary)]">
                  {r.icon}
                </span>
                <div>
                  <p className="font-bold leading-snug">{r.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]/60">
                    {r.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1080px] px-4 py-16 text-center sm:px-6">
        <h2 className="font-display text-2xl font-black sm:text-3xl">
          Ready to treat your phone? ✨
        </h2>
        <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-[var(--foreground)]/60">
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

function SectionHeading({
  eyebrow,
  title,
  className,
}: {
  eyebrow: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={`text-center ${className ?? "mb-8"}`}>
      <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
        {eyebrow}
      </p>
      <h2 className="mt-2.5 font-display text-2xl font-black sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
