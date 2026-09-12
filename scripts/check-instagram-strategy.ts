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
  INSTAGRAM_MANIFESTO_CTA,
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
  FASHION_PRESET_BY_PILLAR,
  FASHION_PRESET_KEYS,
  INSTAGRAM_BIO_CATEGORY,
  INSTAGRAM_BOOTSTRAP_GRID,
  INSTAGRAM_OVERLAY_MAX_WORDS,
  INSTAGRAM_SUSTAIN_CYCLE,
  INSTAGRAM_TAGLINE,
  buildFashionLookBrief,
  fashionAssetPlan,
  fashionFeedMediaType,
  fashionGridPreview,
  fashionPillarAt,
  fallbackFashionCaption,
  inferLookCues,
  isCatalogDumpCaption,
  isFashionPreset,
  pillarFromPreset,
  sanitizeFashionOverlay,
  stripCatalogSlogans,
  type FashionPillar,
} from "../src/lib/social/instagram-fashion";
import { getPreset } from "../src/lib/social/presets";
import {
  catalogReferenceUrls,
  supportsInputFidelity,
} from "../src/lib/social/image-gen-policy";
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

assert.equal(INSTAGRAM_BOOTSTRAP_POSTS, INSTAGRAM_BOOTSTRAP_GRID.length);

function assertNoConsecutive(pillars: readonly FashionPillar[], label: string) {
  for (let i = 1; i < pillars.length; i++) {
    assert.notEqual(
      pillars[i],
      pillars[i - 1],
      `${label} consecutive duplicate at ${i}: ${pillars[i]}`,
    );
  }
}

assertNoConsecutive(INSTAGRAM_BOOTSTRAP_GRID, "bootstrap");
assertNoConsecutive(INSTAGRAM_SUSTAIN_CYCLE, "sustain");
assert.notEqual(
  INSTAGRAM_BOOTSTRAP_GRID[INSTAGRAM_BOOTSTRAP_GRID.length - 1],
  INSTAGRAM_SUSTAIN_CYCLE[0],
  "bootstrap must not collide with the first sustain pillar",
);
assert.notEqual(
  INSTAGRAM_SUSTAIN_CYCLE[INSTAGRAM_SUSTAIN_CYCLE.length - 1],
  INSTAGRAM_SUSTAIN_CYCLE[0],
  "sustain cycle must not collide with itself",
);

assert.equal(fashionPillarAt(0), "look");
assert.equal(fashionPillarAt(1), "still");
assert.equal(fashionPillarAt(2), "graphic");
assert.equal(fashionPillarAt(11), "look");
assert.equal(fashionPillarAt(12), "still");
assert.equal(fashionPillarAt(18), fashionPillarAt(12));

const preview = fashionGridPreview(0, 12);
assert.deepEqual(preview, [...INSTAGRAM_BOOTSTRAP_GRID]);
assertNoConsecutive(fashionGridPreview(0, 24), "24-post horizon");

assert.equal(INSTAGRAM_BIO_CATEGORY, "Fashion Accessories");
assert.match(INSTAGRAM_TAGLINE, /CUTE BUT TOUGH/);

assert.deepEqual(fashionAssetPlan({ pillar: "look", mediaType: "video" }), {
  assetSource: "fashion-still",
  allowGenerate: true,
});
assert.deepEqual(fashionAssetPlan({ pillar: "look", mediaType: "carousel" }), {
  assetSource: "fashion-still",
  allowGenerate: true,
});
assert.deepEqual(fashionAssetPlan({ pillar: "detail", mediaType: "carousel" }), {
  assetSource: "catalog-photos",
  allowGenerate: true,
});
assert.equal(
  fashionFeedMediaType({ pillar: "look", catalogMediaType: "video" }),
  "carousel",
);
assert.equal(
  fashionFeedMediaType({ pillar: "detail", catalogMediaType: "video" }),
  "video",
);

const kuromi = inferLookCues({
  title: "Kuromi Jirai iPhone Case",
  tags: ["jirai", "bow"],
});
assert.equal(kuromi.character, "Kuromi");
assert.equal(kuromi.aesthetic, "jirai");

assert.equal(
  inferLookCues({ title: "Clear holographic case", tags: ["y2k"] }).aesthetic,
  "y2k",
);

assert.equal(
  inferLookCues({
    title: "Miffy Green Leaf Charm Case Cute Kawaii Y2K for iPhone 17",
    characterName: "Miffy",
  }).aesthetic,
  "kawaii",
  "SEO 'Y2K' in a Miffy title must not force a chrome gyaru look",
);

assert.equal(
  sanitizeFashionOverlay(
    "this is the CUTEST jirai phone case ever",
    "jirai girl era",
  ),
  "jirai girl era",
);
assert.equal(
  sanitizeFashionOverlay("chrome hearts forever and a day extra", "x").split(" ")
    .length,
  INSTAGRAM_OVERLAY_MAX_WORDS,
);

assert.equal(
  isCatalogDumpCaption("Kuromi Jirai iPhone Case", "Kuromi Jirai iPhone Case"),
  true,
);
assert.equal(
  isCatalogDumpCaption("Black bow. White beads.", "Kuromi Jirai iPhone Case"),
  false,
);
assert.equal(
  stripCatalogSlogans("this is the CUTEST jirai phone case ever\nThe bow stays."),
  "The bow stays.",
);

const lookCaption = fallbackFashionCaption("look", kuromi);
assert.match(lookCaption, /Kuromi/);
assert.doesNotMatch(lookCaption, /phone case ever/i);

const brief = buildFashionLookBrief({
  publishedCount: 0,
  mediaType: "carousel",
  productTitle: "Kuromi Jirai iPhone Case",
  tags: ["jirai"],
  characterName: "Kuromi",
});
assert.equal(brief.pillar, "look");
assert.equal(brief.preset, "fashion_look");
assert.equal(brief.assetSource, "fashion-still");
assert.match(brief.overlay, /kuromi girl era/i);
assert.ok(brief.hashtags.includes("kuromi"));
assert.ok(brief.allowGenerate);

const lookEvenWithVideo = buildFashionLookBrief({
  publishedCount: 0,
  mediaType: "video",
  productTitle: "Miffy Green Leaf Charm Case Cute Kawaii Y2K for iPhone 17",
  characterName: "Miffy",
});
assert.equal(lookEvenWithVideo.assetSource, "fashion-still");
assert.equal(lookEvenWithVideo.allowGenerate, true);
assert.match(lookEvenWithVideo.shoot, /kawaii|mint|cafe/i);
assert.match(lookEvenWithVideo.shoot, /attached catalog photo/i);
assert.match(lookEvenWithVideo.shoot, /smile|smirk|alive/i);
assert.match(lookEvenWithVideo.shoot, /half the frame/i);
assert.doesNotMatch(lookEvenWithVideo.shoot, /2000s gyaru magazine/i);
assert.doesNotMatch(lookEvenWithVideo.shoot, /iPhone 17/);
assert.doesNotMatch(lookEvenWithVideo.shoot, /at most a third/i);
assert.doesNotMatch(lookEvenWithVideo.shoot, /looking at her/i);
assert.doesNotMatch(lookEvenWithVideo.promptExtra, /iPhone 17/);

const lookPreset = getPreset("fashion_look");
assert.ok(lookPreset);
assert.equal(lookPreset.usesProductReference, true);
assert.equal(getPreset("manifesto_card")?.usesProductReference, false);

const kawaiiLookPrompt = lookPreset.buildPrompt(
  {
    title:
      "Miffy Kawaii 3D Magnetic Phone Case with Beaded Strap for iPhone 17 16 15 14 13 Pro Max — MagSafe",
    productType: "phone_case",
    characterName: "Miffy",
  },
  lookEvenWithVideo.promptExtra,
);
assert.match(kawaiiLookPrompt, /attached catalog photo/i);
assert.match(kawaiiLookPrompt, /smile|smirk|alive|lively/i);
assert.match(kawaiiLookPrompt, /half the frame/i);
assert.doesNotMatch(kawaiiLookPrompt, /jirai-kei/);
assert.doesNotMatch(kawaiiLookPrompt, /iPhone 17/);
assert.doesNotMatch(kawaiiLookPrompt, /at most (a |one )?third/i);
assert.doesNotMatch(
  kawaiiLookPrompt,
  /Miffy Kawaii 3D Magnetic Phone Case/,
);

const defaultLookPrompt = lookPreset.buildPrompt({
  title: "Kuromi Jirai iPhone Case",
  productType: "phone_case",
  characterName: "Kuromi",
});
assert.match(defaultLookPrompt, /jirai-kei/);

const reelBrief = buildFashionLookBrief({
  publishedCount: 5,
  mediaType: "video",
  productTitle: "Kuromi Jirai iPhone Case",
});
assert.equal(reelBrief.pillar, "detail");
assert.equal(reelBrief.assetSource, "reel");
assert.equal(reelBrief.allowGenerate, true);

for (const key of FASHION_PRESET_KEYS) {
  assert.ok(getPreset(key), `missing fashion preset ${key}`);
  assert.ok(isFashionPreset(key));
}
assert.equal(pillarFromPreset("fashion_look"), "look");
assert.equal(pillarFromPreset("lifestyle_flatlay"), null);
assert.equal(FASHION_PRESET_BY_PILLAR.graphic, "manifesto_card");

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

assert.equal(
  fallbackInstagramCaption("Kuromi Case"),
  fallbackFashionCaption(
    "look",
    inferLookCues({ title: "Kuromi Case" }),
  ),
);
assert.doesNotMatch(fallbackInstagramCaption("Kuromi Case"), /^Kuromi Case$/);
assert.doesNotMatch(
  fallbackInstagramCaption("  "),
  /new drop in the shop/i,
);

const fromTitle = buildInstagramCaption({
  caption: "",
  hashtags: [],
  productTitle: "My Melody Wallet Case",
});
assert.doesNotMatch(fromTitle, /^My Melody Wallet Case/);
assert.ok(fromTitle.includes(INSTAGRAM_LINK_IN_BIO_CTA));
assert.match(fromTitle, /Melody girl era|last accessory|uniform/i);

const sloganPost = buildInstagramCaption({
  caption: "this is the CUTEST jirai phone case ever",
  hashtags: ["jirai"],
  productTitle: "Kuromi Jirai iPhone Case",
});
assert.doesNotMatch(sloganPost, /CUTEST/i);
assert.doesNotMatch(sloganPost, /phone case ever/i);

const dump = buildInstagramCaption({
  caption: "Kuromi Jirai iPhone Case",
  productTitle: "Kuromi Jirai iPhone Case",
  hashtags: ["kuromi"],
});
assert.doesNotMatch(dump, /^Kuromi Jirai iPhone Case/);

const manifesto = buildInstagramCaption({
  caption: "Pretty is not the opposite of durable.",
  pillar: "graphic",
  hashtags: ["y2kase"],
});
assert.ok(manifesto.includes(INSTAGRAM_MANIFESTO_CTA));
assert.doesNotMatch(
  manifesto,
  new RegExp(INSTAGRAM_LINK_IN_BIO_CTA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
);

assert.deepEqual(
  catalogReferenceUrls([
    "https://cdn.example/a.jpg",
    "/relative.jpg",
    "https://cdn.example/a.jpg",
    "https://cdn.example/b.jpg",
    "https://cdn.example/c.jpg",
    "",
    null,
  ]),
  ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg", "https://cdn.example/c.jpg"],
);
assert.equal(supportsInputFidelity("gpt-image-1"), true);
assert.equal(supportsInputFidelity("gpt-image-1.5"), true);
assert.equal(supportsInputFidelity("gpt-image-1-mini"), false);
assert.equal(supportsInputFidelity("dall-e-3"), false);

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
