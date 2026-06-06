import Link from "next/link";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { applyUnsubscribe } from "@/lib/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Human-facing unsubscribe confirmation. When opened with a valid signed link
 * it performs the opt-out server-side and shows the result; mail-client
 * one-click hits go to /api/unsubscribe instead.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string; status?: string }>;
}) {
  const sp = await searchParams;

  let success: boolean;
  if (sp.status) {
    success = sp.status === "ok";
  } else {
    success = await applyUnsubscribe(sp.e ?? "", sp.t ?? "");
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 text-center sm:px-6">
      <div className="card-cute overflow-hidden">
        <div className="h-1.5 w-full bg-holo-vivid" />
        <div className="p-8">
          <p className="text-4xl">{success ? "💌" : "🤔"}</p>
          <h1 className="mt-3 font-display text-2xl font-black">
            {success ? "You're unsubscribed" : "Link expired or invalid"}
          </h1>
          <p className="mt-2 text-sm text-[var(--foreground)]/70">
            {success
              ? "You won't receive marketing emails from us anymore. You'll still get essential emails about any orders you place."
              : "We couldn't process this unsubscribe link. Please email us and we'll take care of it right away."}
          </p>
          {!success && (
            <p className="mt-2 text-sm font-semibold text-[var(--primary)]">
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          )}
          <Link
            href="/"
            className="btn-candy mt-6 inline-flex items-center justify-center gap-2 px-6 py-3"
          >
            <Sparkles className="h-4 w-4" /> Back to Y2KASE
          </Link>
        </div>
      </div>
    </div>
  );
}
