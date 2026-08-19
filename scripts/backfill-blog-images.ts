/**
 * Backfill imagery on EXISTING blog posts.
 *
 *   npm run blog:images                 # preview what would change
 *   npm run blog:images:apply           # attach in-body catalog photos
 *   npm run blog:images:covers          # …and regenerate product-grounded heroes
 *
 *   npx tsx scripts/backfill-blog-images.ts --apply --slug my-post
 *   npx tsx scripts/backfill-blog-images.ts --apply --covers --force
 *
 * Two independent repairs, because they cost wildly different amounts:
 *
 *  1. In-body figures — free and instant. Re-reads the product links already in
 *     each article and attaches those products' real catalog photos.
 *
 *  2. Hero covers (`--covers`) — one Nano Banana Pro job per post, polled for up
 *     to 150s. Posts written before hero generation was grounded show a
 *     plausible but fictional case; regenerating with the article's own product
 *     photos as references replaces it with the real thing. Skips posts whose
 *     cover is already a plain catalog photo (nothing invented to fix) unless
 *     `--force` is passed.
 *
 * Idempotent and safe to re-run. Previews by default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { desc, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { blogPosts } from "../src/lib/db/schema";
import {
  linkedCollectionSlug,
  resolveCoverReferences,
  resolvePostFigures,
} from "../src/lib/blog/media";
import {
  generateBlogCover,
  isCoverGenConfigured,
} from "../src/lib/blog/cover";
import { getPostCollectionSlug } from "../src/lib/blog/store";
import { hasFlag, resolveRunMode } from "./lib/cli";

/** Generated heroes live under this R2 prefix; catalog photos never do. */
const GENERATED_COVER_MARKER = "/blog/covers/";

function readSlug(): string | undefined {
  const i = process.argv.indexOf("--slug");
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const mode = resolveRunMode("blog image backfill");
  const withCovers = hasFlag("covers");
  const force = hasFlag("force");
  const onlySlug = readSlug();

  if (withCovers && !isCoverGenConfigured()) {
    throw new Error(
      "--covers needs KIE_API_KEY and R2_BUCKET_NAME in .env.local.",
    );
  }

  const posts = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      body: blogPosts.body,
      cover: blogPosts.cover,
      keyword: blogPosts.keyword,
    })
    .from(blogPosts)
    .orderBy(desc(blogPosts.createdAt));

  const targets = onlySlug ? posts.filter((p) => p.slug === onlySlug) : posts;
  if (targets.length === 0) {
    console.log(onlySlug ? `No post with slug "${onlySlug}".` : "No posts yet.");
    process.exit(0);
  }

  console.log(
    `Processing ${targets.length} post(s)${withCovers ? " (incl. hero regeneration)" : ""}…\n`,
  );

  let figuresWritten = 0;
  let coversWritten = 0;
  let coversSkipped = 0;
  let failed = 0;

  for (const [i, post] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${post.slug}`;
    try {
      // Recorded provenance first; the body link is the fallback for posts
      // whose topic row has been cleared.
      const collectionSlug =
        (await getPostCollectionSlug(post.id)) ?? linkedCollectionSlug(post.body);
      const figures = await resolvePostFigures({
        body: post.body,
        collectionSlug,
      });

      if (figures.length === 0) {
        console.log(`${label} — no catalog photos matched, skipping`);
        continue;
      }

      // The hero is regenerated from the article's own products, so the whole
      // page features one consistent, real set of cases.
      let cover: string | null = null;
      if (withCovers) {
        const alreadyGenerated =
          post.cover?.includes(GENERATED_COVER_MARKER) ?? false;
        if (!alreadyGenerated && !force) {
          coversSkipped++;
        } else if (mode.apply) {
          const referenceImages = await resolveCoverReferences({
            body: post.body,
            collectionSlug,
            fallbackCover: post.cover,
          });
          if (referenceImages.length === 0) {
            console.warn(`${label} — no reference photos, keeping cover`);
          } else {
            cover = await generateBlogCover({
              title: post.title,
              theme: collectionSlug ?? post.keyword,
              referenceImages,
            });
            if (!cover) console.warn(`${label} — hero generation failed`);
          }
        }
      }

      if (mode.apply) {
        await db
          .update(blogPosts)
          .set({
            images: figures,
            ...(cover ? { cover } : {}),
            updatedAt: new Date(),
          })
          .where(eq(blogPosts.id, post.id));
      }

      figuresWritten++;
      if (cover) coversWritten++;
      console.log(
        `${label} — ${mode.verb("attached", "would attach")} ${figures.length} photo(s)` +
          (cover ? ` + new hero` : ""),
      );
    } catch (err) {
      failed++;
      console.error(
        `${label} — ✗ ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Posts with figures: ${figuresWritten}`);
  if (withCovers) {
    console.log(`  Heroes regenerated: ${coversWritten}`);
    console.log(`  Heroes left alone:  ${coversSkipped} (pass --force to redo)`);
  }
  console.log(`  Failed:             ${failed}`);
  if (mode.preview) console.log(`\n  Preview only — re-run with --apply.`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
