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
import { orders } from "@/lib/db/schema";
import type { Order, OrderItem } from "@/lib/db/schema";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/admin/order-status";
import { canonicalOrderNumber } from "@/lib/orders/number";

export { ORDER_STATUSES, type OrderStatus };

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

/** Staff preview rows stay on the customer account and out of every admin view. */
function adminVisible(extra?: SQL): SQL | undefined {
  const visible = eq(orders.adminHidden, false);
  return extra ? and(visible, extra) : visible;
}

/** Translate an admin view/status key into a Drizzle WHERE clause. */
function viewWhere(view?: string): SQL | undefined {
  if (!view) {
    // "All" — real orders only (money was collected at some point).
    return adminVisible(isNotNull(orders.stripePaymentIntentId));
  }
  if (view === "incomplete") {
    return adminVisible(
      and(
        isNull(orders.stripePaymentIntentId),
        inArray(orders.status, [...UNPAID_STATUSES]),
      ),
    );
  }
  return adminVisible(eq(orders.status, view));
}

/** The cart lines an admin needs in the orders table — title, options, qty. */
export type OrderLineSummary = Pick<
  OrderItem,
  | "id"
  | "productId"
  | "productSlug"
  | "productTitle"
  | "imageUrl"
  | "optionValues"
  | "quantity"
  | "unitCents"
>;

export type OrderRow = Order & { items: OrderLineSummary[] };

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

/** Orders for a given admin view, newest first, including each cart line. */
export async function getOrders(view?: string): Promise<OrderRow[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.orders.findMany({
    where: viewWhere(view),
    orderBy: desc(orders.createdAt),
    with: {
      items: {
        columns: {
          id: true,
          productId: true,
          productSlug: true,
          productTitle: true,
          imageUrl: true,
          optionValues: true,
          quantity: true,
          unitCents: true,
        },
        orderBy: (item, { asc }) => asc(item.id),
      },
    },
  });

  return rows;
}

export type OrderWithDetail = Order & {
  items: OrderItem[];
  user: { id: string; name: string; email: string } | null;
};

async function findVisibleOrder(
  where: SQL,
): Promise<OrderWithDetail | null> {
  if (!isDbConfigured()) return null;
  const row = await db.query.orders.findFirst({
    where: and(where, eq(orders.adminHidden, false)),
    with: {
      items: true,
      user: { columns: { id: true, name: true, email: true } },
    },
  });
  return row ?? null;
}

export async function getOrderById(id: number): Promise<OrderWithDetail | null> {
  return findVisibleOrder(eq(orders.id, id));
}

/**
 * Admin URLs stay on the serial id. A pasted buyer reference (YK-482913)
 * resolves too, so support can open the order from the email subject.
 */
export async function resolveAdminOrder(
  param: string,
): Promise<OrderWithDetail | null> {
  const orderNumber = canonicalOrderNumber(param);
  if (orderNumber) return findVisibleOrder(eq(orders.orderNumber, orderNumber));
  if (/^\d+$/.test(param) && Number.isSafeInteger(Number(param))) {
    return getOrderById(Number(param));
  }
  return null;
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
    .from(orders)
    .where(eq(orders.adminHidden, false));

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
