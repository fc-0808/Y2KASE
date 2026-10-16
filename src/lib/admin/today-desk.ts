/**
 * Today desk — the short list of work only a person can do.
 *
 * Orders, reviews, Club email, and Instagram are computed from the systems
 * that already record them. Nothing here is a checkbox. Welcome, cart, and
 * review-request mail stay off the list; those run on their own clocks.
 * Saturday's peak send stays off too: two Club emails is the week, a third
 * is optional.
 *
 * Safe to import from client components. No database, no secrets.
 */

import {
  CLUB_CADENCE_TIMEZONE,
  CLUB_DEFAULT_BROADCASTS_PER_WEEK,
  CLUB_SLOTS,
  addHours,
  buildClubWeekView,
  clubWeekBounds,
  slotInstantInWeek,
  type CadenceBroadcastRecord,
  type ClubSlotDefinition,
} from "@/lib/marketing/cadence";
import { emailStudioHref } from "@/lib/marketing/types";

export const TODAY_DESK_LIMIT = 5;

export type TodayDeskTone = "urgent" | "open" | "attention" | "quiet";
export type TodayClubTone = "done" | "open" | "owed" | "clear";

export type TodayDeskItem = {
  id: string;
  tone: TodayDeskTone;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  /** Pacific clock already formatted, e.g. "Tue 10:00–14:00 PT". */
  clock?: string;
  startsAt?: string;
  endsAt?: string;
};

export type TodayDeskNext = {
  label: string;
  when: string;
  startsAt: string;
  endsAt: string | null;
  kind: "later-this-week" | "next-week";
};

export type TodayDeskSnapshot = {
  available: boolean;
  fetchedAt: string;
  weekLabel: string;
  clubHeadline: string;
  clubTone: TodayClubTone;
  calendarHref: string;
  items: TodayDeskItem[];
  next: TodayDeskNext | null;
};

export type TodayDeskInput = {
  now: Date;
  paidOrders: number;
  pendingReviews: number;
  broadcasts: readonly CadenceBroadcastRecord[];
  /** Null when today's Instagram count could not be read. The row is omitted. */
  igPostedToday: number | null;
  igPostsPerDay: number;
  /**
   * False when this week's sends could not be read. Club rows are omitted
   * rather than claiming the week is empty.
   */
  clubKnown?: boolean;
};

const DEFAULT_SLOTS = CLUB_SLOTS.filter((slot) => !slot.peakOnly);

export function unavailableTodayDesk(now: Date = new Date()): TodayDeskSnapshot {
  return {
    available: false,
    fetchedAt: now.toISOString(),
    weekLabel: "",
    clubHeadline: "Could not load today's work",
    clubTone: "clear",
    calendarHref: emailStudioHref("cadence"),
    items: [],
    next: null,
  };
}

export function buildTodayDesk(input: TodayDeskInput): TodayDeskSnapshot {
  const now = input.now;
  const clubKnown = input.clubKnown !== false;
  const week = clubWeekBounds(now, CLUB_CADENCE_TIMEZONE);
  const inWeek = input.broadcasts
    .filter((row) => {
      const at = new Date(row.launchedAt).getTime();
      return at >= week.start.getTime() && at < week.end.getTime();
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(a.launchedAt).getTime() - new Date(b.launchedAt).getTime(),
    );
  const view = buildClubWeekView({
    now,
    broadcasts: inWeek,
    timeZone: CLUB_CADENCE_TIMEZONE,
  });
  const used = inWeek.length;
  const clubDone = used >= CLUB_DEFAULT_BROADCASTS_PER_WEEK;

  const defaultViews = view.slots.filter((slot) =>
    DEFAULT_SLOTS.some((definition) => definition.id === slot.id),
  );
  const actionable = clubKnown
    ? defaultViews
        .filter((slot) => slot.status === "open" || slot.status === "missed")
        .slice()
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "open" ? -1 : 1;
          return a.recommendedAt.localeCompare(b.recommendedAt);
        })
    : [];

  let clubTone: TodayClubTone = "clear";
  if (!clubKnown) clubTone = "clear";
  else if (clubDone) clubTone = "done";
  else if (actionable.some((slot) => slot.status === "open")) clubTone = "open";
  else if (actionable.some((slot) => slot.status === "missed")) clubTone = "owed";

  const clubHeadline = !clubKnown
    ? "Club calendar unavailable"
    : clubDone
      ? "Club is done this week"
      : `${Math.min(used, CLUB_DEFAULT_BROADCASTS_PER_WEEK)} of ${CLUB_DEFAULT_BROADCASTS_PER_WEEK} Club emails`;

  const items: TodayDeskItem[] = [];
  const paid = whole(input.paidOrders);
  if (paid > 0) {
    items.push({
      id: "orders",
      tone: "urgent",
      title: paid === 1 ? "Ship 1 paid order" : `Ship ${paid} paid orders`,
      detail: "Paid and waiting to go out.",
      href: "/admin/orders?status=paid",
      actionLabel: "Ship",
    });
  }
  const pending = whole(input.pendingReviews);
  if (pending > 0) {
    items.push({
      id: "reviews",
      tone: "attention",
      title: pending === 1 ? "Moderate 1 review" : `Moderate ${pending} reviews`,
      detail: "Held until you publish or reject them.",
      href: "/admin/reviews?status=pending",
      actionLabel: "Review",
    });
  }
  for (const slot of actionable) {
    const definition = DEFAULT_SLOTS.find((row) => row.id === slot.id);
    if (!definition) continue;
    const window = slotWindow(definition, week);
    const open = slot.status === "open";
    items.push({
      id: slot.id,
      tone: open ? "open" : "attention",
      title: open ? `${slot.label} is open` : `${slot.label} still owed`,
      detail: open
        ? "This is the hour US inboxes are open."
        : "The recommended window passed. Sending is still allowed this week.",
      href: emailStudioHref(),
      actionLabel: "Compose",
      clock: formatPtWindow(window.start, window.end),
      startsAt: window.start.toISOString(),
      endsAt: window.end.toISOString(),
    });
  }
  const perDay = whole(input.igPostsPerDay);
  if (
    input.igPostedToday != null &&
    perDay > 0 &&
    whole(input.igPostedToday) < perDay
  ) {
    items.push({
      id: "instagram",
      tone: "quiet",
      title: "Instagram for today",
      detail: "Nothing recorded yet. Post one, then mark it posted.",
      href: "/admin/social/instagram",
      actionLabel: "Open",
    });
  }

  const upcoming = clubKnown
    ? defaultViews.find((slot) => slot.status === "upcoming")
    : undefined;
  let next: TodayDeskNext | null = null;
  if (upcoming) {
    const definition = DEFAULT_SLOTS.find((row) => row.id === upcoming.id);
    if (definition) {
      const window = slotWindow(definition, week);
      next = {
        label: upcoming.label,
        when: formatPtWindow(window.start, window.end),
        startsAt: window.start.toISOString(),
        endsAt: window.end.toISOString(),
        kind: "later-this-week",
      };
    }
  } else if (clubKnown && (clubDone || clubTone === "clear")) {
    const drop = CLUB_SLOTS[0];
    const nextWeek = clubWeekBounds(week.end, CLUB_CADENCE_TIMEZONE);
    const start = slotInstantInWeek(drop, nextWeek, CLUB_CADENCE_TIMEZONE);
    next = {
      label: drop.label,
      when: formatPtDated(start),
      startsAt: start.toISOString(),
      endsAt: null,
      kind: "next-week",
    };
  }

  return {
    available: true,
    fetchedAt: now.toISOString(),
    weekLabel: view.week.label,
    clubHeadline,
    clubTone,
    calendarHref: emailStudioHref("cadence"),
    items: items.slice(0, TODAY_DESK_LIMIT),
    next,
  };
}

/** Inbox is loaded separately (a live mailbox). It slots in ahead of Instagram. */
export function withInbox(
  items: readonly TodayDeskItem[],
  unread: number,
): TodayDeskItem[] {
  const waiting = whole(unread);
  if (waiting <= 0) return items.slice(0, TODAY_DESK_LIMIT);
  const inbox: TodayDeskItem = {
    id: "inbox",
    tone: "attention",
    title:
      waiting === 1 ? "Reply to 1 unread email" : `Reply to ${waiting} unread emails`,
    detail: "Customer mail is waiting.",
    href: "/admin/inbox",
    actionLabel: "Reply",
  };
  const next = items.slice();
  const instagramAt = next.findIndex((item) => item.id === "instagram");
  if (instagramAt === -1) next.push(inbox);
  else next.splice(instagramAt, 0, inbox);
  return next.slice(0, TODAY_DESK_LIMIT);
}

export function nextDeskLine(next: TodayDeskNext): string {
  if (next.kind === "next-week") return `Next Club Drop · ${next.when}`;
  return `Next · ${next.label} · ${next.when}`;
}

export function formatLocalWindow(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string | null {
  if (timeZone === CLUB_CADENCE_TIMEZONE) return null;
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const a = clockParts(start, timeZone);
    const b = clockParts(end, timeZone);
    const endClock =
      a.weekday === b.weekday
        ? `${b.hour}:${b.minute}`
        : `${b.weekday} ${b.hour}:${b.minute}`;
    return `${a.weekday} ${a.hour}:${a.minute}–${endClock} your time`;
  } catch {
    return null;
  }
}

export function formatLocalInstant(iso: string, timeZone: string): string | null {
  if (timeZone === CLUB_CADENCE_TIMEZONE) return null;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const a = clockParts(date, timeZone);
    return `${a.weekday} ${a.hour}:${a.minute} your time`;
  } catch {
    return null;
  }
}

function whole(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function slotWindow(
  slot: ClubSlotDefinition,
  week: ReturnType<typeof clubWeekBounds>,
): { start: Date; end: Date } {
  const start = slotInstantInWeek(slot, week, CLUB_CADENCE_TIMEZONE);
  return { start, end: addHours(start, slot.windowHours) };
}

export function formatPtWindow(start: Date, end: Date): string {
  const a = clockParts(start, CLUB_CADENCE_TIMEZONE);
  const b = clockParts(end, CLUB_CADENCE_TIMEZONE);
  const endClock =
    a.weekday === b.weekday
      ? `${b.hour}:${b.minute}`
      : `${b.weekday} ${b.hour}:${b.minute}`;
  return `${a.weekday} ${a.hour}:${a.minute}–${endClock} PT`;
}

export function formatPtDated(date: Date): string {
  const a = clockParts(date, CLUB_CADENCE_TIMEZONE);
  return `${a.weekday}, ${a.month} ${a.day} · ${a.hour}:${a.minute} PT`;
}

function clockParts(
  date: Date,
  timeZone: string,
): { weekday: string; day: string; month: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: pick("weekday").replace(/\.$/, ""),
    day: pick("day"),
    month: pick("month"),
    hour: pad2(pick("hour")),
    minute: pad2(pick("minute")),
  };
}

function pad2(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "00";
  return digits.padStart(2, "0").slice(-2);
}
