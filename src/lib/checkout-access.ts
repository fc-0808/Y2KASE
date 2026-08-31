import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const CHECKOUT_ACCESS_COOKIE_PREFIX = "y2kase_checkout_access";
export const CHECKOUT_ACCESS_TTL_SECONDS = 24 * 60 * 60;

const VERSION = 1;
const CONTEXT = "y2kase:checkout-access:";

type CheckoutAccessPayload = {
  v: typeof VERSION;
  sessionId: string;
  orderId: number;
  expiresAt: number;
};

function secret(): string {
  const configured =
    process.env.CHECKOUT_ACCESS_SECRET ??
    process.env.BETTER_AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET or CHECKOUT_ACCESS_SECRET is required in production.",
    );
  }
  return "y2kase-checkout-access-development-secret";
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", secret())
    .update(`${CONTEXT}${encodedPayload}`)
    .digest("base64url");
}

export function checkoutAccessCookieName(sessionId: string): string {
  const suffix = createHash("sha256")
    .update(sessionId)
    .digest("hex")
    .slice(0, 12);
  return `${CHECKOUT_ACCESS_COOKIE_PREFIX}_${suffix}`;
}

export function createCheckoutAccessToken(
  sessionId: string,
  orderId: number,
  now = Date.now(),
): string {
  const payload: CheckoutAccessPayload = {
    v: VERSION,
    sessionId,
    orderId,
    expiresAt: now + CHECKOUT_ACCESS_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${signature(encoded)}`;
}

export function verifyCheckoutAccessToken(
  token: string | null | undefined,
  sessionId: string,
  orderId: number,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return false;

  const encoded = token.slice(0, dot);
  const supplied = token.slice(dot + 1);
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
    const payload = parsed as Partial<CheckoutAccessPayload>;
    return (
      payload.v === VERSION &&
      payload.sessionId === sessionId &&
      payload.orderId === orderId &&
      typeof payload.expiresAt === "number" &&
      Number.isFinite(payload.expiresAt) &&
      payload.expiresAt >= now
    );
  } catch {
    return false;
  }
}
