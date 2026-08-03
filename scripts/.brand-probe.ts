import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import { listingIp } from "../src/lib/catalog/listing-title";

async function main() {
  const rows = await db.query.products.findMany({
    where: inArray(products.id, [60, 33, 93, 116, 129, 96, 111, 112]),
    columns: {
      id: true,
      title: true,
      brandName: true,
      characterName: true,
      brandConfidence: true,
    },
  });

  for (const r of rows) {
    console.log(
      `#${r.id} brand=${JSON.stringify(r.brandName)} character=${JSON.stringify(r.characterName)} conf=${r.brandConfidence} → ip=${listingIp(r.brandName, r.characterName)}`,
    );
    console.log(`     ${r.title}`);
  }
  process.exit(0);
}

main();
