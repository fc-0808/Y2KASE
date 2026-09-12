/**
 * Self-check for the Pinterest editorial strategy.
 *
 *   npm run check:guards
 *
 * These rules are the difference between a catalog dump that TransAct V2
 * demotes and a curated drip that can recover monthly views. Pure functions,
 * no I/O — same harness as the Instagram strategy guards.
 */
import assert from "node:assert/strict";

import {
  PINTEREST_BANNED_HASHTAGS,
  PINTEREST_CTA,
  PINTEREST_DEFAULT_PINS_PER_DAY,
  PINTEREST_DEFAULT_PINS_PER_RUN,
  PINTEREST_MAX_HASHTAGS,
  PINTEREST_MAX_PINS_PER_DAY,
  PINTEREST_MAX_PINS_PER_RUN,
  altTextFromPrompt,
  buildPinterestAltText,
  buildPinterestDescription,
  describePinSlot,
  isPinCardEnabled,
  pickDiverseImageIndex,
  pinOverlayLines,
  pinterestPinsPerDay,
  pinterestPinsPerRun,
  pinterestProductCooldownDays,
  planPinSlot,
  promptWithAltText,
  sanitizePinterestCaption,
  sanitizePinterestHashtags,
  sanitizePinterestTitle,
  stripUnmentionedDevices,
} from "../src/lib/social/pinterest-strategy";

// ── Cadence: pin-level caps, not listing dumps ───────────────────────────────

assert.equal(pinterestPinsPerRun(""), PINTEREST_DEFAULT_PINS_PER_RUN);
assert.equal(pinterestPinsPerRun("2"), 2);
assert.equal(pinterestPinsPerRun("1"), 1);
assert.equal(
  pinterestPinsPerRun("99"),
  PINTEREST_MAX_PINS_PER_RUN,
  "hard cap so an env typo cannot firehose a cron slot",
);
assert.equal(pinterestPinsPerRun("0"), 1);
assert.equal(pinterestPinsPerRun("nope"), PINTEREST_DEFAULT_PINS_PER_RUN);

assert.equal(pinterestPinsPerDay(""), PINTEREST_DEFAULT_PINS_PER_DAY);
assert.equal(pinterestPinsPerDay("4"), 4);
assert.equal(
  pinterestPinsPerDay("40"),
  PINTEREST_MAX_PINS_PER_DAY,
  "hard cap so an env typo cannot dump 8–14 stills of one SKU",
);
assert.equal(pinterestPinsPerDay("1"), 1);

assert.equal(pinterestProductCooldownDays(""), 3);
assert.equal(pinterestProductCooldownDays("7"), 7);
assert.equal(pinterestProductCooldownDays("99"), 14);
assert.equal(pinterestProductCooldownDays("0"), 1);

assert.equal(isPinCardEnabled(""), true);
assert.equal(isPinCardEnabled("true"), true);
assert.equal(isPinCardEnabled("false"), false);

// ── Slot picker: video first, one pin, honour cap + cooldown ─────────────────

const bothDue = planPinSlot({
  hasUnpinnedPhotos: true,
  hasUnpinnedVideo: true,
  pinsPostedToday: 0,
  dailyCap: 4,
  productPinnedWithinCooldown: false,
});
assert.equal(bothDue.action, "post");
if (bothDue.action === "post") {
  assert.equal(bothDue.mediaType, "video");
  assert.equal(bothDue.reason, "prefer-video");
}

const photosOnly = planPinSlot({
  hasUnpinnedPhotos: true,
  hasUnpinnedVideo: false,
  pinsPostedToday: 0,
  dailyCap: 4,
  productPinnedWithinCooldown: false,
});
assert.equal(photosOnly.action, "post");
if (photosOnly.action === "post") {
  assert.equal(photosOnly.mediaType, "image");
  assert.equal(photosOnly.reason, "image-remaining");
}

assert.deepEqual(
  planPinSlot({
    hasUnpinnedPhotos: true,
    hasUnpinnedVideo: true,
    pinsPostedToday: 4,
    dailyCap: 4,
    productPinnedWithinCooldown: false,
  }),
  { action: "skip", reason: "daily-cap" },
);

assert.deepEqual(
  planPinSlot({
    hasUnpinnedPhotos: true,
    hasUnpinnedVideo: false,
    pinsPostedToday: 0,
    dailyCap: 4,
    productPinnedWithinCooldown: true,
  }),
  { action: "skip", reason: "product-cooldown" },
);

assert.deepEqual(
  planPinSlot({
    hasUnpinnedPhotos: false,
    hasUnpinnedVideo: false,
    pinsPostedToday: 0,
    dailyCap: 4,
    productPinnedWithinCooldown: false,
  }),
  { action: "skip", reason: "no-media" },
);

assert.match(describePinSlot(bothDue), /Video first/);
assert.match(
  describePinSlot({ action: "skip", reason: "daily-cap" }),
  /already used/,
);

// ── Visual diversity: hero first, then farthest remaining angle ──────────────

assert.equal(pickDiverseImageIndex([], [0]), -1);
assert.equal(
  pickDiverseImageIndex([0, 1, 2, 3, 4], []),
  0,
  "first pin of a SKU is the hero (position 0)",
);
assert.equal(
  pickDiverseImageIndex([1, 2, 3, 4], [0]),
  3,
  "after the hero, pick the farthest remaining still (position 4)",
);
assert.equal(pickDiverseImageIndex([2], [0, 4]), 0);

// ── Titles: search phrases, not "Stylish iPhone 15 Case:" ────────────────────

assert.equal(
  sanitizePinterestTitle("Stylish iPhone 15 Case: Green Polka Dot Bear"),
  "iPhone 15 Case: Green Polka Dot Bear",
);
assert.equal(
  sanitizePinterestTitle("Trendy Unique Kuromi Phone Case"),
  "Kuromi Phone Case",
);
assert.equal(
  sanitizePinterestTitle("   "),
  "",
);
assert.equal(
  sanitizePinterestTitle("x", "Green Polka Dot Bear Phone Case"),
  "Green Polka Dot Bear Phone Case",
);
assert.ok(sanitizePinterestTitle("A".repeat(200)).length <= 100);

assert.equal(
  stripUnmentionedDevices(
    "Trendy iPhone 17 Case Music Bear",
    "Green Polka Dot Bear Phone Case",
  ),
  "Trendy iPhone Case Music Bear",
);
assert.equal(
  stripUnmentionedDevices(
    "Kuromi iPhone 16 Pro Max Case",
    "Kuromi iPhone 16 Pro Max Glitter Case",
  ),
  "Kuromi iPhone 16 Pro Max Case",
);

// ── Overlay: readable, two lines, no hashtags ────────────────────────────────

const overlay = pinOverlayLines(
  "Green Polka Dot Bear Phone Case with Beaded Strap Extra Words",
);
assert.ok(overlay.length >= 1 && overlay.length <= 2);
assert.ok(overlay.join(" ").split(/\s+/).length <= 8);
assert.doesNotMatch(overlay.join(" "), /#/);

// ── Captions + hashtags: natural language, niche tags only ───────────────────

assert.ok(PINTEREST_BANNED_HASHTAGS.has("viral"));
assert.ok(PINTEREST_BANNED_HASHTAGS.has("fyp"));

assert.deepEqual(
  sanitizePinterestHashtags([
    "#KawaiiPhoneCase",
    "bearcase",
    "fyp",
    "viral",
    "y2k",
    "cute",
    "phonecase",
    "extra1",
    "extra2",
  ]),
  ["kawaiiphonecase", "bearcase", "y2k", "phonecase", "extra1"],
);
assert.equal(
  sanitizePinterestHashtags(Array.from({ length: 20 }, (_, i) => `tag${i}`))
    .length,
  PINTEREST_MAX_HASHTAGS,
);

assert.equal(
  sanitizePinterestCaption(
    "kawaii, y2k, holographic, cute, gift, iphone, polka, bear",
  ),
  "kawaii",
);
assert.equal(
  sanitizePinterestCaption(
    "Green polka-dot bear case with a matching strap.\nhttps://y2kase.com/x?utm_source=pinterest\n#fyp #viral",
  ),
  "Green polka-dot bear case with a matching strap.",
);

const desc = buildPinterestDescription({
  caption: "Green polka-dot bear phone case with a beaded strap.",
  hashtags: ["bearcase", "fyp", "kawaiiphonecase"],
  productTitle: "Green Polka Dot Bear Phone Case",
});
assert.match(desc, /Green polka-dot bear phone case/);
assert.ok(desc.includes(PINTEREST_CTA));
assert.doesNotMatch(desc, /#fyp/);
assert.match(desc, /#bearcase/);
assert.ok(desc.length <= 500);

const alreadyHasCta = buildPinterestDescription({
  caption: "Shop this at y2kase.com today.",
  hashtags: ["y2k"],
});
assert.equal(alreadyHasCta.split(PINTEREST_CTA).length - 1, 0);

assert.equal(
  buildPinterestAltText({
    imageAlt: "Clear iPhone case with green polka dots and a brown bear.",
    productTitle: "Green Polka Dot Bear Phone Case",
  }),
  "Clear iPhone case with green polka dots and a brown bear.",
);
assert.match(
  buildPinterestAltText({ productTitle: "Kuromi Case" }),
  /Kuromi Case/,
);

assert.equal(altTextFromPrompt("ALT:held in a mirror selfie"), "held in a mirror selfie");
assert.equal(altTextFromPrompt("(auto-pinned real product photo)"), null);
assert.match(promptWithAltText("mirror selfie"), /^ALT:mirror selfie$/);
assert.match(promptWithAltText(null), /auto-pinned/);

console.log("pinterest-strategy: all assertions passed");
