/**
 * Self-check for Pinterest hygiene (boards, duplicate deletes, follow drip).
 *
 *   npm run check:guards
 *
 * Pure functions, no I/O. These rules stop a "cleanup" from wiping the Created
 * tab, deleting boards, or following 50 accounts in one blast.
 */
import assert from "node:assert/strict";

import {
  CANONICAL_BOARDS,
  PINTEREST_MAX_PUBLIC_BOARDS,
  PINTEREST_MIN_PUBLIC_BOARDS,
  PINTEREST_HYGIENE_MAX_DELETES,
  boardKeysMatch,
  mergeListedPin,
  normBoardName,
  pdpSlugFromLink,
  pinEngagementScore,
  planBoardActions,
  planDuplicateDeletes,
  productKeyFromLink,
  type BoardPlanAction,
  type HygienePin,
} from "../src/lib/social/pinterest-hygiene";
import { parseListedPinMetrics as parseMetricsFromClient } from "../src/lib/social/pinterest";
import {
  PINTEREST_DEFAULT_FOLLOWS_PER_DAY,
  PINTEREST_FOLLOW_TARGETS,
  PINTEREST_FOLLOW_TARGET_COUNT,
  PINTEREST_MAX_FOLLOWS_PER_DAY,
  isFollowDripEnabled,
  normalizeFollowUsername,
  pinterestFollowsPerDay,
  remainingFollowTargets,
} from "../src/lib/social/pinterest-follow";
import {
  PINTEREST_FOLLOW_SCOPE,
  PINTEREST_OAUTH_SCOPES,
  tokenHasScope,
} from "../src/lib/social/pinterest-auth";


// ── Canonical boards: 3–8 topical titles, router-safe tokens ───────────────

assert.ok(
  CANONICAL_BOARDS.length >= PINTEREST_MIN_PUBLIC_BOARDS &&
    CANONICAL_BOARDS.length <= PINTEREST_MAX_PUBLIC_BOARDS,
);
for (const board of CANONICAL_BOARDS) {
  assert.ok(board.name.length >= 8, `${board.name} is too short to be a keyword title`);
  assert.ok(
    board.description.split(/\s+/).length >= 12,
    `${board.name} needs a real description, not a stub`,
  );
  assert.ok(
    !/^(stuff|pins|social|board)$/i.test(board.name),
    `${board.name} is a junk-drawer title`,
  );
}

const names = CANONICAL_BOARDS.map((b) => b.name);
assert.equal(new Set(names).size, names.length, "canonical board names must be unique");

/** Compile-time: a `delete` variant on BoardPlanAction must fail this file. */
type _NoBoardDelete = Extract<BoardPlanAction["action"], "delete">;
const _boardsNeverDelete: [_NoBoardDelete] extends [never] ? true : never = true;
void _boardsNeverDelete;

function isAllowedBoardAction(action: BoardPlanAction["action"]): boolean {
  switch (action) {
    case "update":
    case "create":
    case "keep":
      return true;
  }
}

assert.ok(
  boardKeysMatch(normBoardName("Hello Kitty Phone Cases"), "hellokitty"),
  "board-router must still match Hello Kitty collections after rename",
);
assert.ok(boardKeysMatch(normBoardName("Phone Charms and Grips"), "charm"));
assert.ok(boardKeysMatch(normBoardName("Phone Charms and Grips"), "grip"));
assert.ok(boardKeysMatch(normBoardName("Y2K Phone Accessories"), "y2k"));
assert.ok(boardKeysMatch(normBoardName("MagSafe Phone Cases"), "magsafe"));

// ── Board planner: rename Social, never delete, cap creates at 8 ────────────

const socialOnly = planBoardActions([
  { id: "1", name: "Social", description: "", privacy: "PUBLIC" },
]);
assert.ok(
  socialOnly.actions.every((a) => isAllowedBoardAction(a.action)),
  "never delete boards",
);
const socialUpdate = socialOnly.actions.find((a) => a.action === "update");
assert.ok(socialUpdate && socialUpdate.action === "update");
assert.equal(socialUpdate.fromName, "Social");
assert.equal(socialUpdate.name, "Kawaii iPhone Cases");
assert.ok(socialOnly.wouldCreate <= 6);
assert.ok(socialOnly.publicCount + socialOnly.wouldCreate <= PINTEREST_MAX_PUBLIC_BOARDS);

const helloKitty = planBoardActions([
  { id: "hk", name: "hello kitty", description: null, privacy: "PUBLIC" },
  { id: "sr", name: "Sanrio", description: "old", privacy: "PUBLIC" },
]);
const hkUpdate = helloKitty.actions.find(
  (a) => a.action === "update" && a.id === "hk",
);
assert.ok(hkUpdate && hkUpdate.action === "update");
assert.equal(hkUpdate.name, "Hello Kitty Phone Cases");
const srUpdate = helloKitty.actions.find(
  (a) => a.action === "update" && a.id === "sr",
);
assert.ok(srUpdate && srUpdate.action === "update");
assert.equal(srUpdate.name, "Sanrio Phone Cases");

const eightJunk = planBoardActions(
  Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    name: `Moodboard ${i + 1}`,
    description: "x",
    privacy: "PUBLIC" as const,
  })),
);
assert.equal(eightJunk.wouldCreate, 0, "do not grow past 8 public boards");
assert.ok(eightJunk.actions.every((a) => isAllowedBoardAction(a.action)));
assert.ok(
  eightJunk.wouldUpdate >= 8,
  "leftover boards with empty/short descriptions get a real description",
);

const alreadyCanonical = planBoardActions(
  CANONICAL_BOARDS.map((b, i) => ({
    id: String(i),
    name: b.name,
    description: b.description,
    privacy: "PUBLIC" as const,
  })),
);
assert.equal(alreadyCanonical.wouldUpdate, 0);
assert.equal(alreadyCanonical.wouldCreate, 0);
assert.ok(alreadyCanonical.actions.every((a) => a.action === "keep"));

const secretIgnored = planBoardActions([
  { id: "s", name: "Secret stash", description: "", privacy: "SECRET" },
]);
assert.equal(secretIgnored.publicCount, 0);
assert.ok(!secretIgnored.actions.some((a) => a.action === "update" && a.id === "s"));

// ── Duplicate planner: keep one still + videos, never mass-delete ───────────

const now = new Date("2026-09-06T12:00:00Z");
function still(
  id: string,
  opts: Partial<HygienePin> & { hoursAgo?: number; daysAgo?: number } = {},
): HygienePin {
  const ms =
    opts.daysAgo != null
      ? opts.daysAgo * 86_400_000
      : (opts.hoursAgo ?? 1) * 3_600_000;
  return {
    id,
    createdAt: new Date(now.getTime() - ms).toISOString(),
    link: opts.link ?? "https://y2kase.com/products/green-polka-dot-bear-case",
    title: opts.title ?? "Green polka-dot bear case",
    isVideo: opts.isVideo ?? false,
    isOwner: opts.isOwner ?? true,
    saves: opts.saves ?? 0,
    outbound: opts.outbound ?? 0,
    impressions: opts.impressions ?? 0,
    productKey: opts.productKey ?? "slug:green-polka-dot-bear-case",
  };
}

const burst = planDuplicateDeletes(
  [1, 2, 3, 4, 5].map((n) => still(String(n), { hoursAgo: n, impressions: 6 - n })),
  now,
);
assert.equal(burst.deletes.length, 4, "five same-day 0-save stills → keep 1, delete 4");
assert.ok(burst.kept.some((k) => k.reason === "best still of this SKU"));
assert.ok(
  burst.deletes.every((d) => d.productKey === "slug:green-polka-dot-bear-case"),
);
assert.ok(
  !burst.deletes.some((d) => d.id === burst.kept.find((k) => k.reason === "best still of this SKU")?.id),
);

const withVideo = planDuplicateDeletes(
  [
    still("v1", { isVideo: true, hoursAgo: 2 }),
    still("i1", { hoursAgo: 1, impressions: 10 }),
    still("i2", { hoursAgo: 1.5 }),
    still("i3", { hoursAgo: 2 }),
    still("i4", { hoursAgo: 2.5 }),
  ],
  now,
);
assert.ok(withVideo.kept.some((k) => k.id === "v1" && k.reason === "keep video"));
assert.ok(withVideo.kept.some((k) => k.id === "i1"));
assert.equal(withVideo.deletes.length, 3);
assert.ok(!withVideo.deletes.some((d) => d.id === "v1" || d.id === "i1"));

const savedStill = planDuplicateDeletes(
  [
    still("a", { hoursAgo: 1, saves: 2 }),
    still("b", { hoursAgo: 1.2 }),
    still("c", { hoursAgo: 1.4 }),
  ],
  now,
);
assert.ok(!savedStill.deletes.some((d) => d.id === "a"));

const pair = planDuplicateDeletes(
  [still("p1", { hoursAgo: 3 }), still("p2", { hoursAgo: 4 })],
  now,
);
assert.equal(pair.deletes.length, 0, "two stills is not a duplicate row");

const unique = planDuplicateDeletes(
  [
    {
      ...still("u1", { hoursAgo: 20 }),
      link: null,
      productKey: "pin:u1",
    },
  ],
  now,
);
assert.equal(unique.deletes.length, 0);

const aged = planDuplicateDeletes(
  [
    still("old1", { daysAgo: 40, impressions: 9 }),
    still("old2", { daysAgo: 30 }),
    still("old3", { daysAgo: 20 }),
    still("old4", { daysAgo: 18 }),
  ],
  now,
);
assert.equal(aged.deletes.length, 3, "old 0-save extras of the same SKU come off");
assert.ok(!aged.deletes.some((d) => d.id === "old1"));

const freshDrip = planDuplicateDeletes(
  [
    still("n1", { daysAgo: 2, impressions: 4 }),
    still("n2", { daysAgo: 5 }),
    still("n3", { daysAgo: 8 }),
  ],
  now,
);
assert.equal(
  freshDrip.deletes.length,
  0,
  "intentional 3-day drip stills under 14 days stay unless they were a burst",
);

assert.ok(PINTEREST_HYGIENE_MAX_DELETES <= 80);
assert.ok(PINTEREST_HYGIENE_MAX_DELETES >= 10);

const huge = planDuplicateDeletes(
  Array.from({ length: 120 }, (_, i) => still(`x${i}`, { hoursAgo: i * 0.1 })),
  now,
  { maxDeletes: 80 },
);
assert.equal(huge.deletes.length, 80);

assert.ok(
  pinEngagementScore({ saves: 1, outbound: 0, impressions: 0 }) >
    pinEngagementScore({ saves: 0, outbound: 0, impressions: 500 }),
);

assert.equal(
  pdpSlugFromLink("https://y2kase.com/products/green-polka-dot-bear-case?utm=pin"),
  "green-polka-dot-bear-case",
);
assert.equal(
  productKeyFromLink("https://y2kase.com/products/Hello-Kitty-Case", "9"),
  "slug:hello-kitty-case",
);
assert.ok(productKeyFromLink(null, "99").startsWith("pin:"));

const merged = mergeListedPin(
  {
    id: "1",
    createdAt: now.toISOString(),
    link: "https://y2kase.com/products/foo",
    title: "Foo",
    creativeType: "REGULAR",
    isOwner: true,
    isVideo: false,
    impressions: 1,
    saves: 0,
    outbound: 0,
  },
  { productId: 7, productSlug: "foo", productTitle: "Foo", mediaType: "image", saves: 3, impressions: 0, outbound: 0 },
);
assert.equal(merged.saves, 3, "DB saves protect a pin the list metrics missed");
assert.equal(merged.productKey, "slug:foo");

assert.deepEqual(parseMetricsFromClient({ all_time: { impression: 2, save: 1, clickthrough: 4 } }), {
  impressions: 2,
  saves: 1,
  outbound: 4,
});

// ── Follow drip: 50–100 targets, 5/day, hard cap 8 ──────────────────────────

assert.ok(PINTEREST_FOLLOW_TARGETS.length >= PINTEREST_FOLLOW_TARGET_COUNT);
assert.ok(PINTEREST_FOLLOW_TARGETS.length <= 100);
assert.equal(
  new Set(PINTEREST_FOLLOW_TARGETS.map(normalizeFollowUsername)).size,
  PINTEREST_FOLLOW_TARGETS.length,
);
assert.ok(!PINTEREST_FOLLOW_TARGETS.some((u) => u.startsWith("@")));
assert.ok(!PINTEREST_FOLLOW_TARGETS.map(normalizeFollowUsername).includes("y2kase"));

assert.equal(pinterestFollowsPerDay(""), PINTEREST_DEFAULT_FOLLOWS_PER_DAY);
assert.equal(pinterestFollowsPerDay("5"), 5);
assert.equal(pinterestFollowsPerDay("99"), PINTEREST_MAX_FOLLOWS_PER_DAY);
assert.equal(pinterestFollowsPerDay("0"), 1);
assert.equal(isFollowDripEnabled(""), true);
assert.equal(isFollowDripEnabled("false"), false);
assert.equal(isFollowDripEnabled("true"), true);

const left = remainingFollowTargets(["CASETiFY", "sanrio"], ["missing"]);
assert.ok(!left.includes("casetify"));
assert.ok(!left.includes("sanrio"));
assert.ok(!left.includes("y2kase"));
assert.ok(left.length >= 40);

assert.ok(PINTEREST_OAUTH_SCOPES.includes(PINTEREST_FOLLOW_SCOPE));
assert.ok(tokenHasScope("boards:read pins:write user_accounts:write", "user_accounts:write"));
assert.equal(tokenHasScope("boards:read,pins:write", "user_accounts:write"), false);

console.log("check-pinterest-hygiene: all assertions passed");
