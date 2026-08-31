import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type SocialOAuthProvider = "meta" | "pinterest" | "tiktok";

const STATE_VERSION = 1;
const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_CONTEXT = "y2kase:social-oauth:";

type StatePayload = {
  v: typeof STATE_VERSION;
  provider: SocialOAuthProvider;
  adminId: string;
  nonce: string;
  expiresAt: number;
};

function secret(): string {
  const value =
    process.env.SOCIAL_OAUTH_STATE_SECRET ??
    process.env.BETTER_AUTH_SECRET;
  if (!value) {
    throw new Error(
      "BETTER_AUTH_SECRET or SOCIAL_OAUTH_STATE_SECRET is required for social OAuth.",
    );
  }
  return value;
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", secret())
    .update(`${STATE_CONTEXT}${encodedPayload}`)
    .digest("base64url");
}

export function createSocialOAuthState(
  provider: SocialOAuthProvider,
  adminId: string,
  now = Date.now(),
): string {
  const payload: StatePayload = {
    v: STATE_VERSION,
    provider,
    adminId,
    nonce: randomBytes(18).toString("base64url"),
    expiresAt: now + STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${signature(encoded)}`;
}

export function verifySocialOAuthState(
  state: string | null,
  provider: SocialOAuthProvider,
  adminId: string,
  now = Date.now(),
): boolean {
  if (!state) return false;
  const dot = state.indexOf(".");
  if (dot <= 0 || dot !== state.lastIndexOf(".")) return false;

  const encoded = state.slice(0, dot);
  const supplied = state.slice(dot + 1);
  try {
    const expected = signature(encoded);
    if (supplied.length !== expected.length) return false;
    if (
      !timingSafeEqual(
        Buffer.from(supplied, "utf8"),
        Buffer.from(expected, "utf8"),
      )
    ) {
      return false;
    }

    const parsed: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const payload = parsed as Partial<StatePayload>;
    return (
      payload.v === STATE_VERSION &&
      payload.provider === provider &&
      payload.adminId === adminId &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 16 &&
      typeof payload.expiresAt === "number" &&
      Number.isFinite(payload.expiresAt) &&
      payload.expiresAt >= now
    );
  } catch {
    return false;
  }
}
