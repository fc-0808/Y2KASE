/**
 * Blog — unified public API.
 *
 * The blog is served from two content sources: hand-authored MDX flagship posts
 * (compiled at build time) and AI-generated posts stored in the database. This
 * module merges them behind one async interface used by the storefront pages,
 * RSS, sitemap and OG image. MDX posts win on any slug collision (the editorial
 * source of truth), and everything is sorted newest-first by date.
 */
import { getMdxSummaries, getMdxSlugs, getMdxPost } from "./mdx";
import {
  listPublishedDbSummaries,
  listPublishedDbSlugs,
  getPublishedDbPost,
} from "./store";
import { byDateDesc, type PostSummary, type RenderablePost } from "./types";

export type { PostMeta, PostSummary, RenderablePost, PostFaq } from "./types";
export { formatPostDate, readingMinutes } from "./types";

/** All published posts (MDX + DB) as summaries, newest first. */
export async function listPublishedPosts(): Promise<PostSummary[]> {
  const [mdx, db] = await Promise.all([
    Promise.resolve(getMdxSummaries()),
    listPublishedDbSummaries(),
  ]);
  const mdxSlugs = getMdxSlugs();
  const merged = [...mdx, ...db.filter((p) => !mdxSlugs.has(p.slug))];
  return merged.sort(byDateDesc);
}

/** A single published post (renderable), checking MDX first then the DB. */
export async function getPublishedPost(
  slug: string,
): Promise<RenderablePost | null> {
  return getMdxPost(slug) ?? (await getPublishedDbPost(slug));
}

/** Slugs of every published post (for generateStaticParams + sitemap). */
export async function listPublishedSlugs(): Promise<string[]> {
  const mdxSlugs = getMdxSlugs();
  const dbSlugs = await listPublishedDbSlugs();
  return [...mdxSlugs, ...dbSlugs.filter((s) => !mdxSlugs.has(s))];
}

/** Up to `limit` published posts excluding `slug`, for "related reading". */
export async function getRelatedPosts(
  slug: string,
  limit = 3,
): Promise<PostSummary[]> {
  const all = await listPublishedPosts();
  return all.filter((p) => p.slug !== slug).slice(0, limit);
}
