import {
  CLUB_CADENCE_COPY,
  CLUB_CADENCE_TIMEZONE,
  CLUB_DEFAULT_BROADCASTS_PER_WEEK,
  CLUB_HARD_BROADCASTS_PER_WEEK,
  CLUB_MAX_PROMOTIONS_PER_WEEK,
  CLUB_MIN_HOURS_BETWEEN_BROADCASTS,
  CLUB_SLOTS,
  CLUB_SMART_SENDING_HOURS,
  CLUB_WELCOME_HOLDOUT_HOURS,
  CLUB_WELCOME_STEP2_DELAY_HOURS,
  CLUB_WELCOME_STEP3_DELAY_HOURS,
  type CadenceSnapshot,
} from "@/lib/marketing/cadence";
import { cn } from "@/lib/utils";

const SLOT_STATUS: Record<string, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-emerald-100 text-emerald-800" },
  open: { label: "Open now", className: "bg-primary/15 text-primary" },
  upcoming: { label: "Upcoming", className: "bg-sky-100 text-sky-800" },
  missed: { label: "Window passed", className: "bg-amber-100 text-amber-800" },
  blocked: { label: "Held", className: "bg-slate-200 text-slate-700" },
};

export function ClubCadencePanel({
  snapshot,
  onCompose,
}: {
  snapshot: CadenceSnapshot;
  onCompose: () => void;
}) {
  const cards = [
    {
      label: "Broadcasts this week",
      value: `${snapshot.broadcastsThisWeek.length}/${CLUB_DEFAULT_BROADCASTS_PER_WEEK}`,
      hint: `Peak cap ${CLUB_HARD_BROADCASTS_PER_WEEK}`,
    },
    {
      label: "Campaign-eligible",
      value: snapshot.holdouts.campaignEligible,
      hint: `of ${snapshot.holdouts.active} sendable`,
    },
    {
      label: "Welcome holdout",
      value: snapshot.holdouts.welcomeHoldout,
      hint: `First ${CLUB_WELCOME_HOLDOUT_HOURS}h`,
    },
    {
      label: "Quiet window",
      value: snapshot.holdouts.smartSendingHoldout,
      hint: `Last ${CLUB_SMART_SENDING_HOURS}h`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            {CLUB_CADENCE_TIMEZONE} · {snapshot.weekLabel}
          </p>
          <h2 className="mt-1 text-xl font-black">This week&apos;s Club calendar</h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/55">
            {CLUB_CADENCE_COPY.headline} Compose still has to pass these caps
            before a send. Welcome, cart, and review mail run on their own
            clocks.
          </p>
        </div>
        <button
          type="button"
          onClick={onCompose}
          className="inline-flex items-center justify-center self-start rounded-full bg-primary px-4 py-2 text-sm font-bold text-foreground transition hover:brightness-95"
        >
          Compose a send
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-black">{card.value}</p>
            <p className="mt-1 text-xs text-foreground/45">{card.hint}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-black">Slots</h3>
          <p className="mt-1 text-sm text-foreground/50">
            Recommended windows are Pacific Time. Off-window sends are allowed
            when the weekly cap and 36-hour gap are open.
          </p>
        </div>
        <div className="divide-y divide-border">
          {snapshot.slots.map((slot) => {
            const status = SLOT_STATUS[slot.status] ?? SLOT_STATUS.upcoming;
            return (
              <div
                key={slot.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-black">{slot.label}</p>
                  <p className="mt-0.5 text-sm text-foreground/55">
                    {slot.summary}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-foreground/45">
                    {slot.recommendedLocal}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold",
                      status.className,
                    )}
                  >
                    {status.label}
                  </span>
                  {slot.filledBy ? (
                    <p className="max-w-xs truncate text-xs font-semibold">
                      {slot.filledBy.name}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-black">What this studio will refuse</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground/70">
          <li>
            <strong>{CLUB_DEFAULT_BROADCASTS_PER_WEEK} Club broadcasts</strong>{" "}
            per Monday–Sunday week, with a peak extra up to{" "}
            {CLUB_HARD_BROADCASTS_PER_WEEK} for launches, restocks, seasonal
            edits, or announcements.
          </li>
          <li>
            At most {CLUB_MAX_PROMOTIONS_PER_WEEK} subscriber-offer broadcast
            per week.
          </li>
          <li>
            {CLUB_MIN_HOURS_BETWEEN_BROADCASTS}-hour rest between broadcasts.
          </li>
          <li>
            {CLUB_WELCOME_HOLDOUT_HOURS}-hour campaign holdout after subscribe,
            then welcome follow-ups at {CLUB_WELCOME_STEP2_DELAY_HOURS}h and{" "}
            {CLUB_WELCOME_STEP2_DELAY_HOURS + CLUB_WELCOME_STEP3_DELAY_HOURS}h.
          </li>
          <li>
            {CLUB_SMART_SENDING_HOURS}-hour quiet window per inbox for
            campaigns, welcome follow-ups, and review requests. Abandoned cart
            is exempt because the Stripe session dies at 24h.
          </li>
        </ul>
        <p className="mt-4 text-sm text-foreground/55">
          {CLUB_CADENCE_COPY.operator}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-black">Recommended types</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-foreground/45">
              <tr>
                <th className="pb-2 font-bold">Slot</th>
                <th className="pb-2 font-bold">When</th>
                <th className="pb-2 font-bold">Best for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CLUB_SLOTS.map((slot) => (
                <tr key={slot.id}>
                  <td className="py-3 font-semibold">{slot.label}</td>
                  <td className="py-3 text-foreground/60">{slot.summary}</td>
                  <td className="py-3 text-foreground/60">
                    {slot.recommendedTypes.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
