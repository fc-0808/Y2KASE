/**
 * Self-check for the Instagram editorial strategy.
 *
 *   npm run check:guards
 *
 * These rules are the difference between a 1-post shop looking like a brand
 * and looking like a bot. Pure functions, no I/O — same harness as the catalog
 * copy guards.
 */
import assert from "node:assert/strict";

import {
  INSTAGRAM_BOOTSTRAP_POSTS,
  INSTAGRAM_BANNED_HASHTAGS,
  INSTAGRAM_LINK_IN_BIO_CTA,
  INSTAGRAM_MAX_HASHTAGS,
  bootstrapRemaining,
  buildFacebookCaption,
  buildInstagramCaption,
  describeSlot,
  fallbackInstagramCaption,
  instagramPhase,
  instagramPostsPerDay,
  mediaDue,
  pickPreferredMedia,
  planInstagramSlot,
  sanitizeInstagramCaption,
  sanitizeInstagramHashtags,
} from "../src/lib/social/instagram-strategy";
import {
  createSocialOAuthState,
  verifySocialOAuthState,
} from "../src/lib/social/oauth-state";

// ── Cadence ──────────────────────────────────────────────────────────────────

assert.equal(instagramPostsPerDay(undefined), 1);
assert.equal(instagramPostsPerDay(""), 1);
assert.equal(instagramPostsPerDay("1"), 1);
assert.equal(instagramPostsPerDay("2"), 2);
assert.equal(instagramPostsPerDay("99"), 2, "hard cap so an env typo cannot firehose");
assert.equal(instagramPostsPerDay("0"), 1);
assert.equal(instagramPostsPerDay("-3"), 1);
assert.equal(instagramPostsPerDay("nope"), 1);
assert.equal(instagramPostsPerDay("1.9"), 1);

assert.equal(instagramPhase(0), "bootstrap");
assert.equal(instagramPhase(11), "bootstrap");
assert.equal(instagramPhase(INSTAGRAM_BOOTSTRAP_POSTS), "sustain");
assert.equal(instagramPhase(40), "sustain");
assert.equal(bootstrapRemaining(0), 12);
assert.equal(bootstrapRemaining(12), 0);
assert.equal(bootstrapRemaining(20), 0);

// ── Slot picker: Reels first, never both, honour the daily cap ───────────────

const bothDue = planInstagramSlot({
  hasPhotos: true,
  hasVideo: true,
  photosPosted: false,
  videoPosted: false,
  igPostedToday: 0,
  dailyCap: 1,
});
assert.equal(bothDue.action, "post");
if (bothDue.action === "post") {
  assert.equal(bothDue.mediaType, "video");
  assert.equal(bothDue.reason, "prefer-reel");
}

const photosOnly = planInstagramSlot({
  hasPhotos: true,
  hasVideo: false,
  photosPosted: false,
  videoPosted: false,
  igPostedToday: 0,
  dailyCap: 1,
});
assert.equal(photosOnly.action, "post");
if (photosOnly.action === "post") {
  assert.equal(photosOnly.mediaType, "carousel");
  assert.equal(photosOnly.reason, "carousel-remaining");
}

const videoRemaining = planInstagramSlot({
  hasPhotos: true,
  hasVideo: true,
  photosPosted: true,
  videoPosted: false,
  igPostedToday: 0,
  dailyCap: 1,
});
assert.equal(videoRemaining.action, "post");
if (videoRemaining.action === "post") {
  assert.equal(videoRemaining.mediaType, "video");
  assert.equal(videoRemaining.reason, "video-remaining");
}

const capHit = planInstagramSlot({
  hasPhotos: true,
  hasVideo: true,
  photosPosted: false,
  videoPosted: false,
  igPostedToday: 1,
  dailyCap: 1,
});
assert.deepEqual(capHit, { action: "skip", reason: "daily-cap" });

assert.deepEqual(
  planInstagramSlot({
    hasPhotos: false,
    hasVideo: false,
    photosPosted: false,
    videoPosted: false,
    igPostedToday: 0,
    dailyCap: 1,
  }),
  { action: "skip", reason: "no-media" },
);

assert.deepEqual(
  planInstagramSlot({
    hasPhotos: true,
    hasVideo: true,
    photosPosted: true,
    videoPosted: true,
    igPostedToday: 0,
    dailyCap: 1,
  }),
  { action: "skip", reason: "nothing-left" },
);

assert.deepEqual(pickPreferredMedia({ carousel: true, video: true }), "video");
assert.deepEqual(pickPreferredMedia({ carousel: true, video: false }), "carousel");
assert.equal(pickPreferredMedia({ carousel: false, video: false }), null);

assert.deepEqual(
  mediaDue({
    hasPhotos: true,
    hasVideo: true,
    photosPosted: true,
    videoPosted: false,
  }),
  { carousel: false, video: true },
);

assert.match(describeSlot(bothDue), /Reel first/);
assert.match(
  describeSlot({ action: "skip", reason: "daily-cap" }),
  /already used/,
);

// ── Hashtags: niche only, cap at 5, drop bait ────────────────────────────────

assert.ok(INSTAGRAM_BANNED_HASHTAGS.has("fyp"));
assert.ok(INSTAGRAM_BANNED_HASHTAGS.has("viral"));
assert.ok(INSTAGRAM_BANNED_HASHTAGS.has("instagood"));

assert.deepEqual(
  sanitizeInstagramHashtags([
    "#Kuromi",
    "Y2K",
    "fyp",
    "viral",
    "phonecase",
    "jirai",
    "love",
    "kuromi",
    "extra1",
    "extra2",
  ]),
  ["kuromi", "y2k", "phonecase", "jirai", "extra1"],
);
assert.equal(
  sanitizeInstagramHashtags(["a", "!!", "", "#", "ok_tag"]).length,
  1,
);
assert.equal(
  sanitizeInstagramHashtags(Array.from({ length: 20 }, (_, i) => `tag${i}`))
    .length,
  INSTAGRAM_MAX_HASHTAGS,
);

// ── Captions: strip URLs, no duplicate CTA, Facebook keeps the shop link ─────

assert.equal(
  sanitizeInstagramCaption(
    "the CUTEST jirai case\nhttps://y2kase.com/products/foo?utm_source=instagram\n#fyp #viral",
  ),
  "the CUTEST jirai case",
);

assert.equal(
  sanitizeInstagramCaption("line one\n\n\n\nline two"),
  "line one\n\nline two",
);

const ig = buildInstagramCaption({
  caption: "this Kuromi case eats.",
  hashtags: ["kuromi", "fyp", "phonecase", "viral", "y2k", "love"],
  productTitle: "Kuromi Jirai iPhone Case",
  productUrl: "https://y2kase.com/products/kuromi?utm_source=instagram",
});
assert.match(ig, /this Kuromi case eats/);
assert.ok(ig.includes(INSTAGRAM_LINK_IN_BIO_CTA));
assert.doesNotMatch(ig, /https?:\/\//);
assert.doesNotMatch(ig, /utm_/);
assert.doesNotMatch(ig, /#fyp/);
assert.match(ig, /#kuromi/);
assert.match(ig, /#phonecase/);
assert.ok((ig.match(/#/g) ?? []).length <= INSTAGRAM_MAX_HASHTAGS);

const alreadyHasCta = buildInstagramCaption({
  caption: "new drop — link in bio bestie",
  hashtags: ["y2k"],
});
assert.equal(
  alreadyHasCta.split(INSTAGRAM_LINK_IN_BIO_CTA).length - 1,
  0,
  "do not double the link-in-bio line",
);

const fb = buildFacebookCaption({
  caption: "this Kuromi case eats. https://spam.example/x",
  hashtags: ["kuromi", "fyp"],
  productTitle: "Kuromi Jirai iPhone Case",
  productUrl: "https://y2kase.com/products/kuromi?utm_source=facebook",
});
assert.match(fb, /this Kuromi case eats/);
assert.match(fb, /Shop: https:\/\/y2kase\.com\/products\/kuromi/);
assert.doesNotMatch(fb, /spam\.example/);
assert.doesNotMatch(fb, /#fyp/);

assert.equal(fallbackInstagramCaption("Kuromi Case"), "Kuromi Case");
assert.equal(fallbackInstagramCaption("  "), "New drop in the shop.");

const fromTitle = buildInstagramCaption({
  caption: "",
  hashtags: [],
  productTitle: "My Melody Wallet Case",
});
assert.match(fromTitle, /My Melody Wallet Case/);
assert.ok(fromTitle.includes(INSTAGRAM_LINK_IN_BIO_CTA));

// ── Admin-bound OAuth state ─────────────────────────────────────────────────

const previousAuthSecret = process.env.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_SECRET = "offline-social-oauth-guard-secret";
try {
  const now = Date.parse("2026-08-31T12:00:00.000Z");
  const state = createSocialOAuthState("pinterest", "admin-1", now);
  assert.equal(
    verifySocialOAuthState(state, "pinterest", "admin-1", now + 60_000),
    true,
  );
  assert.equal(
    verifySocialOAuthState(state, "tiktok", "admin-1", now + 60_000),
    false,
  );
  assert.equal(
    verifySocialOAuthState(state, "pinterest", "admin-2", now + 60_000),
    false,
  );
  assert.equal(
    verifySocialOAuthState(state, "pinterest", "admin-1", now + 11 * 60_000),
    false,
  );
  assert.equal(
    verifySocialOAuthState(
      `${state.slice(0, -1)}${state.endsWith("a") ? "b" : "a"}`,
      "pinterest",
      "admin-1",
      now,
    ),
    false,
  );
} finally {
  if (previousAuthSecret === undefined) {
    delete process.env.BETTER_AUTH_SECRET;
  } else {
    process.env.BETTER_AUTH_SECRET = previousAuthSecret;
  }
}

console.log("instagram-strategy: all assertions passed");
