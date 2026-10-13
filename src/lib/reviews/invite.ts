/**
 * Signed review links — SERVER ONLY.
 *
 * The email link is a capability: it proves the recipient was asked to review
 * one product on one order. It does not contain the buyer's email. Guest
 * checkout can publish a verified review without creating an account.
 * A typed email address still cannot.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { REVIEW_INVITE_TTL_SECONDS } from "@/lib/reviews/schedule";

export type ReviewInvite = {
  orderId: number;
  productId: number;
  expiresAt: number;
};

function signingKey(): Buffer {
  const secret =
    process.env.REVIEW_INVITE_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "";
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "REVIEW_INVITE_SECRET or BETTER_AUTH_SECRET is required to sign review links.",
      );
    }
    return createHmac("sha256", "y2kase-dev-review-invite")
      .update("review-invite-v1")
      .digest();
  }
  return createHmac("sha256", secret).update("review-invite-v1").digest();
}

function signBody(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function signReviewInvite(
  orderId: number,
  productId: number,
  nowMs = Date.now(),
): string {
  const payload: ReviewInvite = {
    orderId,
    productId,
    expiresAt: Math.floor(nowMs / 1000) + REVIEW_INVITE_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signBody(body)}`;
}

export function verifyReviewInvite(
  token: string,
  nowMs = Date.now(),
): ReviewInvite | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = signBody(body);
  if (expected.length !== signature.length) return null;
  const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<ReviewInvite>;
    const orderId = parsed.orderId;
    const productId = parsed.productId;
    const expiresAt = parsed.expiresAt;
    if (
      typeof orderId !== "number" ||
      typeof productId !== "number" ||
      typeof expiresAt !== "number" ||
      !Number.isInteger(orderId) ||
      !Number.isInteger(productId) ||
      !Number.isInteger(expiresAt)
    ) {
      return null;
    }
    if (expiresAt * 1000 <= nowMs) return null;
    return { orderId, productId, expiresAt };
  } catch {
    return null;
  }
}
