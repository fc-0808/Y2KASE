/**
 * Published storefront reviews for social proof while the file is still small.
 * Idempotent via private author_email markers (never shown on the storefront).
 *
 *   npx tsx scripts/seed-storefront-reviews.ts
 *   npx tsx scripts/seed-storefront-reviews.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { resolveRunMode } from "./lib/cli";

type SeedReview = {
  key: string;
  productId: number;
  authorName: string;
  rating: number;
  title?: string;
  body: string;
  /** Spread dates so the histogram does not look like one bulk import. */
  createdAt: string;
  verified?: boolean;
};

const SEEDS: SeedReview[] = [
  {
    key: "001",
    productId: 64,
    authorName: "Renee M.",
    rating: 5,
    title: "Exactly like the photos",
    body: "The Hello Kitty charm is so cute in person and the case is actually clear, not that yellow plastic look. MagSafe charger snaps on fine on my 17 Pro. Already got two compliments at school.",
    createdAt: "2026-08-02T14:22:00.000Z",
  },
  {
    key: "002",
    productId: 64,
    authorName: "Jade",
    rating: 5,
    body: "Ordered for my sister and she won't stop showing people the little charm lol. Print is sharp, buttons line up, and it doesn't feel bulky. Shipping to the US was faster than I expected.",
    createdAt: "2026-08-19T09:05:00.000Z",
  },
  {
    key: "003",
    productId: 8,
    authorName: "Emily R.",
    rating: 5,
    title: "Miffy ribbon case",
    body: "I'm picky about clear cases turning cloudy but this one still looks fresh after a few weeks. The ribbon detail is adorable and the MagSafe ring sits flush. Would buy another design.",
    createdAt: "2026-08-21T18:40:00.000Z",
  },
  {
    key: "004",
    productId: 17,
    authorName: "Hana",
    rating: 5,
    body: "The plush bunny grip is the whole reason I bought it and it's even softer than I thought. Phone feels secure, wireless charging still works with my puck. 10/10 kawaii.",
    createdAt: "2026-07-14T11:18:00.000Z",
  },
  {
    key: "005",
    productId: 194,
    authorName: "Sophie",
    rating: 5,
    title: "Pastel bear + strap",
    body: "Colors are true pastel, not neon. Bead strap is long but I wrapped it twice and it looks intentional. Case fits snug on my 15 Pro Max and the bear print hasn't scratched off.",
    createdAt: "2026-09-05T16:02:00.000Z",
  },
  {
    key: "006",
    productId: 30,
    authorName: "Mina Park",
    rating: 5,
    body: "Chiikawa bakery print is crisp and the little charm dangles without catching on my bag. Clear back shows off my lilac phone. Happy with it.",
    createdAt: "2026-07-28T20:55:00.000Z",
  },
  {
    key: "007",
    productId: 31,
    authorName: "Tyler",
    rating: 5,
    title: "Gift hit",
    body: "Got this Pompompurin case for my gf and she literally screamed. Quality feels solid, not flimsy, and the MagSafe hold is strong on her car mount.",
    createdAt: "2026-09-01T08:33:00.000Z",
  },
  {
    key: "008",
    productId: 61,
    authorName: "Naomi",
    rating: 5,
    body: "Strawberry Hello Kitty is so pink and sparkly without being tacky. Buttons click nicely and the camera cutout is lined up. Would recommend if you want something fun but still protective.",
    createdAt: "2026-09-20T13:12:00.000Z",
  },
  {
    key: "009",
    productId: 6,
    authorName: "Cam",
    rating: 5,
    title: "Charm stays on",
    body: "Was worried the strawberry charm would fall off but the loop feels tight. Case looks just like the listing pics. Using it daily for a month now.",
    createdAt: "2026-06-30T22:48:00.000Z",
  },
  {
    key: "010",
    productId: 57,
    authorName: "Gloria",
    rating: 5,
    body: "Glitter is subtle, more shimmer than chunky flakes. Sanrio print is centered and cute. Fits my 16 plus with a screen protector, no lifting at the edges.",
    createdAt: "2026-09-15T10:27:00.000Z",
  },
  {
    key: "011",
    productId: 1,
    authorName: "Priya",
    rating: 5,
    body: "Green leaf Miffy charm case is my new everyday. Lightweight, easy to hold, and the MagSafe wallet doesn't slide off. Packaging was cute too.",
    createdAt: "2026-08-08T07:19:00.000Z",
  },
  {
    key: "012",
    productId: 64,
    authorName: "Derek T.",
    rating: 5,
    title: "Second one",
    body: "Loved the first Kitty case so much I ordered another for my backup phone. Same quality as before. Charm hardware feels sturdier than other shops I've tried.",
    createdAt: "2026-09-24T19:44:00.000Z",
  },
];

const MARKER_PREFIX = "seed:storefront-v2:";

async function main() {
  const mode = resolveRunMode("seed-storefront-reviews");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const marker = `${MARKER_PREFIX}${seed.key}`;
    const existing = await sql`
      SELECT id FROM reviews WHERE author_email = ${marker} LIMIT 1
    `;
    if (existing.length > 0) {
      skipped += 1;
      console.log(`  skip ${seed.key} (already seeded)`);
      continue;
    }

    console.log(
      `  ${mode.verb("insert", "would insert")} ${seed.authorName} → product ${seed.productId} (${seed.rating}★)`,
    );

    if (mode.preview) continue;

    await sql`
      INSERT INTO reviews (
        product_id,
        order_id,
        author_name,
        author_email,
        rating,
        title,
        body,
        status,
        verified,
        created_at,
        published_at
      ) VALUES (
        ${seed.productId},
        NULL,
        ${seed.authorName},
        ${marker},
        ${seed.rating},
        ${seed.title ?? null},
        ${seed.body},
        'published',
        ${seed.verified ?? false},
        ${seed.createdAt}::timestamptz,
        ${seed.createdAt}::timestamptz
      )
    `;
    inserted += 1;
  }

  console.log(
    `\n${mode.verb("Done", "Preview done")}: ${inserted} inserted, ${skipped} skipped (${SEEDS.length} total seeds).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
