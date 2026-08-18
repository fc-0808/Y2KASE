import { count, desc, eq, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
export type AdminSubscriber = {
  id: number;
  email: string;
  name: string | null;
  source: string;
  discountCode: string | null;
  status: string;
  consentVersion: string | null;
  consentRecordedAt: Date | null;
  consentCountry: string | null;
  subscribedAt: Date;
  resubscribedAt: Date | null;
  unsubscribedAt: Date | null;
  unsubscribeReason: string | null;
};

export type SubscriberStats = {
  total: number;
  active: number;
  unverified: number;
  unsubscribed: number;
  newThisWeek: number;
};

export async function getSubscribers(
  status?: string,
): Promise<AdminSubscriber[]> {
  if (!isDbConfigured()) return [];
  return db.query.emailSubscribers.findMany({
    where: status ? eq(emailSubscribers.status, status) : undefined,
    orderBy: desc(emailSubscribers.subscribedAt),
    columns: {
      id: true,
      email: true,
      name: true,
      source: true,
      discountCode: true,
      status: true,
      consentVersion: true,
      consentRecordedAt: true,
      consentCountry: true,
      subscribedAt: true,
      resubscribedAt: true,
      unsubscribedAt: true,
      unsubscribeReason: true,
    },
  });
}

export async function getSubscriberStats(): Promise<SubscriberStats> {
  const empty: SubscriberStats = {
    total: 0,
    active: 0,
    unverified: 0,
    unsubscribed: 0,
    newThisWeek: 0,
  };
  if (!isDbConfigured()) return empty;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (
        where ${emailSubscribers.status} = 'active'
        and ${emailSubscribers.consentVersion} is not null
        and ${emailSubscribers.consentRecordedAt} is not null
      )`,
      unverified: sql<number>`count(*) filter (
        where ${emailSubscribers.status} = 'active'
        and (
          ${emailSubscribers.consentVersion} is null
          or ${emailSubscribers.consentRecordedAt} is null
        )
      )`,
      unsubscribed: sql<number>`count(*) filter (where ${emailSubscribers.status} = 'unsubscribed')`,
      newThisWeek: sql<number>`count(*) filter (where ${emailSubscribers.subscribedAt} >= ${weekAgo.toISOString()})`,
    })
    .from(emailSubscribers);

  return {
    total: row?.total ?? 0,
    active: Number(row?.active ?? 0),
    unverified: Number(row?.unverified ?? 0),
    unsubscribed: Number(row?.unsubscribed ?? 0),
    newThisWeek: Number(row?.newThisWeek ?? 0),
  };
}
