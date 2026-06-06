import { count, desc, eq, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import type { Order, OrderItem } from "@/lib/db/schema";

/** The canonical lifecycle of an order. Order is meaningful (used for the UI). */
export const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderRow = Order & { itemCount: number };

export type OrderStats = {
  total: number;
  pending: number;
  paid: number;
  shipped: number;
  revenueCents: number;
  revenue7dCents: number;
};

/** All orders, newest first, with a lightweight line-item count. */
export async function getOrders(status?: string): Promise<OrderRow[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.orders.findMany({
    where: status ? eq(orders.status, status) : undefined,
    orderBy: desc(orders.createdAt),
    with: { items: { columns: { id: true } } },
  });

  return rows.map((o) => {
    const { items, ...rest } = o;
    return { ...rest, itemCount: items.length };
  });
}

export type OrderWithDetail = Order & {
  items: OrderItem[];
  user: { id: string; name: string; email: string } | null;
};

export async function getOrderById(id: number): Promise<OrderWithDetail | null> {
  if (!isDbConfigured()) return null;
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      items: true,
      user: { columns: { id: true, name: true, email: true } },
    },
  });
  return row ?? null;
}

export async function getOrderStats(): Promise<OrderStats> {
  const empty: OrderStats = {
    total: 0,
    pending: 0,
    paid: 0,
    shipped: 0,
    revenueCents: 0,
    revenue7dCents: 0,
  };
  if (!isDbConfigured()) return empty;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: count(),
      pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')`,
      paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')`,
      shipped: sql<number>`count(*) filter (where ${orders.status} = 'shipped')`,
      revenue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','shipped','delivered')), 0)`,
      revenue7d: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','shipped','delivered') and ${orders.createdAt} >= ${weekAgo.toISOString()}), 0)`,
    })
    .from(orders);

  return {
    total: row?.total ?? 0,
    pending: Number(row?.pending ?? 0),
    paid: Number(row?.paid ?? 0),
    shipped: Number(row?.shipped ?? 0),
    revenueCents: Number(row?.revenue ?? 0),
    revenue7dCents: Number(row?.revenue7d ?? 0),
  };
}
