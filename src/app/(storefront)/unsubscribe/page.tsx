import Link from "next/link";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: PRIVATE_PAGE_ROBOTS,
};

export const dynamic = "force-dynamic";

/**
 * Human-facing unsubscribe confirmation. GET only validates the signed link;
 * mutation requires the explicit POST below so mail-security link scanners
 * cannot unsubscribe a customer by crawling the message.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const success = sp.status === "ok";
  const awaitingConfirmation =
    !sp.status && verifyUnsubscribe(sp.e ?? "", sp.t ?? "");
  const failed = !success && !awaitingConfirmation;
  const confirmAction = `/api/unsubscribe?${new URLSearchParams({
    e: sp.e ?? "",
    t: sp.t ?? "",
  }).toString()}`;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 text-center sm:px-6">
      <div className="card-cute overflow-hidden">
        <div className="h-1.5 w-full bg-holo-vivid" />
        <div className="p-8">
          <p className="text-4xl">
            {success ? "💌" : awaitingConfirmation ? "👋" : "🤔"}
          </p>
          <h1 className="mt-3 font-display text-2xl font-black">
            {success
              ? "You're unsubscribed"
              : awaitingConfirmation
                ? "Leave the Y2KASE email list?"
                : "Link expired or invalid"}
          </h1>
          <p className="mt-2 text-sm text-[var(--foreground)]/70">
            {success
              ? "You won't receive marketing emails from us anymore. You'll still get essential emails about any orders you place."
              : awaitingConfirmation
                ? "Confirm below and we'll stop marketing emails. Essential messages about orders you place are unaffected."
                : "We couldn't verify this unsubscribe link. Please email us and we'll take care of it right away."}
          </p>
          {failed && (
            <p className="mt-2 text-sm font-semibold text-[var(--primary)]">
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          )}
          {awaitingConfirmation && (
            <form action={confirmAction} method="post" className="mt-6">
              <button type="submit" className="btn-candy w-full px-6 py-3">
                Confirm unsubscribe
              </button>
            </form>
          )}
          <Link
            href="/"
            className={`${awaitingConfirmation ? "mt-3" : "mt-6"} inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-extrabold text-[var(--foreground)]/65 transition hover:bg-[var(--muted)]`}
          >
            <Sparkles className="h-4 w-4" /> Back to Y2KASE
          </Link>
        </div>
      </div>
    </div>
  );
}
