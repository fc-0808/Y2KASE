/**
 * Rewrite stored public R2 URLs from the legacy r2.dev host to media.y2kase.com.
 *
 *   npx tsx scripts/rewrite-r2-public-host.ts
 *   npx tsx scripts/rewrite-r2-public-host.ts --apply
 *
 * Preview is the default. Objects stay in the same bucket; only the public
 * hostname baked into Neon text/json columns changes.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

import {
  LEGACY_R2_PUBLIC_ORIGIN,
  PRODUCTION_R2_PUBLIC_ORIGIN,
} from "../src/lib/catalog/r2-public";
import { resolveRunMode } from "./lib/cli";

const FROM = LEGACY_R2_PUBLIC_ORIGIN;
const TO = PRODUCTION_R2_PUBLIC_ORIGIN;
const LIKE = `${FROM}%`;

type CountRow = { count: number };

async function countLike(query: unknown): Promise<number> {
  const rows = (await query) as CountRow[];
  return rows[0]?.count ?? 0;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set.");

  const mode = resolveRunMode("R2 public host rewrite");
  const sql = neon(dbUrl);

  const counts: [string, number][] = [
    [
      "product_images.url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM product_images WHERE url LIKE ${LIKE}`,
      ),
    ],
    [
      "products.video_url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM products WHERE video_url LIKE ${LIKE}`,
      ),
    ],
    [
      "thumbnail_proposals.proposal_url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM thumbnail_proposals WHERE proposal_url LIKE ${LIKE}`,
      ),
    ],
    [
      "collections.image_url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM collections WHERE image_url LIKE ${LIKE}`,
      ),
    ],
    [
      "social_creatives.image_url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM social_creatives WHERE image_url LIKE ${LIKE}`,
      ),
    ],
    [
      "social_creatives.video_url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM social_creatives WHERE video_url LIKE ${LIKE}`,
      ),
    ],
    [
      "marketing_campaigns.hero_image_url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM marketing_campaigns WHERE hero_image_url LIKE ${LIKE}`,
      ),
    ],
    [
      "order_items.image_url",
      await countLike(
        sql`SELECT count(*)::int AS count FROM order_items WHERE image_url LIKE ${LIKE}`,
      ),
    ],
    [
      "blog_posts.cover",
      await countLike(
        sql`SELECT count(*)::int AS count FROM blog_posts WHERE cover LIKE ${LIKE}`,
      ),
    ],
    [
      "blog_posts.images",
      await countLike(
        sql`SELECT count(*)::int AS count FROM blog_posts WHERE images::text LIKE ${"%" + FROM + "%"}`,
      ),
    ],
  ];

  let total = 0;
  for (const [label, n] of counts) {
    total += n;
    console.log(`${n}\t${label}`);
  }
  console.log(`\n${total} row(s) still on ${FROM}`);

  if (!mode.apply) {
    console.log("Re-run with --apply to rewrite them to", TO);
    return;
  }

  if (total === 0) {
    console.log("Nothing to rewrite.");
    return;
  }

  await sql`UPDATE product_images SET url = replace(url, ${FROM}, ${TO}) WHERE url LIKE ${LIKE}`;
  await sql`UPDATE products SET video_url = replace(video_url, ${FROM}, ${TO}) WHERE video_url LIKE ${LIKE}`;
  await sql`UPDATE thumbnail_proposals SET proposal_url = replace(proposal_url, ${FROM}, ${TO}) WHERE proposal_url LIKE ${LIKE}`;
  await sql`UPDATE collections SET image_url = replace(image_url, ${FROM}, ${TO}) WHERE image_url LIKE ${LIKE}`;
  await sql`UPDATE social_creatives SET image_url = replace(image_url, ${FROM}, ${TO}) WHERE image_url LIKE ${LIKE}`;
  await sql`UPDATE social_creatives SET video_url = replace(video_url, ${FROM}, ${TO}) WHERE video_url LIKE ${LIKE}`;
  await sql`UPDATE marketing_campaigns SET hero_image_url = replace(hero_image_url, ${FROM}, ${TO}) WHERE hero_image_url LIKE ${LIKE}`;
  await sql`UPDATE order_items SET image_url = replace(image_url, ${FROM}, ${TO}) WHERE image_url LIKE ${LIKE}`;
  await sql`UPDATE blog_posts SET cover = replace(cover, ${FROM}, ${TO}) WHERE cover LIKE ${LIKE}`;
  await sql`UPDATE blog_posts SET images = replace(images::text, ${FROM}, ${TO})::jsonb WHERE images::text LIKE ${"%" + FROM + "%"}`;

  console.log(`Rewrote host ${FROM} → ${TO}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
