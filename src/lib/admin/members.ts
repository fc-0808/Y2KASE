import { count, desc, max, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { users, orders } from "@/lib/db/schema";

/** A registered member enriched with lifetime order stats. */
export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  image: string | null;
  isAnonymous: boolean;
  createdAt: Date;
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: Date | null;
};

export type MemberStats = {
  total: number;
  admins: number;
  customers: number;
  anonymous: number;
  newThisWeek: number;
};

/** Statuses that represent realized revenue (exclude pending/cancelled/refunded). */
const REVENUE_STATUSES = ["paid", "shipped", "delivered"] as const;

/**
 * All members, newest first, each joined to lifetime order aggregates.
 *
 * We aggregate orders in a separate grouped query and merge in memory rather
 * than joining-then-grouping, which keeps the user row counts exact and avoids
 * fan-out double counting.
 */
export async function getMembers(): Promise<MemberRow[]> {
  if (!isDbConfigured()) return [];

  const [people, agg] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        emailVerified: users.emailVerified,
        image: users.image,
        isAnonymous: users.isAnonymous,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db
      .select({
        userId: orders.userId,
        orderCount: count(),
        spent: sql<number>`coalesce(sum(case when ${orders.status} in ('paid','shipped','delivered') then ${orders.totalCents} else 0 end), 0)`,
        lastOrderAt: max(orders.createdAt),
      })
      .from(orders)
      .groupBy(orders.userId),
  ]);

  const byUser = new Map(agg.filter((a) => a.userId).map((a) => [a.userId!, a]));

  return people.map((p) => {
    const a = byUser.get(p.id);
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      emailVerified: p.emailVerified,
      image: p.image,
      isAnonymous: Boolean(p.isAnonymous),
      createdAt: p.createdAt,
      orderCount: a?.orderCount ?? 0,
      totalSpentCents: Number(a?.spent ?? 0),
      lastOrderAt: a?.lastOrderAt ?? null,
    };
  });
}

export async function getMemberStats(): Promise<MemberStats> {
  const empty: MemberStats = {
    total: 0,
    admins: 0,
    customers: 0,
    anonymous: 0,
    newThisWeek: 0,
  };
  if (!isDbConfigured()) return empty;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: count(),
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')`,
      customers: sql<number>`count(*) filter (where ${users.role} = 'customer')`,
      anonymous: sql<number>`count(*) filter (where ${users.isAnonymous} = true)`,
      newThisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= ${weekAgo.toISOString()})`,
    })
    .from(users);

  return {
    total: row?.total ?? 0,
    admins: Number(row?.admins ?? 0),
    customers: Number(row?.customers ?? 0),
    anonymous: Number(row?.anonymous ?? 0),
    newThisWeek: Number(row?.newThisWeek ?? 0),
  };
}

export { REVENUE_STATUSES };
