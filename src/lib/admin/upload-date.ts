/**
 * Upload-date facet for the product admin.
 *
 * A listing's upload instant is `products.created_at`. Days are civil dates in
 * the shop's timezone, not UTC and not a rolling 24-hour window: an ingest
 * that runs across midnight local time must not split one working session
 * across two days, and the server render must bucket the same way the browser
 * does. Asia/Shanghai has no daylight-saving shift, so adding calendar days to
 * a `YYYY-MM-DD` key is exact.
 */

export const CATALOG_TIME_ZONE = "Asia/Shanghai";

export type UploadWindow =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "7d" }
  | { kind: "30d" }
  | { kind: "day"; day: string };

/** `review` keeps drafts first. The other two order purely by upload time. */
export type UploadSort = "review" | "newest" | "oldest";

export type UploadBatch = {
  /** Civil date, `YYYY-MM-DD`, in {@link CATALOG_TIME_ZONE}. */
  day: string;
  count: number;
  /** "Today", "Yesterday", or "Sep 22". */
  label: string;
};

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CATALOG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const dayLongFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const stampDayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CATALOG_TIME_ZONE,
  month: "short",
  day: "numeric",
});

const stampTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CATALOG_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  active: 1,
  archived: 2,
};

function asDate(input: Date | string): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function civilDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

/** `YYYY-MM-DD` for an instant, in the catalog timezone. */
export function uploadDayKey(input: Date | string): string {
  const date = asDate(input);
  return date ? dayKeyFormat.format(date) : "";
}

export function shiftUploadDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

export function uploadDayLabel(day: string, today = uploadDayKey(new Date())): string {
  if (day === today) return "Today";
  if (day === shiftUploadDay(today, -1)) return "Yesterday";
  return dayLabelFormat.format(civilDate(day));
}

export function formatUploadDayLong(day: string): string {
  return dayLongFormat.format(civilDate(day));
}

export function formatUploadDay(input: Date | string): string {
  const date = asDate(input);
  return date ? stampDayFormat.format(date) : "";
}

export function formatUploadTime(input: Date | string): string {
  const date = asDate(input);
  return date ? stampTimeFormat.format(date) : "";
}

export function parseUploadWindow(raw: string | undefined | null): UploadWindow {
  if (!raw || raw === "all") return { kind: "all" };
  if (raw === "today" || raw === "7d" || raw === "30d") return { kind: raw };
  if (DAY_KEY.test(raw)) {
    const [year, month, date] = raw.split("-").map(Number);
    const civil = new Date(Date.UTC(year, month - 1, date));
    if (
      civil.getUTCFullYear() === year &&
      civil.getUTCMonth() === month - 1 &&
      civil.getUTCDate() === date
    ) {
      return { kind: "day", day: raw };
    }
  }
  return { kind: "all" };
}

export function parseUploadSort(raw: string | undefined | null): UploadSort {
  if (raw === "newest" || raw === "oldest" || raw === "review") return raw;
  return "review";
}

/** Query value for a window. `null` means the param should be omitted. */
export function uploadWindowParam(window: UploadWindow): string | null {
  if (window.kind === "all") return null;
  if (window.kind === "day") return window.day;
  return window.kind;
}

export function matchesUploadWindow(
  createdAt: string,
  window: UploadWindow,
  today = uploadDayKey(new Date()),
): boolean {
  if (window.kind === "all") return true;
  const day = uploadDayKey(createdAt);
  if (!day) return false;
  if (window.kind === "today") return day === today;
  if (window.kind === "day") return day === window.day;
  const span = window.kind === "7d" ? 6 : 29;
  return day >= shiftUploadDay(today, -span) && day <= today;
}

export function uploadBatches(
  items: readonly { createdAt: string }[],
  today = uploadDayKey(new Date()),
): UploadBatch[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const day = uploadDayKey(item.createdAt);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, count]) => ({
      day,
      count,
      label: uploadDayLabel(day, today),
    }));
}

export function countInWindow(
  items: readonly { createdAt: string }[],
  window: UploadWindow,
  today = uploadDayKey(new Date()),
): number {
  let n = 0;
  for (const item of items) {
    if (matchesUploadWindow(item.createdAt, window, today)) n += 1;
  }
  return n;
}

export function compareProductsByUpload<
  T extends { id: number; status: string; createdAt: string },
>(a: T, b: T, sort: UploadSort): number {
  if (sort === "review") {
    const status =
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (status !== 0) return status;
  }
  const newestFirst = sort !== "oldest";
  if (a.createdAt !== b.createdAt) {
    return newestFirst
      ? a.createdAt < b.createdAt
        ? 1
        : -1
      : a.createdAt < b.createdAt
        ? -1
        : 1;
  }
  return newestFirst ? b.id - a.id : a.id - b.id;
}

export function uploadWindowSummary(window: UploadWindow): string | null {
  if (window.kind === "all") return null;
  if (window.kind === "today") return "uploaded today";
  if (window.kind === "7d") return "uploaded in the last 7 days";
  if (window.kind === "30d") return "uploaded in the last 30 days";
  return `uploaded on ${formatUploadDayLong(window.day)}`;
}
