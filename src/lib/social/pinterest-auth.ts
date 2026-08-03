/**
 * Pinterest OAuth token lifecycle — refresh, validity, and self-healing.
 *
 * Access tokens last ~30 days; refresh tokens ~60 days. A sparse refresh cron
 * previously left a multi-day window where the access token could expire while
 * the refresh token was still valid — which is exactly what halted auto-pin on
 * 2026-07-29. This module is the single source of truth for keeping the token
 * usable before any Pinterest API call.
 */

import {
  canRefresh,
  expiresWithin,
  getToken,
  isTokenValid,
  upsertToken,
  type SocialToken,
} from "@/lib/social/token-store";

const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";

/** Refresh when access token is already expired or will expire within this window. */
export const PINTEREST_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type PinterestTokenRefreshResult =
  | { ok: true; refreshed: boolean; reason: "valid" | "refreshed" | "env-fallback" }
  | {
      ok: false;
      reason:
        | "no-token"
        | "no-refresh-token"
        | "not-configured"
        | "api-error"
        | "unexpected";
      message: string;
    };

/** True when a publish/API error is an auth failure (token dead / revoked). */
export function isPinterestAuthError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("authentication failed") ||
    m.includes("api 401") ||
    m.includes("unauthorized") ||
    m.includes("invalid access token") ||
    m.includes("access token is invalid")
  );
}

function appCredentials(): { id: string; secret: string } | null {
  const id = process.env.PINTEREST_APP_ID ?? "";
  const secret = process.env.PINTEREST_APP_SECRET ?? "";
  if (!id || !secret) return null;
  return { id, secret };
}

/**
 * Exchange the stored refresh token for a fresh access (+ refresh) token pair.
 * Throws on HTTP / network failure; callers map that into structured results.
 */
export async function refreshPinterestToken(
  row: SocialToken,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  scope?: string;
}> {
  if (!canRefresh(row)) {
    throw new Error(
      "Pinterest refresh token is missing or expired. Reconnect at /admin/social.",
    );
  }
  const creds = appCredentials();
  if (!creds) {
    throw new Error("PINTEREST_APP_ID / PINTEREST_APP_SECRET not set.");
  }

  const credentials = Buffer.from(`${creds.id}:${creds.secret}`).toString(
    "base64",
  );
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refreshToken!,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
  };

  await upsertToken("pinterest", {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? row.refreshToken,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_token_expires_in,
    scopes: data.scope ?? row.scopes ?? undefined,
    accountId: row.accountId ?? undefined,
    accountName: row.accountName ?? undefined,
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? row.refreshToken!,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_token_expires_in,
    scope: data.scope,
  };
}

/**
 * Ensure a usable Pinterest access token is available.
 *
 * - Valid DB token → return as-is
 * - Expired / near-expiry DB token with refresh → rotate, then return
 * - No usable DB token → env `PINTEREST_ACCESS_TOKEN` fallback
 *
 * Pass `force: true` after a 401 to force a refresh even if `expires_at`
 * still looks valid (clock skew / revoked token).
 */
export async function ensurePinterestAccessToken(
  opts: { force?: boolean } = {},
): Promise<PinterestTokenRefreshResult & { accessToken?: string }> {
  let row: SocialToken | undefined;
  try {
    row = await getToken("pinterest");
  } catch {
    row = undefined;
  }

  const envToken = process.env.PINTEREST_ACCESS_TOKEN?.trim() || "";

  if (row?.accessToken) {
    const needsRefresh =
      opts.force ||
      !isTokenValid(row) ||
      expiresWithin(row, PINTEREST_REFRESH_WINDOW_MS);

    if (!needsRefresh) {
      return {
        ok: true,
        refreshed: false,
        reason: "valid",
        accessToken: row.accessToken,
      };
    }

    if (canRefresh(row) && appCredentials()) {
      try {
        const fresh = await refreshPinterestToken(row);
        console.info("[pinterest-auth] Access token refreshed.");
        return {
          ok: true,
          refreshed: true,
          reason: "refreshed",
          accessToken: fresh.accessToken,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[pinterest-auth] Refresh failed:", message);
        // Fall through to env fallback only when the DB token is unusable.
        if (isTokenValid(row) && !opts.force) {
          return {
            ok: true,
            refreshed: false,
            reason: "valid",
            accessToken: row.accessToken,
          };
        }
        if (envToken && envToken !== row.accessToken) {
          return {
            ok: true,
            refreshed: false,
            reason: "env-fallback",
            accessToken: envToken,
          };
        }
        return {
          ok: false,
          reason: message.includes("APP_ID") ? "not-configured" : "api-error",
          message,
        };
      }
    }

    // Cannot refresh — use DB token if still valid, else env.
    if (isTokenValid(row) && !opts.force) {
      return {
        ok: true,
        refreshed: false,
        reason: "valid",
        accessToken: row.accessToken,
      };
    }
    if (envToken) {
      return {
        ok: true,
        refreshed: false,
        reason: "env-fallback",
        accessToken: envToken,
      };
    }
    if (!canRefresh(row)) {
      return {
        ok: false,
        reason: "no-refresh-token",
        message:
          "Pinterest access token expired and no refresh token is available. Reconnect at /admin/social.",
      };
    }
    return {
      ok: false,
      reason: "not-configured",
      message: "PINTEREST_APP_ID / PINTEREST_APP_SECRET not set.",
    };
  }

  if (envToken) {
    return {
      ok: true,
      refreshed: false,
      reason: "env-fallback",
      accessToken: envToken,
    };
  }

  return {
    ok: false,
    reason: "no-token",
    message:
      "No Pinterest token in DB or env. Connect via /admin/social or set PINTEREST_ACCESS_TOKEN.",
  };
}

/**
 * Cron / ops entrypoint: refresh only when due (expired or within window).
 * Idempotent — safe to run daily.
 */
export async function refreshPinterestTokenIfDue(): Promise<PinterestTokenRefreshResult> {
  const row = await getToken("pinterest");
  if (!row) {
    return {
      ok: false,
      reason: "no-token",
      message: "No Pinterest token in DB. Connect via /admin/social first.",
    };
  }

  if (isTokenValid(row) && !expiresWithin(row, PINTEREST_REFRESH_WINDOW_MS)) {
    return {
      ok: true,
      refreshed: false,
      reason: "valid",
    };
  }

  if (!canRefresh(row)) {
    return {
      ok: false,
      reason: "no-refresh-token",
      message:
        "Refresh token missing or expired. Please reconnect Pinterest at /admin/social.",
    };
  }

  if (!appCredentials()) {
    return {
      ok: false,
      reason: "not-configured",
      message: "PINTEREST_APP_ID / PINTEREST_APP_SECRET not set.",
    };
  }

  try {
    await refreshPinterestToken(row);
    return { ok: true, refreshed: true, reason: "refreshed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pinterest-auth] Scheduled refresh failed:", message);
    return { ok: false, reason: "api-error", message };
  }
}
