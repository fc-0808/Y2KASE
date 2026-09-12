/**
 * Pinterest account hygiene — topical boards + 0-save duplicate cleanup.
 *
 * What this module will do
 * ────────────────────────
 *   1. Rename/create 3–8 keyword boards with real descriptions. Never DELETE
 *      a board (that wipes every pin on it). Leftover boards stay put.
 *   2. Delete 0-save stills that are visual duplicates of the same SKU, keeping
 *      every video and the single best remaining still. Cap per run. Does not
 *      empty the Created tab.
 *
 * What it will not do
 * ───────────────────
 *   • Rewrite the profile bio (no PATCH /user_account).
 *   • Mass-save other people's pins. Pinterest's Create Pin path is for original
 *     content; a repin bot is a ban risk. Saving from the home feed stays a
 *     30-second daily habit.
 *   • Raise pin volume. Cadence lives in pinterest-strategy.
 */

import { and, eq, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { pinterestHygieneEvents, socialCreatives } from "@/lib/db/schema";
import { notePinDeletedByHygiene } from "@/lib/social/creatives";
import {
  PinterestError,
  createBoard,
  deletePin,
  listAllPins,
  listBoards,
  updateBoard,
  type ListedPin,
  type PinterestBoard,
} from "@/lib/social/pinterest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const PINTEREST_MAX_PUBLIC_BOARDS = 8;
export const PINTEREST_MIN_PUBLIC_BOARDS = 3;

/** Never delete more than this many pins in one apply. */
export const PINTEREST_HYGIENE_MAX_DELETES = 80;
export const PINTEREST_HYGIENE_ADMIN_DELETE_CAP = 40;

const BURST_WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_GROUP_IMAGES = 3;
const DELETE_PAUSE_MS = 400;
const BOARD_PAUSE_MS = 300;

export type CanonicalBoard = {
  /** Short token board-router can match (hellokitty, sanrio, y2k, …). */
  key: string;
  name: string;
  description: string;
};

/**
 * Specific character/feature boards first so "Hello Kitty" is not swallowed by
 * "Sanrio" or the kawaii catch-all. Names keep the tokens resolveBoardForProduct
 * already matches (hellokitty, sanrio, y2k, charm, grip, magsafe, kawaii, gift).
 */
export const CANONICAL_BOARDS: readonly CanonicalBoard[] = [
  {
    key: "hellokitty",
    name: "Hello Kitty Phone Cases",
    description:
      "Hello Kitty iPhone cases, MagSafe covers, and kawaii Hello Kitty phone accessories. Pink bows, classic red, and Sanrio drops from Y2KASE.",
  },
  {
    key: "magsafe",
    name: "MagSafe Phone Cases",
    description:
      "MagSafe iPhone cases with kawaii and Y2K designs. Wireless-charging compatible covers that still look cute on camera.",
  },
  {
    key: "charm",
    name: "Phone Charms and Grips",
    description:
      "Beaded phone charms, shaker grips, and kawaii phone straps. Mix-and-match charms that clip onto Y2KASE cases.",
  },
  {
    key: "sanrio",
    name: "Sanrio Phone Cases",
    description:
      "Sanrio phone cases featuring Kuromi, My Melody, Cinnamoroll, and friends. Soft kawaii iPhone cases and matching charms.",
  },
  {
    key: "y2k",
    name: "Y2K Phone Accessories",
    description:
      "Y2K phone cases, chrome, rhinestone, and early-2000s iPhone accessories. Nostalgic Y2KASE drops for Gen-Z.",
  },
  {
    key: "gift",
    name: "Cute Gift Ideas",
    description:
      "Cute phone case gift ideas for teens and Gen-Z. Kawaii iPhone cases, Sanrio covers, and charm sets ready to wrap.",
  },
  {
    key: "kawaii",
    name: "Kawaii iPhone Cases",
    description:
      "Cute kawaii iPhone cases with 3D charms, pastel decoden, and Gen-Z phone accessories. Shop Y2KASE for cases that actually protect your phone.",
  },
];

const GENERIC_BOARD_KEYS = new Set([
  "social",
  "untitled",
  "pins",
  "board",
  "all",
  "allpins",
  "myboard",
  "stuff",
  "profile",
  "created",
]);

export function normBoardName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function boardKeysMatch(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return a === b;
  return a.includes(b) || b.includes(a);
}

function isSecretBoard(privacy: string | undefined): boolean {
  return (privacy ?? "PUBLIC").toUpperCase() === "SECRET";
}

function leftoverBoardDescription(name: string): string {
  return `${name} — kawaii and Y2K phone cases, charms, and grips from Y2KASE. Fresh drops that match this collection.`;
}

function descriptionsMatch(a: string | null | undefined, b: string): boolean {
  const na = (a ?? "").replace(/\s+/g, " ").trim();
  const nb = b.replace(/\s+/g, " ").trim();
  return na === nb;
}

export type BoardPlanAction =
  | {
      action: "update";
      id: string;
      fromName: string;
      name: string;
      description: string;
    }
  | { action: "create"; name: string; description: string }
  | { action: "keep"; id: string; name: string };

export type BoardPlan = {
  actions: BoardPlanAction[];
  publicCount: number;
  wouldCreate: number;
  wouldUpdate: number;
};

function matchScore(boardName: string, canonical: CanonicalBoard): number {
  const key = normBoardName(boardName);
  const want = normBoardName(canonical.name);
  if (key === want) return 100;
  if (boardKeysMatch(key, want)) return 70;
  if (boardKeysMatch(key, canonical.key)) return 55;
  return 0;
}

/**
 * Plan renames + fills for the canonical 7-board set. Never emits a delete.
 * Creates only while public boards would stay ≤ 8.
 */
export function planBoardActions(
  existing: Pick<PinterestBoard, "id" | "name" | "description" | "privacy">[],
  canonical: readonly CanonicalBoard[] = CANONICAL_BOARDS,
): BoardPlan {
  const publicBoards = existing.filter((b) => !isSecretBoard(b.privacy));
  const used = new Set<string>();
  const claimed = new Map<string, (typeof publicBoards)[number]>();

  for (const canon of canonical) {
    let best: { board: (typeof publicBoards)[number]; score: number } | null =
      null;
    for (const board of publicBoards) {
      if (used.has(board.id)) continue;
      const score = matchScore(board.name, canon);
      if (score < 55) continue;
      if (!best || score > best.score) best = { board, score };
    }
    if (best) {
      used.add(best.board.id);
      claimed.set(canon.key, best.board);
    }
  }

  // Generic leftover boards fill unmatched canonicals, preferring the
  // kawaii catch-all so "Social" does not become "Hello Kitty Phone Cases".
  const genericFillOrder = [...canonical].sort((a, b) => {
    if (a.key === "kawaii") return -1;
    if (b.key === "kawaii") return 1;
    return 0;
  });
  for (const canon of genericFillOrder) {
    if (claimed.has(canon.key)) continue;
    const generic = publicBoards.find(
      (b) => !used.has(b.id) && GENERIC_BOARD_KEYS.has(normBoardName(b.name)),
    );
    if (!generic) break;
    used.add(generic.id);
    claimed.set(canon.key, generic);
  }

  const actions: BoardPlanAction[] = [];
  let wouldCreate = 0;
  const room = Math.max(0, PINTEREST_MAX_PUBLIC_BOARDS - publicBoards.length);

  for (const canon of canonical) {
    const board = claimed.get(canon.key);
    if (board) {
      const sameName = board.name === canon.name;
      const sameDesc = descriptionsMatch(board.description, canon.description);
      if (sameName && sameDesc) {
        actions.push({ action: "keep", id: board.id, name: board.name });
      } else {
        actions.push({
          action: "update",
          id: board.id,
          fromName: board.name,
          name: canon.name,
          description: canon.description,
        });
      }
      continue;
    }
    if (wouldCreate < room) {
      actions.push({
        action: "create",
        name: canon.name,
        description: canon.description,
      });
      wouldCreate += 1;
    }
  }

  for (const board of publicBoards) {
    if (used.has(board.id)) continue;
    const existingDesc = (board.description ?? "").trim();
    if (existingDesc.length >= 40) {
      actions.push({ action: "keep", id: board.id, name: board.name });
      continue;
    }
    actions.push({
      action: "update",
      id: board.id,
      fromName: board.name,
      name: board.name,
      description: leftoverBoardDescription(board.name),
    });
  }

  return {
    actions,
    publicCount: publicBoards.length,
    wouldCreate,
    wouldUpdate: actions.filter((a) => a.action === "update").length,
  };
}

export function pdpSlugFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const match = url.pathname.match(/\/products\/([^/?#]+)/i);
    const slug = match?.[1]?.trim();
    return slug ? decodeURIComponent(slug).toLowerCase() : null;
  } catch {
    return null;
  }
}

export function productKeyFromLink(
  link: string | null | undefined,
  fallbackId: string,
): string {
  const slug = pdpSlugFromLink(link);
  if (slug) return `slug:${slug}`;
  if (link) {
    try {
      const url = new URL(link);
      return `url:${url.origin}${url.pathname}`.toLowerCase();
    } catch {
      return `url:${link.split("?")[0]?.toLowerCase() ?? fallbackId}`;
    }
  }
  return `pin:${fallbackId}`;
}

export function pinEngagementScore(pin: {
  saves: number;
  outbound: number;
  impressions: number;
}): number {
  return pin.saves * 1000 + pin.outbound * 200 + pin.impressions;
}

export type HygienePin = {
  id: string;
  createdAt: string | null;
  link: string | null;
  title: string | null;
  isVideo: boolean;
  isOwner: boolean;
  saves: number;
  outbound: number;
  impressions: number;
  productKey: string;
};

export type DuplicateDelete = {
  id: string;
  reason: string;
  title: string | null;
  productKey: string;
  createdAt: string | null;
};

export type DuplicatePlan = {
  deletes: DuplicateDelete[];
  kept: { id: string; reason: string; productKey: string }[];
  groupsScanned: number;
  eligibleGroups: number;
};

function createdMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function isBurst(images: HygienePin[], nowMs: number): boolean {
  if (images.length < MIN_GROUP_IMAGES) return false;
  const times = images
    .map((p) => createdMs(p.createdAt) || nowMs)
    .sort((a, b) => a - b);
  for (let i = 0; i < times.length; i++) {
    let count = 1;
    for (let j = i + 1; j < times.length; j++) {
      if (times[j]! - times[i]! <= BURST_WINDOW_MS) count += 1;
      else break;
    }
    if (count >= MIN_GROUP_IMAGES) return true;
  }
  return false;
}

/**
 * Keep every video + the best still per SKU. Delete other 0-save / 0-outbound
 * stills only when the group is a same-SKU burst (≥3 stills in 48h) or the
 * extra stills are ≥14 days old. Never touches unique pins or pins with saves.
 */
export function planDuplicateDeletes(
  pins: HygienePin[],
  now: Date = new Date(),
  opts: { maxDeletes?: number } = {},
): DuplicatePlan {
  const maxDeletes = opts.maxDeletes ?? PINTEREST_HYGIENE_MAX_DELETES;
  const nowMs = now.getTime();
  const kept: DuplicatePlan["kept"] = [];
  const deletes: DuplicateDelete[] = [];

  const owned = pins.filter((p) => p.isOwner);
  const groups = new Map<string, HygienePin[]>();
  for (const pin of owned) {
    const list = groups.get(pin.productKey) ?? [];
    list.push(pin);
    groups.set(pin.productKey, list);
  }

  let eligibleGroups = 0;
  for (const [productKey, group] of groups) {
    if (productKey.startsWith("pin:")) {
      for (const pin of group) {
        kept.push({ id: pin.id, reason: "unique pin (no product link)", productKey });
      }
      continue;
    }

    const videos = group.filter((p) => p.isVideo);
    const images = group.filter((p) => !p.isVideo);
    for (const video of videos) {
      kept.push({ id: video.id, reason: "keep video", productKey });
    }

    if (images.length < 2) {
      for (const pin of images) {
        kept.push({ id: pin.id, reason: "only still of this SKU", productKey });
      }
      continue;
    }

    const ranked = [...images].sort((a, b) => {
      const score = pinEngagementScore(b) - pinEngagementScore(a);
      if (score !== 0) return score;
      return createdMs(b.createdAt) - createdMs(a.createdAt);
    });
    const winner = ranked[0]!;
    kept.push({ id: winner.id, reason: "best still of this SKU", productKey });

    const extras = ranked.slice(1);
    const zeroEngagement = extras.filter((p) => p.saves === 0 && p.outbound === 0);
    if (images.length < MIN_GROUP_IMAGES || zeroEngagement.length === 0) {
      for (const pin of extras) {
        kept.push({
          id: pin.id,
          reason:
            pin.saves > 0 || pin.outbound > 0
              ? "has saves or outbound clicks"
              : "group too small to treat as a duplicate row",
          productKey,
        });
      }
      continue;
    }

    const burst = isBurst(images, nowMs);
    eligibleGroups += 1;
    for (const pin of extras) {
      if (pin.saves > 0 || pin.outbound > 0) {
        kept.push({ id: pin.id, reason: "has saves or outbound clicks", productKey });
        continue;
      }
      const age = nowMs - (createdMs(pin.createdAt) || nowMs);
      if (!burst && age < MIN_AGE_MS) {
        kept.push({
          id: pin.id,
          reason: "too new and not part of a 48h burst",
          productKey,
        });
        continue;
      }
      deletes.push({
        id: pin.id,
        reason: burst
          ? "0-save still in a same-SKU burst"
          : "0-save still, 14+ days, duplicate of a better pin",
        title: pin.title,
        productKey,
        createdAt: pin.createdAt,
      });
    }
  }

  deletes.sort((a, b) => a.productKey.localeCompare(b.productKey));
  return {
    deletes: deletes.slice(0, maxDeletes),
    kept,
    groupsScanned: groups.size,
    eligibleGroups,
  };
}

export type DbPinMeta = {
  productId: number | null;
  productSlug: string | null;
  productTitle: string | null;
  mediaType: string | null;
  saves: number | null;
  impressions: number | null;
  outbound: number | null;
};

export async function loadPublishedPinIndex(): Promise<Map<string, DbPinMeta>> {
  const map = new Map<string, DbPinMeta>();
  if (!isDbConfigured()) return map;
  const rows = await db
    .select({
      externalId: socialCreatives.externalId,
      productId: socialCreatives.productId,
      productSlug: socialCreatives.productSlug,
      productTitle: socialCreatives.productTitle,
      mediaType: socialCreatives.mediaType,
      saves: socialCreatives.metricSaves,
      impressions: socialCreatives.metricImpressions,
      outbound: socialCreatives.metricOutboundClicks,
    })
    .from(socialCreatives)
    .where(
      and(
        eq(socialCreatives.platform, "pinterest"),
        eq(socialCreatives.status, "published"),
      ),
    );
  for (const row of rows) {
    if (!row.externalId) continue;
    map.set(row.externalId, {
      productId: row.productId,
      productSlug: row.productSlug,
      productTitle: row.productTitle,
      mediaType: row.mediaType,
      saves: row.saves,
      impressions: row.impressions,
      outbound: row.outbound,
    });
  }
  return map;
}

export function mergeListedPin(
  pin: ListedPin,
  dbMeta: DbPinMeta | undefined,
): HygienePin {
  const slug = dbMeta?.productSlug?.trim().toLowerCase() || pdpSlugFromLink(pin.link);
  const productKey = slug
    ? `slug:${slug}`
    : dbMeta?.productId
      ? `product:${dbMeta.productId}`
      : productKeyFromLink(pin.link, pin.id);
  return {
    id: pin.id,
    createdAt: pin.createdAt,
    link: pin.link,
    title: pin.title ?? dbMeta?.productTitle ?? null,
    isVideo: pin.isVideo || dbMeta?.mediaType === "video",
    isOwner: pin.isOwner,
    saves: Math.max(pin.saves, dbMeta?.saves ?? 0),
    outbound: Math.max(pin.outbound, dbMeta?.outbound ?? 0),
    impressions: Math.max(pin.impressions, dbMeta?.impressions ?? 0),
    productKey,
  };
}

export async function previewBoards(): Promise<{
  boards: PinterestBoard[];
  plan: BoardPlan;
}> {
  const boards = await listBoards();
  return { boards, plan: planBoardActions(boards) };
}

export async function previewDuplicateDeletes(opts: { maxDeletes?: number } = {}): Promise<{
  pinCount: number;
  plan: DuplicatePlan;
}> {
  const [pins, index] = await Promise.all([
    listAllPins(),
    loadPublishedPinIndex(),
  ]);
  const merged = pins.map((p) => mergeListedPin(p, index.get(p.id)));
  return {
    pinCount: pins.length,
    plan: planDuplicateDeletes(merged, new Date(), {
      maxDeletes: opts.maxDeletes ?? PINTEREST_HYGIENE_MAX_DELETES,
    }),
  };
}

async function recordHygieneEvent(
  kind: string,
  subject: string,
  detail?: string,
): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "pinterest_hygiene_events" (
        "id" serial PRIMARY KEY,
        "kind" text NOT NULL,
        "subject" text NOT NULL,
        "detail" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.insert(pinterestHygieneEvents).values({
      kind,
      subject,
      detail: detail ?? null,
    });
  } catch (err) {
    console.warn("[pinterest-hygiene] log insert failed:", err);
  }
}

export type ApplyBoardsResult = {
  updated: number;
  created: number;
  skipped: number;
  errors: string[];
};

export async function applyBoardPlan(
  plan?: BoardPlan,
): Promise<ApplyBoardsResult> {
  const resolved = plan ?? (await previewBoards()).plan;
  const result: ApplyBoardsResult = {
    updated: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };
  for (const action of resolved.actions) {
    try {
      if (action.action === "keep") {
        result.skipped += 1;
        continue;
      }
      if (action.action === "update") {
        await updateBoard(action.id, {
          name: action.name,
          description: action.description,
        });
        await recordHygieneEvent(
          "board-update",
          action.id,
          `${action.fromName} → ${action.name}`,
        );
        result.updated += 1;
        await sleep(BOARD_PAUSE_MS);
        continue;
      }
      await createBoard({
        name: action.name,
        description: action.description,
      });
      await recordHygieneEvent("board-create", action.name);
      result.created += 1;
      await sleep(BOARD_PAUSE_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${action.action} ${action.name}: ${message}`);
    }
  }
  return result;
}

export type ApplyDeletesResult = {
  deleted: number;
  failed: number;
  errors: string[];
  remaining: number;
};

export async function applyDuplicateDeletes(
  deletes: DuplicateDelete[],
): Promise<ApplyDeletesResult> {
  const cap = Math.min(deletes.length, PINTEREST_HYGIENE_MAX_DELETES);
  const result: ApplyDeletesResult = {
    deleted: 0,
    failed: 0,
    errors: [],
    remaining: Math.max(0, deletes.length - cap),
  };
  for (const item of deletes.slice(0, cap)) {
    try {
      await deletePin(item.id);
      await notePinDeletedByHygiene(item.id);
      await recordHygieneEvent("pin-delete", item.id, item.reason);
      result.deleted += 1;
    } catch (err) {
      result.failed += 1;
      const status = err instanceof PinterestError ? err.status : 0;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 404) {
        await notePinDeletedByHygiene(item.id);
        result.deleted += 1;
        result.failed -= 1;
      } else {
        result.errors.push(`${item.id}: ${message}`);
      }
    }
    await sleep(DELETE_PAUSE_MS);
  }
  return result;
}
