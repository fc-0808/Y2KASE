/**
 * Pinterest follow drip — look like a Pinner, not a broadcast bot.
 *
 * Following 0 reads as a shop firehose. The recovery play is 50–100 real
 * accounts in the niche, a few per day, never a blast. This module holds a
 * curated handle list and follows the next unpaid batch once per UTC day.
 *
 * `user_accounts:write` is a beta scope. If follow returns 403, reconnect
 * Pinterest at /admin/social so the new grant is on the token.
 *
 * Saving other people's pins is intentionally not automated.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { pinterestHygieneEvents } from "@/lib/db/schema";
import {
  PINTEREST_FOLLOW_SCOPE,
  tokenHasScope,
} from "@/lib/social/pinterest-auth";
import {
  PinterestError,
  followUser,
  listFollowing,
} from "@/lib/social/pinterest";
import { getToken } from "@/lib/social/token-store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const PINTEREST_DEFAULT_FOLLOWS_PER_DAY = 5;
export const PINTEREST_MAX_FOLLOWS_PER_DAY = 8;
export const PINTEREST_FOLLOW_PAUSE_MS = 800;
export const PINTEREST_FOLLOW_TARGET_COUNT = 50;

/**
 * Real niche accounts: phone-case brands, Sanrio/kawaii, Y2K fashion, Gen-Z
 * magazines. Skip 404s permanently. Do not include @y2kase.
 */
export const PINTEREST_FOLLOW_TARGETS: readonly string[] = [
  "casetify",
  "sonix",
  "casely",
  "burga",
  "rhinoshield",
  "velvetcaviar",
  "wildflowercases",
  "popsockets",
  "speckproducts",
  "otterbox",
  "loopycases",
  "sanrio",
  "hellokitty",
  "tokidoki",
  "pusheen",
  "linefriends",
  "bt21",
  "kakaofriends",
  "rilakkuma",
  "miffy",
  "aggretsuko",
  "japanla",
  "kawaiibox",
  "jetpens",
  "tokyotreat",
  "bokksu",
  "yesstyle",
  "miniso",
  "urbanoutfitters",
  "dollskill",
  "hottopic",
  "boxlunch",
  "pacsun",
  "forever21",
  "nastygal",
  "modcloth",
  "uniquevintage",
  "freepeople",
  "anthropologie",
  "aerie",
  "glossier",
  "colourpopcosmetics",
  "teenvogue",
  "papermagazine",
  "nylonmag",
  "refinery29",
  "whowhatwear",
  "allure",
  "cosmopolitan",
  "seventeen",
  "pinterestfashion",
  "nintendo",
  "pokemon",
  "crunchyroll",
  "smokonow",
  "kawaiiuniverse",
  "japancentre",
  "daiso",
  "uniqlo",
  "targetstyle",
];

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function pinterestFollowsPerDay(
  raw: string | undefined = process.env.PINTEREST_FOLLOW_PER_DAY,
): number {
  return clampInt(
    raw,
    PINTEREST_DEFAULT_FOLLOWS_PER_DAY,
    1,
    PINTEREST_MAX_FOLLOWS_PER_DAY,
  );
}

/** Follow drip is on unless explicitly set to "false". */
export function isFollowDripEnabled(
  raw: string | undefined = process.env.PINTEREST_FOLLOW_ENABLED,
): boolean {
  if (raw == null || raw.trim() === "") return true;
  return raw.trim().toLowerCase() !== "false";
}

export function normalizeFollowUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function remainingFollowTargets(
  alreadyFollowing: Iterable<string>,
  skipped: Iterable<string> = [],
  targets: readonly string[] = PINTEREST_FOLLOW_TARGETS,
): string[] {
  const have = new Set(
    [...alreadyFollowing].map(normalizeFollowUsername).filter(Boolean),
  );
  const skip = new Set(
    [...skipped].map(normalizeFollowUsername).filter(Boolean),
  );
  have.add("y2kase");
  skip.add("y2kase");
  return targets
    .map(normalizeFollowUsername)
    .filter((u, i, arr) => u && arr.indexOf(u) === i)
    .filter((u) => !have.has(u) && !skip.has(u));
}

function utcDayStart(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function ensureHygieneTable(): Promise<void> {
  if (!isDbConfigured()) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "pinterest_hygiene_events" (
      "id" serial PRIMARY KEY,
      "kind" text NOT NULL,
      "subject" text NOT NULL,
      "detail" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function recordEvent(
  kind: string,
  subject: string,
  detail?: string,
): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    await ensureHygieneTable();
    await db.insert(pinterestHygieneEvents).values({
      kind,
      subject,
      detail: detail ?? null,
    });
  } catch (err) {
    console.warn("[pinterest-follow] log insert failed:", err);
  }
}

export async function followsPostedToday(now = new Date()): Promise<number> {
  if (!isDbConfigured()) return 0;
  try {
    await ensureHygieneTable();
    const rows = await db
      .select({ id: pinterestHygieneEvents.id })
      .from(pinterestHygieneEvents)
      .where(
        and(
          eq(pinterestHygieneEvents.kind, "follow"),
          gte(pinterestHygieneEvents.createdAt, utcDayStart(now)),
        ),
      );
    return rows.length;
  } catch {
    return 0;
  }
}

export async function skippedFollowUsernames(): Promise<Set<string>> {
  const skip = new Set<string>();
  if (!isDbConfigured()) return skip;
  try {
    await ensureHygieneTable();
    const rows = await db
      .select({ subject: pinterestHygieneEvents.subject })
      .from(pinterestHygieneEvents)
      .where(eq(pinterestHygieneEvents.kind, "follow-skip"));
    for (const row of rows) {
      skip.add(normalizeFollowUsername(row.subject));
    }
  } catch {
    // table missing on a fresh env — treat as empty
  }
  return skip;
}

export type FollowSnapshot = {
  followingCount: number;
  remaining: string[];
  nextUsernames: string[];
  followedToday: number;
  perDay: number;
  enabled: boolean;
  hasWriteScope: boolean;
  needsReconnect: boolean;
  error?: string;
};

export async function getFollowSnapshot(): Promise<FollowSnapshot> {
  const perDay = pinterestFollowsPerDay();
  const enabled = isFollowDripEnabled();
  const token = await getToken("pinterest");
  const hasWriteScope = token?.scopes
    ? tokenHasScope(token.scopes, PINTEREST_FOLLOW_SCOPE)
    : true;

  try {
    const [following, skipped, followedToday] = await Promise.all([
      listFollowing(),
      skippedFollowUsernames(),
      followsPostedToday(),
    ]);
    const remaining = remainingFollowTargets(
      following.map((u) => u.username),
      skipped,
    );
    return {
      followingCount: following.length,
      remaining,
      nextUsernames: remaining.slice(0, Math.max(0, perDay - followedToday)),
      followedToday,
      perDay,
      enabled,
      hasWriteScope,
      needsReconnect: Boolean(token?.scopes) && !hasWriteScope,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof PinterestError ? err.status : 0;
    return {
      followingCount: 0,
      remaining: remainingFollowTargets([], []),
      nextUsernames: [],
      followedToday: 0,
      perDay,
      enabled,
      hasWriteScope,
      needsReconnect: status === 401 || status === 403 || !hasWriteScope,
      error: message,
    };
  }
}

export type FollowDripResult = {
  followed: string[];
  skipped: string[];
  remaining: number;
  followingCount: number;
  reason:
    | "ok"
    | "disabled"
    | "daily-cap"
    | "caught-up"
    | "needs-reconnect"
    | "forbidden"
    | "rate-limited"
    | "error";
  message: string;
};

export async function runFollowDrip(opts: { max?: number } = {}): Promise<FollowDripResult> {
  if (!isFollowDripEnabled()) {
    return {
      followed: [],
      skipped: [],
      remaining: 0,
      followingCount: 0,
      reason: "disabled",
      message: "Pinterest follow drip is off (PINTEREST_FOLLOW_ENABLED=false).",
    };
  }

  const perDay = pinterestFollowsPerDay();
  const followedToday = await followsPostedToday();
  const room = Math.max(0, perDay - followedToday);
  const max = Math.min(opts.max ?? room, room, PINTEREST_MAX_FOLLOWS_PER_DAY);

  const snapshot = await getFollowSnapshot();
  if (snapshot.needsReconnect && !snapshot.hasWriteScope) {
    return {
      followed: [],
      skipped: [],
      remaining: snapshot.remaining.length,
      followingCount: snapshot.followingCount,
      reason: "needs-reconnect",
      message:
        "Reconnect Pinterest at /admin/social so the token includes user_accounts:write (required to follow).",
    };
  }
  if (max <= 0) {
    return {
      followed: [],
      skipped: [],
      remaining: snapshot.remaining.length,
      followingCount: snapshot.followingCount,
      reason: "daily-cap",
      message: `Already followed ${followedToday}/${perDay} accounts today.`,
    };
  }
  if (snapshot.remaining.length === 0) {
    return {
      followed: [],
      skipped: [],
      remaining: 0,
      followingCount: snapshot.followingCount,
      reason: "caught-up",
      message: `Already following ${snapshot.followingCount} curated niche accounts.`,
    };
  }

  const followed: string[] = [];
  const skipped: string[] = [];
  let followingCount = snapshot.followingCount;
  let reason: FollowDripResult["reason"] = "ok";
  let message = "";

  for (const username of snapshot.remaining.slice(0, max)) {
    try {
      await followUser(username);
      await recordEvent("follow", username);
      followed.push(username);
      followingCount += 1;
    } catch (err) {
      const status = err instanceof PinterestError ? err.status : 0;
      const errMessage = err instanceof Error ? err.message : String(err);
      if (status === 404) {
        await recordEvent("follow-skip", username, "not found");
        skipped.push(username);
      } else if (status === 409) {
        await recordEvent("follow", username, "already following");
        followed.push(username);
        followingCount += 1;
      } else if (status === 401 || status === 403) {
        reason = status === 403 ? "forbidden" : "needs-reconnect";
        message =
          status === 403
            ? "Pinterest refused follow (scope is beta or missing). Reconnect at /admin/social."
            : "Pinterest authentication failed. Reconnect at /admin/social.";
        break;
      } else if (status === 429) {
        reason = "rate-limited";
        message = "Pinterest rate-limited follows. Stopping for today.";
        break;
      } else {
        reason = "error";
        message = errMessage;
        break;
      }
    }
    await sleep(PINTEREST_FOLLOW_PAUSE_MS);
  }

  if (reason === "ok") {
    const left = snapshot.remaining.length - followed.length - skipped.length;
    message = `Followed ${followed.length} account${followed.length === 1 ? "" : "s"}${
      skipped.length ? ` · skipped ${skipped.length} missing handles` : ""
    }. ${Math.max(0, left)} left in the niche list.`;
  }

  return {
    followed,
    skipped,
    remaining: Math.max(
      0,
      snapshot.remaining.length - followed.length - skipped.length,
    ),
    followingCount,
    reason,
    message,
  };
}
