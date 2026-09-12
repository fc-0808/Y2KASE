/**
 * Y2KASE Club cadence — the rules a retention team would enforce.
 *
 * Why this file exists
 * ────────────────────
 * Frequency is the highest-leverage deliverability decision a small list
 * makes. Gmail/Yahoo score complaint rate, not "did we have something to say."
 * A kawaii accessories brand with a visual catalog can look like fashion
 * (CASETiFY, Sonix, BURGA) without copying apparel's 4–6 emails/week. Phone
 * cases do not refresh like clothing; daily "new drop" mail on a 25-recipient
 * list trains subscribers to ignore or report us.
 *
 * What the 2026 evidence says (encoded below, not re-litigated at send time)
 * ──────────────────────────────────────────────────────────────────────────
 *   • Fashion / accessories sweet spot: 1–2 *campaign* emails per week
 *     (5–8 per month). Exceeding ~10/month is where unsubscribe rates
 *     typically cross 1%. Flows (welcome, cart, review) are not part of
 *     that budget and must not be throttled by it.
 *   • Klaviyo-class programs: flows produce ~40% of email revenue from ~5%
 *     of send volume. The welcome series is the highest-ROI flow we did not
 *     yet have.
 *   • Smart sending (Klaviyo default 16–20h): one marketing message per
 *     inbox per quiet window, so a Tuesday Club Drop does not land on top
 *     of a welcome from Monday night.
 *   • Abandoned cart is time-critical (Stripe session dies at 24h) and is
 *     exempt from the quiet window. It still *writes* the quiet window so
 *     the next campaign waits.
 *   • Engagement sunset needs open/click events we do not store yet. Until
 *     that exists, we hold out *new* subscribers (48h) rather than guessing
 *     at "cold" from a list this small.
 *
 * Hard rules
 * ──────────
 *   1. Default 2 Club broadcasts per America/Los_Angeles week (Mon 00:00).
 *   2. A 3rd send is peak-only: launch, restock, seasonal, or announcement.
 *   3. At most one `promotion` broadcast per week.
 *   4. 36 hours between Club broadcasts (no same-afternoon double tap).
 *   5. 20-hour per-inbox quiet window for campaigns and welcome follow-ups.
 *   6. 48-hour campaign holdout after subscribe so welcome #1 can breathe.
 *   7. Recommended windows are guidance. Caps and gaps are gates.
 *
 * Safe to import from client components: no server-only secrets.
 */

import type { CampaignType } from "./types";

export const CLUB_CADENCE_TIMEZONE = "America/Los_Angeles";

/** ISO weekday: Monday = 1 … Sunday = 7. */
export const CLUB_WEEK_START_WEEKDAY = 1;

export const CLUB_DEFAULT_BROADCASTS_PER_WEEK = 2;
export const CLUB_PEAK_BROADCASTS_PER_WEEK = 3;
export const CLUB_HARD_BROADCASTS_PER_WEEK = 3;
export const CLUB_MIN_HOURS_BETWEEN_BROADCASTS = 36;
export const CLUB_SMART_SENDING_HOURS = 20;
export const CLUB_WELCOME_HOLDOUT_HOURS = 48;
export const CLUB_WELCOME_STEP2_DELAY_HOURS = 48;
export const CLUB_WELCOME_STEP3_DELAY_HOURS = 72;
export const CLUB_MAX_PROMOTIONS_PER_WEEK = 1;

export const CLUB_PEAK_CAMPAIGN_TYPES = [
  "product-launch",
  "restock",
  "seasonal",
  "announcement",
] as const satisfies readonly CampaignType[];

export type ClubPeakCampaignType = (typeof CLUB_PEAK_CAMPAIGN_TYPES)[number];

export const CLUB_EDITORIAL_CAMPAIGN_TYPES = [
  "newsletter",
  "announcement",
  "product-launch",
  "restock",
  "seasonal",
] as const satisfies readonly CampaignType[];

export type MarketingSendKind =
  | "campaign"
  | "welcome"
  | "welcome-followup"
  | "abandoned-cart"
  | "review-request";

export const MARKETING_SEND_KINDS = [
  "campaign",
  "welcome",
  "welcome-followup",
  "abandoned-cart",
  "review-request",
] as const satisfies readonly MarketingSendKind[];

export type ClubSlotId = "club-drop" | "club-promo" | "peak-extra";

export type ClubSlotDefinition = {
  id: ClubSlotId;
  label: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  minute: number;
  /** Hours after the slot start that still count as "in window." */
  windowHours: number;
  recommendedTypes: readonly CampaignType[];
  peakOnly: boolean;
  summary: string;
};

export const CLUB_SLOTS: readonly ClubSlotDefinition[] = [
  {
    id: "club-drop",
    label: "Club Drop",
    weekday: 2,
    hour: 10,
    minute: 0,
    windowHours: 4,
    recommendedTypes: [
      "newsletter",
      "announcement",
      "product-launch",
      "restock",
      "seasonal",
    ],
    peakOnly: false,
    summary: "Tuesday 10:00–14:00 PT. New SKUs, restocks, editorial looks.",
  },
  {
    id: "club-promo",
    label: "Club Promo",
    weekday: 4,
    hour: 8,
    minute: 0,
    windowHours: 4,
    recommendedTypes: ["promotion", "seasonal"],
    peakOnly: false,
    summary: "Thursday 08:00–12:00 PT. Subscriber offer or seasonal edit.",
  },
  {
    id: "peak-extra",
    label: "Peak Extra",
    weekday: 6,
    hour: 9,
    minute: 0,
    windowHours: 4,
    recommendedTypes: ["product-launch", "restock", "seasonal", "announcement"],
    peakOnly: true,
    summary:
      "Saturday 09:00–13:00 PT. Only when the week already has two sends, and never a third promo.",
  },
] as const;

export type CadenceBroadcastRecord = {
  id: string;
  name: string;
  campaignType: CampaignType;
  launchedAt: string;
};

export type CadenceIssue = {
  code: string;
  message: string;
};

export type CadenceVerdict = {
  allowed: boolean;
  slot: ClubSlotId | "off-cadence";
  inRecommendedWindow: boolean;
  broadcastsUsed: number;
  broadcastsRemaining: number;
  promotionsUsed: number;
  hoursSinceLastBroadcast: number | null;
  nextAllowedAt: string | null;
  blockers: CadenceIssue[];
  warnings: CadenceIssue[];
};

export type ClubWeekBounds = {
  start: Date;
  end: Date;
  label: string;
  timezone: string;
};

export type ClubZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

const WEEKDAY_FROM_SHORT: Record<string, ClubZonedParts["weekday"]> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const WEEKDAY_LABEL: Record<ClubZonedParts["weekday"], string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function partsMap(date: Date, timeZone: string): Record<string, string> {
  const entries = zonedFormatter(timeZone)
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value] as const);
  return Object.fromEntries(entries);
}

/**
 * Offset of `date` in `timeZone`, as (wall-clock-as-UTC − instant).
 * PDT is UTC−7 → −25_200_000. Used to construct zoned instants without a TZ db.
 */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = partsMap(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Instant whose wall clock in `timeZone` is the given civil time. */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = CLUB_CADENCE_TIMEZONE,
): Date {
  const utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = new Date(utc - timeZoneOffsetMs(new Date(utc), timeZone));
  return new Date(utc - timeZoneOffsetMs(first, timeZone));
}

export function zonedParts(
  date: Date,
  timeZone: string = CLUB_CADENCE_TIMEZONE,
): ClubZonedParts {
  const parts = partsMap(date, timeZone);
  const weekday = WEEKDAY_FROM_SHORT[parts.weekday];
  if (!weekday) {
    throw new Error(`Unexpected weekday token "${parts.weekday}".`);
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday,
  };
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function clubWeekBounds(
  now: Date,
  timeZone: string = CLUB_CADENCE_TIMEZONE,
): ClubWeekBounds {
  const parts = zonedParts(now, timeZone);
  const daysBack = (parts.weekday - CLUB_WEEK_START_WEEKDAY + 7) % 7;
  const startCivil = addCalendarDays(parts.year, parts.month, parts.day, -daysBack);
  const endCivil = addCalendarDays(startCivil.year, startCivil.month, startCivil.day, 7);
  const start = zonedInstant(
    startCivil.year,
    startCivil.month,
    startCivil.day,
    0,
    0,
    timeZone,
  );
  const end = zonedInstant(
    endCivil.year,
    endCivil.month,
    endCivil.day,
    0,
    0,
    timeZone,
  );
  const startLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(start);
  const endInclusive = new Date(end.getTime() - 1);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(endInclusive);
  return {
    start,
    end,
    label: `${startLabel} – ${endLabel}`,
    timezone: timeZone,
  };
}

export function isClubPeakCampaignType(
  type: CampaignType,
): type is ClubPeakCampaignType {
  return (CLUB_PEAK_CAMPAIGN_TYPES as readonly string[]).includes(type);
}

export function isMarketingSendKind(value: string): value is MarketingSendKind {
  return (MARKETING_SEND_KINDS as readonly string[]).includes(value);
}

export function hoursBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function formatClubLocal(
  date: Date,
  timeZone: string = CLUB_CADENCE_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function slotInstantInWeek(
  slot: ClubSlotDefinition,
  week: ClubWeekBounds,
  timeZone: string = CLUB_CADENCE_TIMEZONE,
): Date {
  const startParts = zonedParts(week.start, timeZone);
  const civil = addCalendarDays(
    startParts.year,
    startParts.month,
    startParts.day,
    slot.weekday - CLUB_WEEK_START_WEEKDAY,
  );
  return zonedInstant(
    civil.year,
    civil.month,
    civil.day,
    slot.hour,
    slot.minute,
    timeZone,
  );
}

export function isInSlotWindow(
  now: Date,
  slot: ClubSlotDefinition,
  week: ClubWeekBounds,
  timeZone: string = CLUB_CADENCE_TIMEZONE,
): boolean {
  const start = slotInstantInWeek(slot, week, timeZone);
  const end = addHours(start, slot.windowHours);
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}

export function recommendedSlotForType(
  campaignType: CampaignType,
  broadcastsUsed: number,
): ClubSlotDefinition {
  if (campaignType === "promotion") {
    return CLUB_SLOTS[1];
  }
  if (broadcastsUsed >= CLUB_DEFAULT_BROADCASTS_PER_WEEK) {
    return CLUB_SLOTS[2];
  }
  return CLUB_SLOTS[0];
}

function slotForNow(
  now: Date,
  campaignType: CampaignType,
  week: ClubWeekBounds,
  broadcastsUsed: number,
  timeZone: string,
): { slot: ClubSlotDefinition; inWindow: boolean } {
  const matching = CLUB_SLOTS.find(
    (slot) =>
      isInSlotWindow(now, slot, week, timeZone) &&
      slot.recommendedTypes.includes(campaignType) &&
      (!slot.peakOnly || broadcastsUsed >= CLUB_DEFAULT_BROADCASTS_PER_WEEK),
  );
  if (matching) return { slot: matching, inWindow: true };
  return {
    slot: recommendedSlotForType(campaignType, broadcastsUsed),
    inWindow: false,
  };
}

function weekdayName(weekday: ClubZonedParts["weekday"]): string {
  return WEEKDAY_LABEL[weekday];
}

export function evaluateBroadcastCadence(input: {
  now: Date;
  campaignType: CampaignType;
  broadcasts: readonly CadenceBroadcastRecord[];
  /** Exclude the campaign currently being launched so retries do not self-block. */
  ignoreCampaignId?: string;
  timeZone?: string;
}): CadenceVerdict {
  const timeZone = input.timeZone ?? CLUB_CADENCE_TIMEZONE;
  const week = clubWeekBounds(input.now, timeZone);
  const broadcasts = input.broadcasts
    .filter((row) => row.id !== input.ignoreCampaignId)
    .filter((row) => {
      const at = new Date(row.launchedAt);
      return at.getTime() >= week.start.getTime() && at.getTime() < week.end.getTime();
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(a.launchedAt).getTime() - new Date(b.launchedAt).getTime(),
    );

  const broadcastsUsed = broadcasts.length;
  const promotionsUsed = broadcasts.filter(
    (row) => row.campaignType === "promotion",
  ).length;
  const last = broadcasts.at(-1) ?? null;
  const hoursSinceLastBroadcast = last
    ? hoursBetween(input.now, new Date(last.launchedAt))
    : null;

  const blockers: CadenceIssue[] = [];
  const warnings: CadenceIssue[] = [];

  if (broadcastsUsed >= CLUB_HARD_BROADCASTS_PER_WEEK) {
    blockers.push({
      code: "weekly-cap",
      message: `This Club week already has ${broadcastsUsed} broadcasts. The hard cap is ${CLUB_HARD_BROADCASTS_PER_WEEK}. Next week opens ${formatClubLocal(week.end, timeZone)}.`,
    });
  } else if (
    broadcastsUsed >= CLUB_DEFAULT_BROADCASTS_PER_WEEK &&
    !isClubPeakCampaignType(input.campaignType)
  ) {
    blockers.push({
      code: "peak-type",
      message:
        "A third Club email this week is only for launches, restocks, seasonal edits, or announcements — not another promo or newsletter.",
    });
  }

  if (
    input.campaignType === "promotion" &&
    promotionsUsed >= CLUB_MAX_PROMOTIONS_PER_WEEK
  ) {
    blockers.push({
      code: "promo-cap",
      message:
        "This Club week already has a subscriber-offer broadcast. Pair the remaining slot with a drop, restock, or editorial — not a second discount.",
    });
  }

  let nextAllowedAt: Date | null = null;
  if (
    last &&
    hoursSinceLastBroadcast !== null &&
    hoursSinceLastBroadcast < CLUB_MIN_HOURS_BETWEEN_BROADCASTS
  ) {
    nextAllowedAt = addHours(
      new Date(last.launchedAt),
      CLUB_MIN_HOURS_BETWEEN_BROADCASTS,
    );
    blockers.push({
      code: "min-gap",
      message: `Club broadcasts need a ${CLUB_MIN_HOURS_BETWEEN_BROADCASTS}-hour rest. Next send opens ${formatClubLocal(nextAllowedAt, timeZone)}.`,
    });
  }

  const matched = slotForNow(
    input.now,
    input.campaignType,
    week,
    broadcastsUsed,
    timeZone,
  );
  if (!matched.inWindow && blockers.length === 0) {
    const recommended = slotInstantInWeek(matched.slot, week, timeZone);
    const recommendedThisWeek = recommended.getTime() > input.now.getTime();
    warnings.push({
      code: "off-window",
      message: recommendedThisWeek
        ? `Recommended window: ${matched.slot.label} · ${weekdayName(matched.slot.weekday)} ${String(matched.slot.hour).padStart(2, "0")}:${String(matched.slot.minute).padStart(2, "0")} PT. Sending now is allowed if the weekly cap is open.`
        : `This is outside the ${matched.slot.label} window (${matched.slot.summary}). The weekly cap still governs whether it can go out.`,
    });
  }

  if (
    broadcastsUsed === CLUB_DEFAULT_BROADCASTS_PER_WEEK &&
    isClubPeakCampaignType(input.campaignType) &&
    blockers.length === 0
  ) {
    warnings.push({
      code: "peak-slot",
      message:
        "This uses the Saturday peak slot. Skip next week’s extra send if opens or unsubscribes wobble.",
    });
  }

  const allowed = blockers.length === 0;
  return {
    allowed,
    slot: matched.inWindow ? matched.slot.id : "off-cadence",
    inRecommendedWindow: matched.inWindow,
    broadcastsUsed,
    broadcastsRemaining: Math.max(
      0,
      CLUB_HARD_BROADCASTS_PER_WEEK - broadcastsUsed,
    ),
    promotionsUsed,
    hoursSinceLastBroadcast,
    nextAllowedAt: nextAllowedAt ? nextAllowedAt.toISOString() : null,
    blockers,
    warnings,
  };
}

export type ClubSlotStatus = "sent" | "open" | "upcoming" | "missed" | "blocked";

export type ClubSlotView = {
  id: ClubSlotId;
  label: string;
  summary: string;
  recommendedAt: string;
  recommendedLocal: string;
  status: ClubSlotStatus;
  filledBy: CadenceBroadcastRecord | null;
};

function assignBroadcastsToSlots(
  broadcasts: readonly CadenceBroadcastRecord[],
  week: ClubWeekBounds,
  timeZone: string,
): Map<ClubSlotId, CadenceBroadcastRecord> {
  const assigned = new Map<ClubSlotId, CadenceBroadcastRecord>();
  const unused = [...broadcasts];
  for (const slot of CLUB_SLOTS) {
    const start = slotInstantInWeek(slot, week, timeZone);
    const end = addHours(start, slot.windowHours);
    const index = unused.findIndex((row) => {
      const at = new Date(row.launchedAt).getTime();
      return at >= start.getTime() && at < end.getTime();
    });
    if (index >= 0) {
      assigned.set(slot.id, unused[index]);
      unused.splice(index, 1);
    }
  }
  for (const slot of CLUB_SLOTS) {
    if (assigned.has(slot.id) || unused.length === 0) continue;
    assigned.set(slot.id, unused.shift()!);
  }
  return assigned;
}

export function buildClubWeekView(input: {
  now: Date;
  broadcasts: readonly CadenceBroadcastRecord[];
  timeZone?: string;
}): {
  week: ClubWeekBounds;
  slots: ClubSlotView[];
  nextSlot: ClubSlotView | null;
} {
  const timeZone = input.timeZone ?? CLUB_CADENCE_TIMEZONE;
  const week = clubWeekBounds(input.now, timeZone);
  const inWeek = input.broadcasts
    .filter((row) => {
      const at = new Date(row.launchedAt);
      return at.getTime() >= week.start.getTime() && at.getTime() < week.end.getTime();
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(a.launchedAt).getTime() - new Date(b.launchedAt).getTime(),
    );
  const assigned = assignBroadcastsToSlots(inWeek, week, timeZone);
  const slots: ClubSlotView[] = CLUB_SLOTS.map((slot) => {
    const recommendedAt = slotInstantInWeek(slot, week, timeZone);
    const windowEnd = addHours(recommendedAt, slot.windowHours);
    const filledBy = assigned.get(slot.id) ?? null;
    let status: ClubSlotStatus;
    if (filledBy) {
      status = "sent";
    } else if (
      slot.peakOnly &&
      inWeek.length < CLUB_DEFAULT_BROADCASTS_PER_WEEK
    ) {
      status = "blocked";
    } else if (input.now.getTime() < recommendedAt.getTime()) {
      status = "upcoming";
    } else if (input.now.getTime() < windowEnd.getTime()) {
      status = "open";
    } else if (inWeek.length >= CLUB_HARD_BROADCASTS_PER_WEEK) {
      status = "blocked";
    } else {
      status = "missed";
    }
    return {
      id: slot.id,
      label: slot.label,
      summary: slot.summary,
      recommendedAt: recommendedAt.toISOString(),
      recommendedLocal: formatClubLocal(recommendedAt, timeZone),
      status,
      filledBy,
    };
  });
  const nextSlot =
    slots.find((slot) => slot.status === "open") ??
    slots.find((slot) => slot.status === "upcoming") ??
    slots.find((slot) => slot.status === "missed") ??
    null;
  return { week, slots, nextSlot };
}

export function subscriberInWelcomeHoldout(
  subscribedAt: Date,
  now: Date,
): boolean {
  return hoursBetween(now, subscribedAt) < CLUB_WELCOME_HOLDOUT_HOURS;
}

export function subscriberInSmartSendingHoldout(
  lastMarketingSentAt: Date | null,
  now: Date,
): boolean {
  if (!lastMarketingSentAt) return false;
  return hoursBetween(now, lastMarketingSentAt) < CLUB_SMART_SENDING_HOURS;
}

export function welcomeFollowupDue(input: {
  step: 2 | 3;
  previousSentAt: Date;
  lastMarketingSentAt: Date | null;
  now: Date;
}): boolean {
  const delayHours =
    input.step === 2
      ? CLUB_WELCOME_STEP2_DELAY_HOURS
      : CLUB_WELCOME_STEP3_DELAY_HOURS;
  if (hoursBetween(input.now, input.previousSentAt) < delayHours) return false;
  if (subscriberInSmartSendingHoldout(input.lastMarketingSentAt, input.now)) {
    return false;
  }
  return true;
}

export function clubEmailUrl(
  path: string,
  campaign: string,
  content?: string,
): string {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `https://y2kase.com${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (!url.searchParams.has("utm_source")) {
    url.searchParams.set("utm_source", "email");
  }
  if (!url.searchParams.has("utm_medium")) {
    url.searchParams.set("utm_medium", "club");
  }
  if (!url.searchParams.has("utm_campaign")) {
    url.searchParams.set("utm_campaign", campaign);
  }
  if (content && !url.searchParams.has("utm_content")) {
    url.searchParams.set("utm_content", content);
  }
  return url.toString();
}

export const CLUB_CADENCE_COPY = {
  headline: "Two Club emails a week. Flows when they matter.",
  promise:
    "You'll get Club Drop on Tuesdays, a subscriber note on Thursdays, and a short welcome series when you join. That's the whole cadence — leave anytime.",
  operator:
    "Campaign Studio will refuse a third promo, a same-day double send, or a broadcast into someone still in the 48-hour welcome holdout.",
} as const;

export type CadenceHoldoutCounts = {
  active: number;
  welcomeHoldout: number;
  smartSendingHoldout: number;
  campaignEligible: number;
};

export type CadenceSnapshot = {
  timezone: string;
  weekStartIso: string;
  weekEndIso: string;
  weekLabel: string;
  broadcastsThisWeek: CadenceBroadcastRecord[];
  slots: ClubSlotView[];
  nextSlot: ClubSlotView | null;
  holdouts: CadenceHoldoutCounts;
};
