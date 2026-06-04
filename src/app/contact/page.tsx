import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Clock, HelpCircle } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Y2KASE team — we reply within 24 hours.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <header className="mb-8 text-center">
        <div className="mx-auto h-1 w-16 rounded-full bg-holo-vivid" />
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
          Get in touch 💌
        </h1>
        <p className="mt-2 text-[var(--foreground)]/65">
          Questions about an order, a product, or just want to say hi? We&apos;d
          love to hear from you, bestie.
        </p>
      </header>

      <div className="card-cute p-6 text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-holo">
          <Mail className="h-6 w-6 text-[var(--primary)]" />
        </span>
        <p className="text-sm text-[var(--foreground)]/60">Email us anytime</p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-lg font-extrabold text-[var(--primary)] hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-left">
            <Clock className="h-5 w-5 shrink-0 text-[var(--accent)]" />
            <span className="text-sm font-semibold">
              We reply within 24 hours
            </span>
          </div>
          <Link
            href="/faq"
            className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-left transition hover:border-[var(--primary)]"
          >
            <HelpCircle className="h-5 w-5 shrink-0 text-[var(--accent-blue)]" />
            <span className="text-sm font-semibold">Check the FAQ first</span>
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--foreground)]/50">
        For returns, include your order number and a photo if the item arrived
        damaged. See our{" "}
        <Link href="/policies/refund-policy" className="underline">
          Refund Policy
        </Link>
        .
      </p>
    </div>
  );
}
