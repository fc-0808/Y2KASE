/**
 * Admin · Fresh visit — open the storefront as a browser that has never seen it.
 *
 * The page documents itself deliberately. A tester who does not know what the
 * reset covers, what it leaves alone, or how long the pop-ups take to appear
 * will read a correct result as a bug (or, worse, a bug as a correct result),
 * so the timings quoted here come from the same constants the dialogs run on.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  CircleCheck,
  Clock,
  Lock,
  MousePointerClick,
  Sparkles,
} from "lucide-react";
import { FreshVisitConsole } from "./FreshVisitConsole";
import type { FreshVisitLink } from "./actions";
import {
  CART_RECOVERY_POLICY,
  WELCOME_POPUP_POLICY,
} from "@/lib/marketing/popup-policy";
import { freshVisitPath, mintFreshVisitToken } from "@/lib/preview/fresh-visit";
import {
  FRESH_VISIT_RESET_EXCLUSIONS,
  FRESH_VISIT_RESET_INVENTORY,
  QA_EXCLUSION_MAX_AGE_S,
} from "@/lib/preview/visitor-state";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Admin · Fresh visit" };
export const dynamic = "force-dynamic";

const DEFAULT_PATH = "/";
const DEFAULT_EXCLUDE_FROM_ANALYTICS = true;

const seconds = (ms: number) => Math.round(ms / 1_000);
const days = (ms: number) => Math.round(ms / (24 * 60 * 60 * 1_000));

/**
 * The origin the operator is actually browsing.
 *
 * Not `SITE_URL`: that is pinned to the canonical production origin, so on a
 * Vercel preview deployment it would hand the operator a link that tests the
 * wrong build. The request knows where it arrived; ask it.
 */
async function currentOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return SITE_URL;
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export default async function AdminFreshVisitPage() {
  const origin = await currentOrigin();
  // Minted per request (the page is force-dynamic), so the operator always
  // arrives at a link that is already valid and clickable.
  const minted = mintFreshVisitToken({
    path: DEFAULT_PATH,
    excludeFromAnalytics: DEFAULT_EXCLUDE_FROM_ANALYTICS,
  });
  const initialLink: FreshVisitLink = {
    href: freshVisitPath(minted.token),
    path: DEFAULT_PATH,
    excludeFromAnalytics: DEFAULT_EXCLUDE_FROM_ANALYTICS,
    expiresAt: minted.expiresAt,
  };

  const timings = [
    {
      label: "Welcome pop-up",
      value: `${seconds(WELCOME_POPUP_POLICY.delayMs)} seconds`,
      detail: `On any discovery page with an empty bag. Then once a week, and never again after ${WELCOME_POPUP_POLICY.maxDismissals} dismissals.`,
    },
    {
      label: "Cart recovery — desktop",
      value: `${seconds(CART_RECOVERY_POLICY.exitArmDelayMs)} seconds, then exit intent`,
      detail:
        "Add something to the bag, wait, then move the pointer up out of the top of the window.",
    },
    {
      label: "Cart recovery — touch",
      value: `${seconds(CART_RECOVERY_POLICY.touchIdleDelayMs)} seconds idle`,
      detail: `Needs items in the bag. Then once every ${days(CART_RECOVERY_POLICY.throttleMs)} days.`,
    },
  ];

  const steps = [
    "The signed link expires this browser's storefront cookies.",
    "A one-frame hand-off page clears saved bag, promo code, pop-up counters and browsing memory.",
    "You land on the page you picked, indistinguishable from a first-time visitor.",
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-black">
          <Sparkles className="h-6 w-6 text-[var(--primary)]" aria-hidden="true" />
          Fresh visit
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]/60">
          Open the storefront as a browser that has never been there — pop-ups
          armed, bag empty, no discount saved, no visitor id. Nothing about the
          storefront behaves differently on a fresh visit; the link only clears
          what your browser remembered.
        </p>
      </div>

      <FreshVisitConsole initialLink={initialLink} origin={origin} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            <MousePointerClick className="h-4 w-4" aria-hidden="true" />
            What happens when you click
          </h2>
          <ol className="mt-3 space-y-2.5">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary)]/10 text-[11px] font-black text-[var(--primary)]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="text-[var(--foreground)]/70">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            <Clock className="h-4 w-4" aria-hidden="true" />
            When the pop-ups appear
          </h2>
          <dl className="mt-3 space-y-3">
            {timings.map((timing) => (
              <div key={timing.label}>
                <dt className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold">
                  {timing.label}
                  <span className="text-[var(--primary)]">{timing.value}</span>
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-[var(--foreground)]/55">
                  {timing.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            What gets reset
          </h2>
          <dl className="mt-3 space-y-3">
            {FRESH_VISIT_RESET_INVENTORY.map((item) => (
              <div key={item.label}>
                <dt className="text-sm font-bold">{item.label}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-[var(--foreground)]/55">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            <Lock className="h-4 w-4" aria-hidden="true" />
            What it leaves alone
          </h2>
          <dl className="mt-3 space-y-3">
            {FRESH_VISIT_RESET_EXCLUSIONS.map((item) => (
              <div key={item.label}>
                <dt className="text-sm font-bold">{item.label}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-[var(--foreground)]/55">
                  {item.detail}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-sm font-bold">Analytics exclusion</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-[var(--foreground)]/55">
                When enabled it lasts {Math.round(QA_EXCLUSION_MAX_AGE_S / 3_600)}{" "}
                hours, then your browsing counts as normal traffic again. Opening
                a link with the option switched off clears it immediately.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
