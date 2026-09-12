/**
 * Self-check for Y2KASE Club email cadence.
 *
 *   npm run marketing:check
 *
 * Pure functions only. These rules are the difference between a 25-person
 * list looking like a brand and looking like a firehose.
 */
import assert from "node:assert/strict";

import {
  CLUB_CADENCE_TIMEZONE,
  CLUB_DEFAULT_BROADCASTS_PER_WEEK,
  CLUB_HARD_BROADCASTS_PER_WEEK,
  CLUB_MAX_PROMOTIONS_PER_WEEK,
  CLUB_MIN_HOURS_BETWEEN_BROADCASTS,
  CLUB_PEAK_BROADCASTS_PER_WEEK,
  CLUB_SLOTS,
  CLUB_SMART_SENDING_HOURS,
  CLUB_WELCOME_HOLDOUT_HOURS,
  CLUB_WELCOME_STEP2_DELAY_HOURS,
  CLUB_WELCOME_STEP3_DELAY_HOURS,
  addHours,
  buildClubWeekView,
  clubEmailUrl,
  clubWeekBounds,
  evaluateBroadcastCadence,
  formatClubLocal,
  hoursBetween,
  recommendedSlotForType,
  subscriberInSmartSendingHoldout,
  subscriberInWelcomeHoldout,
  welcomeFollowupDue,
  zonedInstant,
  zonedParts,
  type CadenceBroadcastRecord,
} from "../src/lib/marketing/cadence";
import {
  EMAIL_STUDIO_DEFAULT_VIEW,
  EMAIL_STUDIO_PATH,
  EMAIL_STUDIO_VIEWS,
  emailStudioHref,
  parseEmailStudioView,
} from "../src/lib/marketing/types";
import { REDIRECTS } from "../src/lib/routes";

assert.equal(CLUB_DEFAULT_BROADCASTS_PER_WEEK, 2);
assert.equal(CLUB_PEAK_BROADCASTS_PER_WEEK, 3);
assert.equal(CLUB_HARD_BROADCASTS_PER_WEEK, 3);
assert.equal(CLUB_MAX_PROMOTIONS_PER_WEEK, 1);
assert.equal(CLUB_MIN_HOURS_BETWEEN_BROADCASTS, 36);
assert.equal(CLUB_SMART_SENDING_HOURS, 20);
assert.equal(CLUB_WELCOME_HOLDOUT_HOURS, 48);
assert.equal(CLUB_WELCOME_STEP2_DELAY_HOURS, 48);
assert.equal(CLUB_WELCOME_STEP3_DELAY_HOURS, 72);
assert.equal(CLUB_SLOTS.length, 3);
assert.equal(CLUB_SLOTS[0].id, "club-drop");
assert.equal(CLUB_SLOTS[1].id, "club-promo");
assert.equal(CLUB_SLOTS[2].peakOnly, true);

// PDT: Tuesday 8 Sep 2026 10:00 PT = 17:00 UTC
const tueDrop = zonedInstant(2026, 9, 8, 10, 0);
assert.equal(tueDrop.toISOString(), "2026-09-08T17:00:00.000Z");
const tueParts = zonedParts(tueDrop);
assert.equal(tueParts.weekday, 2);
assert.equal(tueParts.hour, 10);

// PST: Tuesday 13 Jan 2026 10:00 PT = 18:00 UTC
const janDrop = zonedInstant(2026, 1, 13, 10, 0);
assert.equal(janDrop.toISOString(), "2026-01-13T18:00:00.000Z");
assert.equal(zonedParts(janDrop).weekday, 2);

// Sunday 6 Sep 2026 15:00 PT belongs to the week that started Monday 31 Aug.
const sunday = zonedInstant(2026, 9, 6, 15, 0);
const week = clubWeekBounds(sunday);
assert.equal(week.start.toISOString(), zonedInstant(2026, 8, 31, 0, 0).toISOString());
assert.equal(week.end.toISOString(), zonedInstant(2026, 9, 7, 0, 0).toISOString());
assert.match(week.label, /Aug/);
assert.equal(week.timezone, CLUB_CADENCE_TIMEZONE);
assert.ok(formatClubLocal(tueDrop).length > 8);

function broadcast(
  id: string,
  type: CadenceBroadcastRecord["campaignType"],
  at: Date,
): CadenceBroadcastRecord {
  return {
    id,
    name: id,
    campaignType: type,
    launchedAt: at.toISOString(),
  };
}

const emptyTue = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 8, 10, 30),
  campaignType: "newsletter",
  broadcasts: [],
});
assert.equal(emptyTue.allowed, true);
assert.equal(emptyTue.slot, "club-drop");
assert.equal(emptyTue.inRecommendedWindow, true);
assert.equal(emptyTue.broadcastsUsed, 0);
assert.equal(emptyTue.blockers.length, 0);

const thuPromo = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 10, 8, 15),
  campaignType: "promotion",
  broadcasts: [broadcast("a", "newsletter", zonedInstant(2026, 9, 8, 10, 0))],
});
assert.equal(thuPromo.allowed, true);
assert.equal(thuPromo.slot, "club-promo");
assert.equal(thuPromo.broadcastsUsed, 1);

const secondPromo = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 10, 8, 15),
  campaignType: "promotion",
  broadcasts: [broadcast("a", "promotion", zonedInstant(2026, 9, 8, 10, 0))],
});
assert.equal(secondPromo.allowed, false);
assert.ok(secondPromo.blockers.some((issue) => issue.code === "promo-cap"));

const tooSoon = evaluateBroadcastCadence({
  now: addHours(zonedInstant(2026, 9, 8, 10, 0), 12),
  campaignType: "promotion",
  broadcasts: [broadcast("a", "newsletter", zonedInstant(2026, 9, 8, 10, 0))],
});
assert.equal(tooSoon.allowed, false);
assert.ok(tooSoon.blockers.some((issue) => issue.code === "min-gap"));
assert.ok(tooSoon.nextAllowedAt);

const thirdNewsletter = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 12, 9, 30),
  campaignType: "newsletter",
  broadcasts: [
    broadcast("a", "newsletter", zonedInstant(2026, 9, 8, 10, 0)),
    broadcast("b", "announcement", zonedInstant(2026, 9, 10, 8, 0)),
  ],
});
assert.equal(thirdNewsletter.allowed, false);
assert.ok(thirdNewsletter.blockers.some((issue) => issue.code === "peak-type"));

const thirdLaunch = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 12, 9, 30),
  campaignType: "product-launch",
  broadcasts: [
    broadcast("a", "newsletter", zonedInstant(2026, 9, 8, 10, 0)),
    broadcast("b", "promotion", zonedInstant(2026, 9, 10, 8, 0)),
  ],
});
assert.equal(thirdLaunch.allowed, true);
assert.equal(thirdLaunch.slot, "peak-extra");
assert.ok(thirdLaunch.warnings.some((issue) => issue.code === "peak-slot"));

const hardCap = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 12, 12, 0),
  campaignType: "seasonal",
  broadcasts: [
    broadcast("a", "newsletter", zonedInstant(2026, 9, 8, 10, 0)),
    broadcast("b", "promotion", zonedInstant(2026, 9, 10, 8, 0)),
    broadcast("c", "product-launch", zonedInstant(2026, 9, 12, 9, 0)),
  ],
});
assert.equal(hardCap.allowed, false);
assert.ok(hardCap.blockers.some((issue) => issue.code === "weekly-cap"));

const retrySame = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 12, 12, 0),
  campaignType: "seasonal",
  ignoreCampaignId: "c",
  broadcasts: [
    broadcast("a", "newsletter", zonedInstant(2026, 9, 8, 10, 0)),
    broadcast("b", "promotion", zonedInstant(2026, 9, 10, 8, 0)),
    broadcast("c", "product-launch", zonedInstant(2026, 9, 12, 9, 0)),
  ],
});
assert.equal(retrySame.allowed, true, "retrying the in-flight campaign must not self-block");

const offWindow = evaluateBroadcastCadence({
  now: zonedInstant(2026, 9, 9, 16, 0),
  campaignType: "newsletter",
  broadcasts: [],
});
assert.equal(offWindow.allowed, true);
assert.equal(offWindow.slot, "off-cadence");
assert.ok(offWindow.warnings.some((issue) => issue.code === "off-window"));

assert.equal(recommendedSlotForType("promotion", 0).id, "club-promo");
assert.equal(recommendedSlotForType("newsletter", 0).id, "club-drop");
assert.equal(recommendedSlotForType("seasonal", 2).id, "peak-extra");

const view = buildClubWeekView({
  now: zonedInstant(2026, 9, 8, 11, 0),
  broadcasts: [broadcast("a", "newsletter", zonedInstant(2026, 9, 8, 10, 15))],
});
assert.equal(view.slots[0].status, "sent");
assert.equal(view.slots[0].filledBy?.id, "a");
assert.equal(view.slots[1].status, "upcoming");
assert.equal(view.slots[2].status, "blocked");

const joined = zonedInstant(2026, 9, 8, 10, 0);
assert.equal(
  subscriberInWelcomeHoldout(joined, addHours(joined, 47)),
  true,
);
assert.equal(
  subscriberInWelcomeHoldout(joined, addHours(joined, 48)),
  false,
);
assert.equal(
  subscriberInSmartSendingHoldout(joined, addHours(joined, 19)),
  true,
);
assert.equal(
  subscriberInSmartSendingHoldout(joined, addHours(joined, 20)),
  false,
);
assert.equal(subscriberInSmartSendingHoldout(null, new Date()), false);

assert.equal(
  welcomeFollowupDue({
    step: 2,
    previousSentAt: joined,
    lastMarketingSentAt: joined,
    now: addHours(joined, 47),
  }),
  false,
);
assert.equal(
  welcomeFollowupDue({
    step: 2,
    previousSentAt: joined,
    lastMarketingSentAt: joined,
    now: addHours(joined, 48),
  }),
  true,
);
assert.equal(
  welcomeFollowupDue({
    step: 3,
    previousSentAt: addHours(joined, 48),
    lastMarketingSentAt: addHours(joined, 48),
    now: addHours(joined, 48 + 71),
  }),
  false,
);
assert.equal(
  welcomeFollowupDue({
    step: 3,
    previousSentAt: addHours(joined, 48),
    lastMarketingSentAt: addHours(joined, 48),
    now: addHours(joined, 48 + 72),
  }),
  true,
);

assert.deepEqual([...EMAIL_STUDIO_VIEWS], ["compose", "cadence", "history"]);
assert.equal(EMAIL_STUDIO_DEFAULT_VIEW, "compose");
assert.equal(EMAIL_STUDIO_PATH, "/admin/campaigns");
assert.equal(parseEmailStudioView(undefined), "compose");
assert.equal(parseEmailStudioView("compose"), "compose");
assert.equal(parseEmailStudioView("cadence"), "cadence");
assert.equal(parseEmailStudioView("history"), "history");
assert.equal(parseEmailStudioView("nope"), "compose");
assert.equal(parseEmailStudioView(["cadence"]), "compose");
assert.equal(emailStudioHref(), "/admin/campaigns");
assert.equal(emailStudioHref("compose"), "/admin/campaigns");
assert.equal(emailStudioHref("cadence"), "/admin/campaigns?view=cadence");
assert.equal(emailStudioHref("history"), "/admin/campaigns?view=history");

const cadenceAlias = REDIRECTS.find((row) => row.source === "/admin/cadence");
assert.ok(cadenceAlias, "old /admin/cadence URL must keep a redirect");
assert.equal(cadenceAlias.destination, emailStudioHref("cadence"));
assert.equal(cadenceAlias.permanent, false);

const tracked = clubEmailUrl("/products/kitty", "welcome-2", "kitty");
assert.ok(tracked.startsWith("https://y2kase.com/products/kitty?"));
assert.ok(tracked.includes("utm_source=email"));
assert.ok(tracked.includes("utm_medium=club"));
assert.ok(tracked.includes("utm_campaign=welcome-2"));
assert.ok(tracked.includes("utm_content=kitty"));

assert.ok(hoursBetween(addHours(joined, 36), joined) === 36);

console.log("check-cadence: ok");
