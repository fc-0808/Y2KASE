import { cache } from "react";
import { sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";

/**
 * Stamp shared by the nav counts and the product grid.
 *
 * Those are separate Data Cache entries. `revalidateTag(..., "max")` refreshes
 * them in the background on different requests, so the menu can already say 36
 * while a collection page is still serving an older snapshot. Local admin
 * writes the production database and never reaches Vercel's `revalidateTag`,
 * which is how that split survives on y2kase.com while localhost stays in
 * agreement. Both cache keys include this stamp, so a catalog change is a
 * miss for the menu and the grid together.
 *
 * The stamp is one SQL round trip (the database is in us-east-1) and is
 * remembered for a few seconds. A shopper moving across the products, device,
 * and collection pages otherwise paid that round trip on every click, before
 * the cached grid could even be read. Admin revalidation clears the memory.
 */
const SIGNATURE_FRESH_MS = 20_000;

type SignatureMemo = { value: string; expires: number };

function signatureMemo(): { current: SignatureMemo | null } {
  const g = globalThis as typeof globalThis & {
    __y2kaseCatalogSignature?: { current: SignatureMemo | null };
  };
  g.__y2kaseCatalogSignature ??= { current: null };
  return g.__y2kaseCatalogSignature;
}

/** Drop the remembered stamp. Called when the catalog cache is invalidated. */
export function forgetCatalogSignature(): void {
  signatureMemo().current = null;
}

type SignatureRow = {
  active: number;
  product_touched: string;
  memberships: number;
  membership_touched: string;
  collection_touched: string;
};

async function querySignature(): Promise<string> {
  const result = await db.execute<SignatureRow>(sql`
    select
      (select count(*) filter (where status = 'active')::int from products) as active,
      (select coalesce(max(updated_at)::text, '') from products) as product_touched,
      (select count(*)::int from product_collections) as memberships,
      (select coalesce(max(created_at)::text, '') from product_collections) as membership_touched,
      (select coalesce(max(updated_at)::text, '') from collections) as collection_touched
  `);
  const row = signatureRow(result);
  return [
    row?.active ?? 0,
    row?.product_touched ?? "",
    row?.memberships ?? 0,
    row?.membership_touched ?? "",
    row?.collection_touched ?? "",
  ].join("|");
}

function signatureRow(result: unknown): SignatureRow | undefined {
  if (Array.isArray(result)) return result[0] as SignatureRow | undefined;
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: SignatureRow[] }).rows;
    return rows[0];
  }
  return undefined;
}

let signatureInflight: Promise<string> | null = null;

export const getCatalogCacheSignature = cache(async (): Promise<string> => {
  if (!isDbConfigured()) return "none";
  const memo = signatureMemo();
  if (memo.current && memo.current.expires > Date.now()) return memo.current.value;
  signatureInflight ??= querySignature()
    .then((value) => {
      signatureMemo().current = {
        value,
        expires: Date.now() + SIGNATURE_FRESH_MS,
      };
      return value;
    })
    .finally(() => {
      signatureInflight = null;
    });
  return signatureInflight;
});
