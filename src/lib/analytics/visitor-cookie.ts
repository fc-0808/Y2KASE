import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidVisitorId } from "@/lib/analytics/bot-defense";

const PROOF_CONTEXT = "y2kase-analytics-visitor-v1";

function signingSecret(): string {
  const configured =
    process.env.ANALYTICS_COOKIE_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "";
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ANALYTICS_COOKIE_SECRET or BETTER_AUTH_SECRET is required in production.",
    );
  }
  return "y2kase-local-analytics-cookie-secret";
}

/**
 * Bind a server-minted visitor UUID to this deployment's secret. The proof
 * prevents a caller from manufacturing endless "unique" IDs in a single-step
 * POST; a browser first has to receive and return both HttpOnly cookies.
 */
export function createVisitorProof(visitorId: string): string {
  if (!isValidVisitorId(visitorId)) {
    throw new Error("Cannot sign an invalid analytics visitor id.");
  }
  // Derive a purpose-specific subkey before signing. BETTER_AUTH_SECRET can be
  // the root secret, but an analytics signing oracle must never share the exact
  // key consumed by auth, unsubscribe or checkout token protocols.
  const key = createHmac("sha256", signingSecret())
    .update(PROOF_CONTEXT)
    .digest();
  return createHmac("sha256", key)
    .update(visitorId)
    .digest("base64url");
}

export function verifyVisitorProof(
  visitorId: string | null | undefined,
  proof: string | null | undefined,
): boolean {
  if (!isValidVisitorId(visitorId) || !proof || !/^[\w-]{43}$/.test(proof)) {
    return false;
  }

  const expected = Buffer.from(createVisitorProof(visitorId!), "base64url");
  const supplied = Buffer.from(proof, "base64url");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
