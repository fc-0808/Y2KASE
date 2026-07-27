/**
 * GET /api/support/identity
 *
 * Resolves who the shopper is so a live-chat conversation can start with
 * context instead of "hi, what's your email?". Returns three things:
 *
 *   1. Name + email of the signed-in customer (never the browser's word for
 *      it — always the server-side session).
 *   2. A `hash`: HMAC-SHA256 of that email keyed with TAWK_API_KEY. This is
 *      tawk's "secure mode". Without it a visitor can type any email into the
 *      pre-chat form and appear in the dashboard as that customer; with it,
 *      tawk verifies the signature and refuses spoofed identities. The key
 *      never leaves the server, which is the whole reason this route exists.
 *   3. Their most recent real order, surfaced as agent-side attributes so the
 *      first reply can be "your order shipped Tuesday" rather than a lookup.
 *
 * Failure is always soft. A shopper trying to reach a human must never be
 * blocked because a session lookup or a database query had a bad day — every
 * error path degrades to an anonymous, unsigned chat.
 */

import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { formatCents } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Response contract, shared with the client via `import type`. */
export type SupportIdentity = {
  identified: boolean;
  name?: string;
  email?: string;
  /** Present only when TAWK_API_KEY is configured (secure mode enabled). */
  hash?: string;
  /**
   * Agent-dashboard metadata. tawk restricts keys to alphanumerics and dashes
   * and drops the whole payload on an invalid key, so keep them kebab-case.
   */
  attributes?: Record<string, string>;
};

/** Personal data — must never touch a CDN or browser cache. */
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" } as const;

const ANONYMOUS: SupportIdentity = { identified: false };

export async function GET(request: NextRequest) {
  let user: { id: string; name?: string; email: string } | null = null;

  try {
    const session = await getSession(request.headers);
    const sessionUser = session?.user;
    // Anonymous sessions exist purely to carry a guest cart — they identify
    // nobody, so treat them exactly like a signed-out visitor.
    if (sessionUser?.email && !sessionUser.isAnonymous) {
      user = {
        id: sessionUser.id,
        name: sessionUser.name || undefined,
        email: sessionUser.email,
      };
    }
  } catch {
    // Auth or database unavailable — fall through to an anonymous chat.
  }

  if (!user) {
    return NextResponse.json(ANONYMOUS, { headers: PRIVATE_HEADERS });
  }

  const apiKey = process.env.TAWK_API_KEY?.trim();
  const hash = apiKey
    ? createHmac("sha256", apiKey).update(user.email).digest("hex")
    : undefined;

  return NextResponse.json(
    {
      identified: true,
      name: user.name,
      email: user.email,
      ...(hash ? { hash } : {}),
      attributes: await orderAttributes(user.id, user.email),
    } satisfies SupportIdentity,
    { headers: PRIVATE_HEADERS },
  );
}

/**
 * Summarise the shopper's latest real order. Mirrors the ownership rule used
 * by /account/orders: orders linked to the account OR placed as a guest with
 * the same email, excluding `pending` (abandoned) checkouts.
 */
async function orderAttributes(
  userId: string,
  email: string,
): Promise<Record<string, string>> {
  if (!isDbConfigured()) return {};

  try {
    const [latest] = await db
      .select({
        id: orders.id,
        status: orders.status,
        totalCents: orders.totalCents,
        currency: orders.currency,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          or(eq(orders.userId, userId), eq(orders.email, email)),
          ne(orders.status, "pending"),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (!latest) return {};

    return {
      "order-id": `#${latest.id}`,
      "order-status": latest.status,
      "order-total": formatCents(latest.totalCents, latest.currency),
      "order-placed": latest.createdAt.toISOString().slice(0, 10),
    };
  } catch {
    // Context is a nice-to-have; a slow or failed query must not delay chat.
    return {};
  }
}
