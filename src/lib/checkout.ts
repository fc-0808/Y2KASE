/**
 * Checkout pricing + validation — SERVER ONLY.
 *
 * The golden rule of payments: NEVER trust a price that came from the browser.
 * The client cart (Zustand, persisted to localStorage) can be tampered with, so
 * on checkout we throw the client prices away and recompute every line from the
 * database + the canonical pricing table. This is exactly how Shopify, CASETiFY,
 * and every serious store prevents price-manipulation fraud.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import {
  STYLE_OPTION_NAME,
  getStylePrice,
  shippingQuote,
} from "@/lib/pricing";

/** What the browser is allowed to send us — note: NO price. */
export type CheckoutLineInput = {
  productId: number;
  options: Record<string, string>;
  quantity: number;
};

/** A fully validated, server-priced line ready to charge. */
export type PricedLine = {
  productId: number;
  slug: string;
  title: string;
  imageUrl: string | null;
  options: Record<string, string>;
  quantity: number;
  /** Authoritative unit price in minor units (cents), computed server-side. */
  unitCents: number;
  currency: string;
};

export type PricedCart = {
  lines: PricedLine[];
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
};

const MAX_QTY_PER_LINE = 20;

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Validate the incoming cart against the database and return server-authoritative
 * pricing. Throws on any inconsistency (unknown product, bad quantity, mixed
 * currency) so the caller can return a 400 rather than charge a wrong amount.
 */
export async function priceCart(
  items: CheckoutLineInput[],
): Promise<PricedCart> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutError("Your bag is empty.");
  }

  // Normalize + sanity-check quantities up front.
  const cleaned = items.map((it) => {
    const quantity = Math.floor(Number(it.quantity));
    if (!Number.isInteger(it.productId) || it.productId <= 0) {
      throw new CheckoutError("Invalid product in cart.");
    }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) {
      throw new CheckoutError("Invalid quantity in cart.");
    }
    return {
      productId: it.productId,
      options: it.options ?? {},
      quantity,
    };
  });

  const ids = [...new Set(cleaned.map((c) => c.productId))];
  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    with: {
      images: { orderBy: (img, { asc }) => [asc(img.position)], limit: 1 },
    },
  });

  const byId = new Map(rows.map((r) => [r.id, r]));

  const lines: PricedLine[] = cleaned.map((c) => {
    const product = byId.get(c.productId);
    if (!product) {
      throw new CheckoutError("A product in your bag is no longer available.");
    }
    if (product.status !== "active") {
      throw new CheckoutError(`"${product.title}" is no longer available.`);
    }

    const currency = product.currency ?? "USD";
    // Price source of truth: iPhone cases are priced by Style; everything else
    // uses the stored base price. Mirrors ProductDetailClient exactly.
    const unit =
      product.productType === "iphone_case"
        ? getStylePrice(c.options[STYLE_OPTION_NAME], currency)
        : Number(product.price);

    return {
      productId: product.id,
      slug: product.slug,
      title: product.title,
      imageUrl: product.images?.[0]?.url ?? null,
      options: c.options,
      quantity: c.quantity,
      unitCents: toCents(unit),
      currency,
    };
  });

  // All lines must share a currency (one Stripe session = one currency).
  const currency = lines[0].currency;
  if (lines.some((l) => l.currency !== currency)) {
    throw new CheckoutError("All items must be in the same currency.");
  }

  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.unitCents * l.quantity,
    0,
  );

  const { shippingCents } = shippingQuote(currency, subtotalCents);

  return {
    lines,
    currency,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
  };
}

/** Typed error so the route can distinguish validation failures from 500s. */
export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutError";
  }
}
