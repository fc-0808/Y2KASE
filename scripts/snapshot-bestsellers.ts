/**
 * One-time snapshot: freeze the CURRENT homepage Bestsellers rail by marking the
 * products it's showing (newest active) as curated featured items, in order.
 * After this the rail is stable — it only changes via /admin/bestsellers.
 *
 *   npm run snapshot:bestsellers        # default 8 (the rail size)
 *   npm run snapshot:bestsellers -- 10  # snapshot a different count
 *
 * Idempotent: does nothing if any product is already featured.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { desc, eq, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products } from "../src/lib/db/schema";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const n = Number(process.argv[2]) || 8;

  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.featured, true))) as { count: number }[];

  if (count > 0) {
    console.log(
      `\n${count} product(s) already featured — leaving the curated rail as-is. ` +
        `Manage it at /admin/bestsellers.\n`,
    );
    process.exit(0);
  }

  const rows = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(eq(products.status, "active"))
    .orderBy(desc(products.createdAt))
    .limit(n);

  console.log(
    `\nFreezing the current Bestsellers rail (${rows.length} products):\n`,
  );
  for (let i = 0; i < rows.length; i++) {
    await db
      .update(products)
      .set({ featured: true, featuredPosition: i, updatedAt: new Date() })
      .where(eq(products.id, rows[i].id));
    console.log(`  ${i + 1}. ${rows[i].title.slice(0, 56)}`);
  }
  console.log(
    `\n✓ Snapshotted ${rows.length} bestsellers. Edit at /admin/bestsellers.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
