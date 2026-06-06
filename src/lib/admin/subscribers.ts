import { count, desc, eq, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import type { EmailSubscriber } from "@/lib/db/schema";

export type SubscriberStats = {
  total: number;
  active: number;
  unsubscribed: number;
  newThisWeek: number;
};

export async function getSubscribers(
  status?: string,
): Promise<EmailSubscriber[]> {
  if (!isDbConfigured()) return [];
  return db.query.emailSubscribers.findMany({
    where: status ? eq(emailSubscribers.status, status) : undefined,
    orderBy: desc(emailSubscribers.subscribedAt),
  });
}

export async function getSubscriberStats(): Promise<SubscriberStats> {
  const empty: SubscriberStats = {
    total: 0,
    active: 0,
    unsubscribed: 0,
    newThisWeek: 0,
  };
  if (!isDbConfigured()) return empty;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${emailSubscribers.status} = 'active')`,
      unsubscribed: sql<number>`count(*) filter (where ${emailSubscribers.status} = 'unsubscribed')`,
      newThisWeek: sql<number>`count(*) filter (where ${emailSubscribers.subscribedAt} >= ${weekAgo.toISOString()})`,
    })
    .from(emailSubscribers);

  return {
    total: row?.total ?? 0,
    active: Number(row?.active ?? 0),
    unsubscribed: Number(row?.unsubscribed ?? 0),
    newThisWeek: Number(row?.newThisWeek ?? 0),
  };
}
