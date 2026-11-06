/**
 * Reads stored visit rows and says which ones are scripts.
 *
 * One row can condemn itself when a header disagrees with a real browser.
 * A shared JA4 is not enough: every person on the same Chrome version shares
 * one. A fingerprint becomes a crawler only when several new visitors use it
 * for a single page, with no referrer and no signed-in user, across several
 * places.
 */

export type VisitorReviewRow = {
  id: number;
  visitorId: string;
  userId?: string | null;
  referrer?: string | null;
  country?: string | null;
  city?: string | null;
  userAgent?: string | null;
  device?: string | null;
  secChUa?: string | null;
  secChUaFullVersionList?: string | null;
  secChUaPlatform?: string | null;
  secChUaPlatformVersion?: string | null;
  ja4Digest?: string | null;
};

export type VisitorVerdict = {
  id: number;
  crawler: boolean;
  reasons: string[];
};

const CATALOG_CRAWLER_VERSION = /Chrome\/14[89]\.0\.0\.0|Chrome\/150\.0\.0\.0/;
const CATALOG_CRAWLER_EXCEPTION = /Mobile|Edg\/|OPR\/|Ecosia/i;

export function reviewVisitor(visit: VisitorReviewRow): VisitorVerdict {
  const reasons: string[] = [];
  const hints = `${visit.secChUa ?? ""} ${visit.secChUaFullVersionList ?? ""} ${visit.userAgent ?? ""}`;
  if (/HeadlessChrome/i.test(hints)) {
    reasons.push("Headless Chrome in the client hints");
  }
  if (/Mac OS X/i.test(visit.secChUaPlatform ?? "")) {
    reasons.push("Platform hint is Mac OS X, copied from the user agent");
  }
  if (plain(visit.secChUaPlatformVersion) === "10_15_7") {
    reasons.push("Platform version 10_15_7 is copied from the user agent");
  }
  if (isOldDesktopChromePreset(visit)) {
    reasons.push("Desktop Chrome 148–150 preset");
  }
  const versionGap = chromeVersionGap(visit);
  if (versionGap) reasons.push(versionGap);
  const platformGap = platformGapReason(visit);
  if (platformGap) reasons.push(platformGap);
  return { id: visit.id, crawler: reasons.length > 0, reasons };
}

export function reviewVisitors(visits: VisitorReviewRow[]): VisitorVerdict[] {
  const verdicts = new Map(visits.map((visit) => [visit.id, reviewVisitor(visit)]));
  for (const ids of crawlerClusters(visits)) {
    const members = visits.filter((visit) => ids.has(visit.id));
    const countries = new Set(members.map((visit) => visit.country).filter(Boolean));
    const cities = new Set(members.map((visit) => visit.city).filter(Boolean));
    const where =
      countries.size >= 3
        ? `${countries.size} countries`
        : `${cities.size} cities`;
    const reason = `Same fingerprint on ${ids.size} one-page visits in ${where}, none with a referrer`;
    for (const id of ids) {
      const verdict = verdicts.get(id);
      if (!verdict || verdict.reasons.includes(reason)) continue;
      verdict.reasons.push(reason);
      verdict.crawler = true;
    }
  }
  return visits.map((visit) => verdicts.get(visit.id)!);
}

function crawlerClusters(visits: VisitorReviewRow[]): Array<Set<number>> {
  const byFingerprint = new Map<string, VisitorReviewRow[]>();
  for (const visit of visits) {
    const fingerprint = visit.ja4Digest?.trim();
    if (!fingerprint) continue;
    const group = byFingerprint.get(fingerprint) ?? [];
    group.push(visit);
    byFingerprint.set(fingerprint, group);
  }

  const clusters: Array<Set<number>> = [];
  for (const group of byFingerprint.values()) {
    const byVisitor = new Map<string, VisitorReviewRow[]>();
    for (const visit of group) {
      const rows = byVisitor.get(visit.visitorId) ?? [];
      rows.push(visit);
      byVisitor.set(visit.visitorId, rows);
    }
    const people = [...byVisitor.values()];
    if (people.length < 3) continue;
    if (people.some((rows) => rows.length > 1)) continue;
    if (people.some((rows) => rows.some((row) => row.userId))) continue;
    if (people.some((rows) => rows.some((row) => (row.referrer ?? "").trim()))) continue;
    const countries = new Set(people.map((rows) => rows[0]?.country).filter(Boolean));
    const cities = new Set(people.map((rows) => rows[0]?.city).filter(Boolean));
    const spreadOut = countries.size >= 3 || (people.length >= 5 && cities.size >= 5);
    if (!spreadOut) continue;
    clusters.push(new Set(people.map((rows) => rows[0]!.id)));
  }
  return clusters;
}

function isOldDesktopChromePreset(visit: VisitorReviewRow): boolean {
  const ua = visit.userAgent ?? "";
  if (!CATALOG_CRAWLER_VERSION.test(ua)) return false;
  if (CATALOG_CRAWLER_EXCEPTION.test(ua)) return false;
  return !visit.device || visit.device === "desktop";
}

function chromeVersionGap(visit: VisitorReviewRow): string | null {
  const listed = majorFromFullList(visit.secChUaFullVersionList ?? "");
  const claimed = majorFromUserAgent(visit.userAgent ?? "");
  if (listed == null || claimed == null || Math.abs(listed - claimed) < 2) return null;
  return `Full version list says ${listed} while the user agent says ${claimed}`;
}

function platformGapReason(visit: VisitorReviewRow): string | null {
  const hinted = family(visit.secChUaPlatform ?? "");
  const claimed = family(visit.userAgent ?? "");
  if (!hinted || !claimed || hinted === claimed) return null;
  if (
    (claimed === "android" && hinted === "linux") ||
    (claimed === "ios" && hinted === "macos")
  ) {
    return null;
  }
  return "Platform hint disagrees with the user agent";
}

function majorFromFullList(value: string): number | null {
  const brands = [...value.matchAll(/"([^"]+)";v="(\d+)/g)];
  const chrome = brands.find(
    (brand) => /chrome/i.test(brand[1] ?? "") && !/headless/i.test(brand[1] ?? ""),
  );
  const headless = brands.find((brand) => /headlesschrome/i.test(brand[1] ?? ""));
  const version = headless?.[2] ?? chrome?.[2];
  return version ? Number(version) : null;
}

function majorFromUserAgent(value: string): number | null {
  const match = /Chrome\/(\d+)/.exec(value);
  return match ? Number(match[1]) : null;
}

function family(value: string): string | null {
  const text = plain(value).toLowerCase();
  if (!text) return null;
  if (/iphone|ipad|ipod|\bios\b/.test(text)) return "ios";
  if (/android/.test(text)) return "android";
  if (/cros|chrome\s?os/.test(text)) return "chromeos";
  if (/mac|darwin/.test(text)) return "macos";
  if (/windows|win64|win32/.test(text)) return "windows";
  if (/linux/.test(text)) return "linux";
  return null;
}

function plain(value: string | null | undefined): string {
  return (value ?? "").replaceAll('"', "").trim();
}
