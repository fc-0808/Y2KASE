/**
 * Self-check for the admin Today desk.
 *
 *   npx tsx scripts/check-today-desk.ts
 *
 * The desk is a view over Club cadence plus a handful of counts. These
 * assertions lock the order, the copy, and the clocks an operator in
 * another timezone actually sees.
 */
import assert from "node:assert/strict";

import {
  buildTodayDesk,
  formatLocalWindow,
  formatPtWindow,
  nextDeskLine,
  withInbox,
  TODAY_DESK_LIMIT,
  type TodayDeskInput,
} from "../src/lib/admin/today-desk";
import {
  addHours,
  slotInstantInWeek,
  clubWeekBounds,
  zonedInstant,
  CLUB_SLOTS,
  type CadenceBroadcastRecord,
} from "../src/lib/marketing/cadence";

function broadcast(id: string, at: Date, campaignType: CadenceBroadcastRecord["campaignType"] = "newsletter"): CadenceBroadcastRecord {
  return { id, name: id, campaignType, launchedAt: at.toISOString() };
}

function desk(
  now: Date,
  extra: Partial<TodayDeskInput> = {},
) {
  return buildTodayDesk({
    now,
    paidOrders: 0,
    pendingReviews: 0,
    broadcasts: [],
    igPostedToday: 1,
    igPostsPerDay: 1,
    ...extra,
  });
}

const monday = zonedInstant(2026, 9, 7, 9, 0);
const tuesdayOpen = zonedInstant(2026, 9, 8, 11, 0);
const wednesday = zonedInstant(2026, 9, 9, 12, 0);
const thursdayOpen = zonedInstant(2026, 9, 10, 9, 0);
const friday = zonedInstant(2026, 9, 11, 15, 0);
const saturdayPeak = zonedInstant(2026, 9, 12, 10, 0);

const dropStart = zonedInstant(2026, 9, 8, 10, 0);
assert.equal(formatPtWindow(dropStart, addHours(dropStart, 4)), "Tue 10:00–14:00 PT");
assert.equal(
  formatLocalWindow(dropStart.toISOString(), addHours(dropStart, 4).toISOString(), "Asia/Shanghai"),
  "Wed 01:00–05:00 your time",
);
assert.equal(
  formatLocalWindow(
    zonedInstant(2026, 9, 10, 8, 0).toISOString(),
    zonedInstant(2026, 9, 10, 12, 0).toISOString(),
    "Asia/Shanghai",
  ),
  "Thu 23:00–Fri 03:00 your time",
);
assert.equal(
  formatLocalWindow(dropStart.toISOString(), addHours(dropStart, 4).toISOString(), "America/Los_Angeles"),
  null,
);

const quietMonday = desk(monday);
assert.equal(quietMonday.clubHeadline, "0 of 2 Club emails");
assert.equal(quietMonday.clubTone, "clear");
assert.deepEqual(
  quietMonday.items.map((item) => item.id),
  [],
);
assert.equal(quietMonday.next?.kind, "later-this-week");
assert.equal(quietMonday.next?.label, "Club Drop");
assert.equal(quietMonday.next?.when, "Tue 10:00–14:00 PT");
assert.match(nextDeskLine(quietMonday.next!), /^Next · Club Drop/);

const openDrop = desk(tuesdayOpen);
assert.equal(openDrop.clubTone, "open");
assert.equal(openDrop.items.length, 1);
assert.equal(openDrop.items[0]?.id, "club-drop");
assert.equal(openDrop.items[0]?.tone, "open");
assert.equal(openDrop.items[0]?.title, "Club Drop is open");
assert.equal(openDrop.items[0]?.href, "/admin/campaigns");
assert.equal(openDrop.items[0]?.clock, "Tue 10:00–14:00 PT");
assert.equal(openDrop.next?.label, "Club Promo");
assert.equal(openDrop.next?.when, "Thu 08:00–12:00 PT");

const afterDrop = desk(wednesday, {
  broadcasts: [broadcast("drop", tuesdayOpen)],
});
assert.equal(afterDrop.clubHeadline, "1 of 2 Club emails");
assert.equal(afterDrop.clubTone, "clear");
assert.deepEqual(
  afterDrop.items.map((item) => item.id),
  [],
);
assert.equal(afterDrop.next?.label, "Club Promo");

const thursday = desk(thursdayOpen);
assert.deepEqual(
  thursday.items.map((item) => item.id),
  ["club-promo", "club-drop"],
);
assert.equal(thursday.items[0]?.tone, "open");
assert.equal(thursday.items[0]?.title, "Club Promo is open");
assert.equal(thursday.items[1]?.title, "Club Drop still owed");
assert.equal(thursday.items[1]?.tone, "attention");

const missedWeek = desk(friday);
assert.equal(missedWeek.clubTone, "owed");
assert.deepEqual(
  missedWeek.items.map((item) => item.id),
  ["club-drop", "club-promo"],
);
assert.equal(missedWeek.next, null);
assert.ok(missedWeek.items.every((item) => item.tone === "attention"));

const done = desk(friday, {
  broadcasts: [
    broadcast("drop", tuesdayOpen),
    broadcast("promo", thursdayOpen, "promotion"),
  ],
});
assert.equal(done.clubHeadline, "Club is done this week");
assert.equal(done.clubTone, "done");
assert.deepEqual(
  done.items.map((item) => item.id),
  [],
);
assert.equal(done.next?.kind, "next-week");
assert.match(done.next?.when ?? "", /Sep 15/);
assert.match(done.next?.when ?? "", /10:00 PT/);
assert.match(nextDeskLine(done.next!), /^Next Club Drop/);

const peak = desk(saturdayPeak, {
  broadcasts: [
    broadcast("drop", tuesdayOpen),
    broadcast("promo", thursdayOpen, "promotion"),
  ],
});
assert.equal(peak.clubTone, "done");
assert.ok(!peak.items.some((item) => item.id === "peak-extra"));
assert.equal(peak.next?.kind, "next-week");

const ranked = desk(tuesdayOpen, {
  paidOrders: 2,
  pendingReviews: 1,
  igPostedToday: 0,
  igPostsPerDay: 1,
});
assert.deepEqual(
  ranked.items.map((item) => item.id),
  ["orders", "reviews", "club-drop", "instagram"],
);
assert.equal(ranked.items[0]?.title, "Ship 2 paid orders");
assert.equal(ranked.items[0]?.href, "/admin/orders?status=paid");
assert.equal(ranked.items[0]?.tone, "urgent");
assert.equal(ranked.items[1]?.title, "Moderate 1 review");
assert.equal(ranked.items[1]?.href, "/admin/reviews?status=pending");
assert.equal(ranked.items[3]?.title, "Instagram for today");
assert.equal(ranked.items[3]?.href, "/admin/social/instagram");

const oneOrder = desk(monday, { paidOrders: 1, igPostedToday: 1 });
assert.equal(oneOrder.items[0]?.title, "Ship 1 paid order");

const withMail = withInbox(ranked.items, 3);
assert.deepEqual(
  withMail.map((item) => item.id),
  ["orders", "reviews", "club-drop", "inbox", "instagram"],
);
assert.equal(withMail.find((item) => item.id === "inbox")?.title, "Reply to 3 unread emails");
assert.equal(withMail.find((item) => item.id === "inbox")?.href, "/admin/inbox");

const fullFriday = desk(friday, {
  paidOrders: 2,
  pendingReviews: 1,
  igPostedToday: 0,
  igPostsPerDay: 1,
});
assert.deepEqual(
  fullFriday.items.map((item) => item.id),
  ["orders", "reviews", "club-drop", "club-promo", "instagram"],
);
const capped = withInbox(fullFriday.items, 4);
assert.equal(capped.length, TODAY_DESK_LIMIT);
assert.deepEqual(
  capped.map((item) => item.id),
  ["orders", "reviews", "club-drop", "club-promo", "inbox"],
);

const unknownClub = desk(tuesdayOpen, { clubKnown: false, broadcasts: [] });
assert.equal(unknownClub.clubHeadline, "Club calendar unavailable");
assert.equal(unknownClub.next, null);
assert.ok(!unknownClub.items.some((item) => item.id.startsWith("club-")));

const unknownIg = desk(monday, { igPostedToday: null, igPostsPerDay: 1 });
assert.ok(!unknownIg.items.some((item) => item.id === "instagram"));

const posted = desk(monday, { igPostedToday: 1, igPostsPerDay: 1 });
assert.ok(!posted.items.some((item) => item.id === "instagram"));

assert.equal(withInbox(quietMonday.items, 0).length, 0);
assert.equal(withInbox(quietMonday.items, 1)[0]?.title, "Reply to 1 unread email");

const week = clubWeekBounds(saturdayPeak);
const nextDrop = slotInstantInWeek(CLUB_SLOTS[0], clubWeekBounds(week.end));
assert.equal(nextDrop.toISOString(), zonedInstant(2026, 9, 15, 10, 0).toISOString());

console.log("check-today-desk: ok");
