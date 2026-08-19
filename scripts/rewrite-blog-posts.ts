/**
 * Audit blog posts against the current editorial standard, and rewrite the ones
 * that fail it.
 *
 *   npm run blog:audit                  # report only — no changes, no cost
 *   npm run blog:rewrite                # rewrite every substandard post
 *   npx tsx scripts/rewrite-blog-posts.ts --apply --slug some-post
 *   npx tsx scripts/rewrite-blog-posts.ts --apply --all      # rewrite everything
 *
 * The standard is the same one `src/lib/blog/generate.ts` now enforces on new
 * articles: enough words, enough sections to hang photos from, and enough
 * product links to identify which photos to show and to ground the hero image.
 * Posts written before those gates existed can sit below them, and this is how
 * they are brought up — the audit exists so that is a deliberate, costed
 * decision rather than a surprise.
 *
 * Rewrites are in place: same slug, same status, same publication date, so an
 * indexed URL keeps its history. A post whose rewrite fails validation is left
 * exactly as it was.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { desc } from "drizzle-orm";
import { db } from "../src/lib/db";
import { blogPosts } from "../src/lib/db/schema";
import { regeneratePost } from "../src/lib/blog/engine";
import { isBlogGenConfigured } from "../src/lib/blog/generate";
import { hasFlag, resolveRunMode } from "./lib/cli";

/** Mirrors the generator's gates — keep the two in step. */
const MIN_WORDS = 500;
const MIN_SECTIONS = 3;
const MIN_PRODUCT_LINKS = 2;

type Audit = {
  words: number;
  sections: number;
  productLinks: number;
  failures: string[];
};

function audit(body: string): Audit {
  const words = body.split(/\s+/).filter(Boolean).length;
  const sections = (body.match(/^#{2,3}\s+\S/gm) ?? []).length;
  const productLinks = new Set(
    [...body.matchAll(/\]\((\/products\/[a-z0-9][a-z0-9-]*)\)/gi)].map((m) =>
      m[1].toLowerCase(),
    ),
  ).size;

  const failures: string[] = [];
  if (words < MIN_WORDS) failures.push(`${words}w < ${MIN_WORDS}`);
  if (sections < MIN_SECTIONS) failures.push(`${sections} sections < ${MIN_SECTIONS}`);
  if (productLinks < MIN_PRODUCT_LINKS) {
    failures.push(`${productLinks} product links < ${MIN_PRODUCT_LINKS}`);
  }
  return { words, sections, productLinks, failures };
}

function readSlug(): string | undefined {
  const i = process.argv.indexOf("--slug");
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const mode = resolveRunMode("blog rewrite");
  const all = hasFlag("all");
  const onlySlug = readSlug();

  if (mode.apply && !isBlogGenConfigured()) {
    throw new Error(
      "No text-model key set (BLOG_TEXT_API_KEY / VISION_API_KEY / OPENAI_API_KEY).",
    );
  }

  const posts = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      body: blogPosts.body,
      status: blogPosts.status,
    })
    .from(blogPosts)
    .orderBy(desc(blogPosts.createdAt));

  console.log("Current state:\n");
  const substandard: typeof posts = [];
  for (const post of posts) {
    const result = audit(post.body);
    const ok = result.failures.length === 0;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${post.slug}` +
        `  (${result.words}w, ${result.sections} sections, ${result.productLinks} product links)` +
        (ok ? "" : `  → ${result.failures.join("; ")}`),
    );
    if (!ok) substandard.push(post);
  }

  let targets = all ? posts : substandard;
  if (onlySlug) targets = posts.filter((p) => p.slug === onlySlug);

  if (targets.length === 0) {
    console.log("\nEvery post meets the standard. Nothing to rewrite.\n");
    process.exit(0);
  }

  console.log(
    `\n${mode.verb("Rewriting", "Would rewrite")} ${targets.length} post(s)` +
      (mode.apply ? " — each takes ~1-2 min (article + hero)." : ".") +
      "\n",
  );

  if (mode.preview) {
    for (const post of targets) console.log(`  · ${post.slug}`);
    console.log("\n  Preview only — re-run with --apply.\n");
    process.exit(0);
  }

  let rewritten = 0;
  let failed = 0;

  for (const [i, post] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${post.slug}`;
    try {
      const res = await regeneratePost(post.id, { regenerateCover: true });
      rewritten++;
      console.log(
        `${label} — ✓ ${res.words}w, ${res.figures} photo(s)` +
          (res.coverRegenerated ? ", new hero" : ", hero unchanged"),
      );
    } catch (err) {
      failed++;
      console.error(
        `${label} — ✗ ${err instanceof Error ? err.message : String(err)} (left unchanged)`,
      );
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Rewritten: ${rewritten}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
