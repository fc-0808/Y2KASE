import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
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

/**
 * Statuses an order can sit in without money ever having changed hands. Combined
 * with a missing payment intent, these are "incomplete checkouts" (Shopify's
 * "abandoned checkouts") — started but never paid.
 */
const UNPAID_STATUSES = ["pending", "cancelled"] as const;

/**
 * Admin views. "All" and "incomplete" are meta-views; the rest map 1:1 to a
 * lifecycle status. A checkout is "real" once it has a Stripe payment intent —
 * that's the durable proof money was collected, even if later refunded.
 */
export const ORDER_VIEWS = [
  { key: undefined, label: "All" },
  { key: "paid", label: "Paid" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "refunded", label: "Refunded" },
  { key: "incomplete", label: "Incomplete" },
] as const;

/** True for a valid `?status=` value that should route through the view logic. */
export function isOrderView(value: string): boolean {
  return (
    value === "incomplete" ||
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/** Translate an admin view/status key into a Drizzle WHERE clause. */
function viewWhere(view?: string): SQL | undefined {
  if (!view) {
    // "All" — real orders only (money was collected at some point).
    return isNotNull(orders.stripePaymentIntentId);
  }
  if (view === "incomplete") {
    return and(
      isNull(orders.stripePaymentIntentId),
      inArray(orders.status, [...UNPAID_STATUSES]),
    );
  }
  return eq(orders.status, view);
}

export type OrderRow = Order & { itemCount: number };

export type OrderStats = {
  total: number;
  ordersCount: number;
  incomplete: number;
  pending: number;
  paid: number;
  shipped: number;
  revenueCents: number;
  revenue7dCents: number;
};

/** Orders for a given admin view, newest first, with a line-item count. */
export async function getOrders(view?: string): Promise<OrderRow[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.orders.findMany({
    where: viewWhere(view),
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
    ordersCount: 0,
    incomplete: 0,
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
      ordersCount: sql<number>`count(*) filter (where ${orders.stripePaymentIntentId} is not null)`,
      incomplete: sql<number>`count(*) filter (where ${orders.stripePaymentIntentId} is null and ${orders.status} in ('pending','cancelled'))`,
      pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')`,
      paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')`,
      shipped: sql<number>`count(*) filter (where ${orders.status} = 'shipped')`,
      revenue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','shipped','delivered')), 0)`,
      revenue7d: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','shipped','delivered') and ${orders.createdAt} >= ${weekAgo.toISOString()}), 0)`,
    })
    .from(orders);

  return {
    total: row?.total ?? 0,
    ordersCount: Number(row?.ordersCount ?? 0),
    incomplete: Number(row?.incomplete ?? 0),
    pending: Number(row?.pending ?? 0),
    paid: Number(row?.paid ?? 0),
    shipped: Number(row?.shipped ?? 0),
    revenueCents: Number(row?.revenue ?? 0),
    revenue7dCents: Number(row?.revenue7d ?? 0),
  };
}
