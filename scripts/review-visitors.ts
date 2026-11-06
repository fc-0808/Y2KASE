/**
 * Review recent visits and print which ones look like scripts.
 *
 *   npm run visitors:review
 *   npm run visitors:review -- 48
 *
 * The number is how many hours back to read. It defaults to 24.
 * China, Taiwan, and Hong Kong are included here. The Visitors page hides
 * those countries, so a crawler landing there is invisible on that page.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Hong_Kong",
});

async function main() {
  const hours = positiveHours(process.argv[2]);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const { and, desc, gte, isNull, notInArray, or } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { pageViews } = await import("../src/lib/db/schema");
  const { reviewVisitors } = await import("../src/lib/analytics/visitor-review");
  const { DASHBOARD_EXCLUDED_USER_IDS, DASHBOARD_EXCLUDED_VISITOR_IDS } =
    await import("../src/lib/analytics");

  const rows = await db
    .select({
      id: pageViews.id,
      visitorId: pageViews.visitorId,
      userId: pageViews.userId,
      path: pageViews.path,
      referrer: pageViews.referrer,
      country: pageViews.country,
      city: pageViews.city,
      ip: pageViews.ip,
      userAgent: pageViews.userAgent,
      device: pageViews.device,
      secChUa: pageViews.secChUa,
      secChUaFullVersionList: pageViews.secChUaFullVersionList,
      secChUaPlatform: pageViews.secChUaPlatform,
      secChUaPlatformVersion: pageViews.secChUaPlatformVersion,
      ja4Digest: pageViews.ja4Digest,
      createdAt: pageViews.createdAt,
    })
    .from(pageViews)
    .where(
      and(
        gte(pageViews.createdAt, since),
        or(
          isNull(pageViews.ip),
          notInArray(pageViews.ip, ["::1", "127.0.0.1", "0.0.0.0"]),
        ),
        or(
          isNull(pageViews.userId),
          notInArray(pageViews.userId, [...DASHBOARD_EXCLUDED_USER_IDS]),
        ),
        notInArray(pageViews.visitorId, [...DASHBOARD_EXCLUDED_VISITOR_IDS]),
      ),
    )
    .orderBy(desc(pageViews.createdAt))
    .limit(2000);

  const verdicts = new Map(reviewVisitors(rows).map((verdict) => [verdict.id, verdict]));
  const crawlers = rows.filter((row) => verdicts.get(row.id)?.crawler);
  const people = new Set(rows.map((row) => row.visitorId));
  const crawlerPeople = new Set(crawlers.map((row) => row.visitorId));

  console.log(
    `Last ${hours} hours: ${people.size} visitors, ${crawlerPeople.size} crawlers, ${people.size - crawlerPeople.size} shoppers`,
  );
  if (crawlers.length === 0) {
    console.log("No crawler rows in this window.");
    return;
  }
  console.log("");
  for (const row of crawlers) {
    const when = timeFmt.format(new Date(row.createdAt));
    const place = [row.country ?? "??", row.city].filter(Boolean).join(" ");
    const reasons = verdicts.get(row.id)?.reasons.join("; ");
    console.log(`${when}  ${place}  ${row.path}`);
    console.log(`  ${reasons}`);
  }
}

function positiveHours(value: string | undefined): number {
  const hours = Number(value ?? 24);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) return 24;
  return hours;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
