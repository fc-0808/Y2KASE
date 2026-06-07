/**
 * token-store — DB-backed OAuth token management for the Social Studio.
 *
 * One row per platform in `social_tokens`. The Social Studio reads from here
 * first; env vars serve as a manual fallback. This lets us rotate tokens
 * automatically (via cron) without touching Vercel env vars each time.
 */

import { db } from "@/lib/db";
import { socialTokens, type SocialToken } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type TokenUpsert = {
  accessToken: string;
  refreshToken?: string | null;
  /** seconds from now */
  expiresIn?: number;
  /** seconds from now */
  refreshExpiresIn?: number;
  scopes?: string;
  accountId?: string;
  accountName?: string;
};

function secondsFromNow(s: number): Date {
  return new Date(Date.now() + s * 1000);
}

export async function upsertToken(
  platform: string,
  data: TokenUpsert,
): Promise<void> {
  await db
    .insert(socialTokens)
    .values({
      platform,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresIn ? secondsFromNow(data.expiresIn) : null,
      refreshExpiresAt: data.refreshExpiresIn
        ? secondsFromNow(data.refreshExpiresIn)
        : null,
      scopes: data.scopes ?? null,
      accountId: data.accountId ?? null,
      accountName: data.accountName ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: socialTokens.platform,
      set: {
        accessToken: data.accessToken,
        ...(data.refreshToken !== undefined
          ? { refreshToken: data.refreshToken }
          : {}),
        ...(data.expiresIn !== undefined
          ? { expiresAt: secondsFromNow(data.expiresIn) }
          : {}),
        ...(data.refreshExpiresIn !== undefined
          ? { refreshExpiresAt: secondsFromNow(data.refreshExpiresIn) }
          : {}),
        ...(data.scopes !== undefined ? { scopes: data.scopes } : {}),
        ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        ...(data.accountName !== undefined
          ? { accountName: data.accountName }
          : {}),
        updatedAt: new Date(),
      },
    });
}

export async function getToken(
  platform: string,
): Promise<SocialToken | undefined> {
  const rows = await db
    .select()
    .from(socialTokens)
    .where(eq(socialTokens.platform, platform))
    .limit(1);
  return rows[0];
}

export async function deleteToken(platform: string): Promise<void> {
  await db.delete(socialTokens).where(eq(socialTokens.platform, platform));
}

/** True when access token exists and hasn't expired. */
export function isTokenValid(token: SocialToken): boolean {
  if (!token.accessToken) return false;
  if (!token.expiresAt) return true; // unknown expiry → assume valid
  return token.expiresAt.getTime() > Date.now() + 60_000; // 1-min buffer
}

/** True when the refresh token exists and hasn't expired. */
export function canRefresh(token: SocialToken): boolean {
  if (!token.refreshToken) return false;
  if (!token.refreshExpiresAt) return true;
  return token.refreshExpiresAt.getTime() > Date.now() + 60_000;
}

/** True when access token expires within `windowMs` (default 7 days). */
export function expiresWithin(
  token: SocialToken,
  windowMs = 7 * 24 * 60 * 60 * 1000,
): boolean {
  if (!token.expiresAt) return false;
  return token.expiresAt.getTime() < Date.now() + windowMs;
}
