/**
 * Blog media resolution — grounding article imagery in the real catalog.
 *
 * An article's most trustworthy illustrations are the products it is already
 * recommending, so this module derives them from the body itself: the generator
 * links only to whitelisted `/products/<slug>` routes, which makes those links
 * an exact, self-maintaining record of what the piece is about. We read them
 * back out, fetch each product's primary photo, and pin the photo to the
 * section the link appeared in — so the case beside a recommendation is the one
 * a reader can actually buy, and the placement stays correct even after the copy
 * is edited.
 *
 * The same photos are handed to the hero-image generator as reference images
 * (see ./cover.ts), which is what stops it inventing a case that doesn't exist.
 *
 * Everything degrades to an empty result: no database, no links or a query
 * hiccup simply means a post renders with its hero and no in-body figures.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products, productCollections, productImages } from "@/lib/db/schema";
import { resolveCollectionFilterIds } from "@/lib/collections";
import type { PostFigure } from "./types";

/** Upper bound on in-body figures. Enough to break up the copy, not a gallery. */
export const MAX_FIGURES = 3;

/**
 * Below this, we top up from the featured collection. A post that linked only
 * one product would otherwise read as a wall of text.
 */
const MIN_FIGURES = 2;

/**
 * Reference photos sent to the image model. Three is the practical ceiling:
 * beyond it the gateway starts averaging the designs together instead of
 * reproducing them.
 */
export const COVER_REFERENCE_LIMIT = 3;

type CatalogPhoto = {
  slug: string;
  title: string;
  url: string;
  alt: string | null;
};

/**
 * Only absolute https URLs can be used as generator references — the gateway
 * fetches them from its own network, where a `/public` path means nothing.
 */
function isFetchableByGateway(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/**
 * Byte offset of every heading, in document order.
 *
 * `###` counts as a section boundary alongside `##`, because articles that
 * recommend several products give each one its own `###` subsection — anchoring
 * only to `##` would drop every photo into the same parent section and force
 * them apart into sections that never mention those products.
 *
 * The heading set here must stay in step with the one `Markdown.tsx` derives
 * from its parsed blocks, since one produces the index the other consumes. `#`
 * is included because the renderer coerces a stray H1 into an H2.
 */
function sectionOffsets(body: string): number[] {
  const offsets: number[] = [];
  const re = /^#{1,3}\s+\S/gm;
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    offsets.push(m.index);
  }
  return offsets;
}

/** Index of the section containing `at`; -1 when it sits above the first one. */
function sectionAt(offsets: number[], at: number): number {
  let index = -1;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] > at) break;
    index = i;
  }
  return index;
}

/**
 * Product slugs linked from the body, first mention only, in document order,
 * each with the offset that decides which section its figure belongs to.
 */
function linkedProducts(body: string): { slug: string; at: number }[] {
  const re = /\]\(\/products\/([a-z0-9][a-z0-9-]*)\)/gi;
  const seen = new Set<string>();
  const out: { slug: string; at: number }[] = [];
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    const slug = m[1].toLowerCase();
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, at: m.index });
  }
  return out;
}

/**
 * The collection the article features, read back from its own copy.
 *
 * Lets a post's imagery be re-derived from nothing but the stored body — the
 * topic row that originally supplied the slug may be long gone by the time an
 * existing post is backfilled or refreshed from the admin console.
 */
export function linkedCollectionSlug(body: string): string | null {
  const m = /\]\(\/collections\/([a-z0-9][a-z0-9-]*)\)/i.exec(body);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Primary (lowest-position) photo for each active product slug. Rows arrive
 * position-ascending, so the first row seen for a slug is its primary image.
 */
async function photosForSlugs(
  slugs: string[],
): Promise<Map<string, CatalogPhoto>> {
  const out = new Map<string, CatalogPhoto>();
  if (slugs.length === 0) return out;

  const rows = await db
    .select({
      slug: products.slug,
      title: products.title,
      url: productImages.url,
      alt: productImages.altText,
    })
    .from(products)
    .innerJoin(productImages, eq(productImages.productId, products.id))
    .where(and(inArray(products.slug, slugs), eq(products.status, "active")))
    .orderBy(asc(productImages.position));

  for (const row of rows) {
    if (!row.url || out.has(row.slug)) continue;
    out.set(row.slug, {
      slug: row.slug,
      title: row.title,
      url: row.url,
      alt: row.alt,
    });
  }
  return out;
}

/** Primary photos from a collection, skipping products already featured. */
async function photosForCollection(
  collectionSlug: string,
  exclude: ReadonlySet<string>,
  limit: number,
): Promise<CatalogPhoto[]> {
  if (limit <= 0) return [];
  const collectionIds = await resolveCollectionFilterIds(collectionSlug);
  if (collectionIds.length === 0) return [];

  const rows = await db
    .select({
      slug: products.slug,
      title: products.title,
      url: productImages.url,
      alt: productImages.altText,
    })
    .from(productCollections)
    .innerJoin(products, eq(products.id, productCollections.productId))
    .innerJoin(productImages, eq(productImages.productId, products.id))
    .where(
      and(
        inArray(productCollections.collectionId, collectionIds),
        eq(products.status, "active"),
      ),
    )
    .orderBy(asc(productImages.position))
    .limit(200);

  const out: CatalogPhoto[] = [];
  const seen = new Set(exclude);
  for (const row of rows) {
    if (!row.url || seen.has(row.slug)) continue;
    seen.add(row.slug);
    out.push({
      slug: row.slug,
      title: row.title,
      url: row.url,
      alt: row.alt,
    });
    if (out.length >= limit) break;
  }
  return out;
}

type Placement = { photo: CatalogPhoto; section: number };

/**
 * At most one figure per section, so two photos can never end up stacked back
 * to back. A figure whose section is already spoken for moves down to the next
 * free one; if there is none, it is dropped rather than doubled up.
 *
 * Figures are pulled out of the intro (section -1) onto the first real section,
 * because the hero image already sits directly above it.
 */
function spreadAcrossSections(
  placements: Placement[],
  sectionCount: number,
): Placement[] {
  // A post with no `##` headings has exactly one place to put an image.
  if (sectionCount === 0) {
    return placements.slice(0, 1).map((p) => ({ ...p, section: -1 }));
  }

  const taken = new Set<number>();
  const out: Placement[] = [];
  for (const placement of placements) {
    let section = Math.max(placement.section, 0);
    while (taken.has(section) && section < sectionCount - 1) section++;
    if (taken.has(section)) continue;
    taken.add(section);
    out.push({ ...placement, section });
  }
  return out.sort((a, b) => a.section - b.section);
}

function toFigure({ photo, section }: Placement): PostFigure {
  return {
    url: photo.url,
    alt: photo.alt?.trim() || photo.title,
    caption: photo.title,
    href: `/products/${photo.slug}`,
    section,
  };
}

/**
 * Resolve the in-body figures for an article from the products it links to,
 * topping up from the featured collection when the copy linked too few.
 *
 * `collectionSlug` is only a hint for that top-up; when omitted it is read back
 * out of the body, so this works on any stored post.
 */
export async function resolvePostFigures(opts: {
  body: string;
  collectionSlug?: string | null;
  max?: number;
}): Promise<PostFigure[]> {
  const max = Math.min(opts.max ?? MAX_FIGURES, MAX_FIGURES);
  if (!isDbConfigured() || max <= 0) return [];

  const collectionSlug =
    opts.collectionSlug ?? linkedCollectionSlug(opts.body);

  try {
    const offsets = sectionOffsets(opts.body);
    const mentions = linkedProducts(opts.body);
    const photos = await photosForSlugs(mentions.map((m) => m.slug));

    const placements: Placement[] = [];
    for (const mention of mentions) {
      const photo = photos.get(mention.slug);
      if (photo) {
        placements.push({ photo, section: sectionAt(offsets, mention.at) });
      }
    }

    if (placements.length < MIN_FIGURES && collectionSlug) {
      const used = new Set(placements.map((p) => p.photo.slug));
      const extra = await photosForCollection(
        collectionSlug,
        used,
        MIN_FIGURES - placements.length,
      );
      // No link to anchor these to, so hand them the earliest sections and let
      // `spreadAcrossSections` push them past anything already placed.
      extra.forEach((photo, i) => placements.push({ photo, section: i }));
    }

    return spreadAcrossSections(placements, offsets.length)
      .slice(0, max)
      .map(toFigure);
  } catch (err) {
    console.error("[blog] figure resolution failed:", err);
    return [];
  }
}

/** Deduplicate, drop anything the gateway can't fetch, and cap the list. */
function takeReferenceUrls(candidates: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of candidates) {
    if (!url || !isFetchableByGateway(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= COVER_REFERENCE_LIMIT) break;
  }
  return out;
}

/**
 * The catalog photos to condition hero-image generation on.
 *
 * Deliberately independent of figure placement. A post with no headings has
 * only one place to put an in-body figure, but its hero should still depict the
 * full set of products the article covers — so references are gathered from the
 * catalog directly rather than from whatever survived placement. Linked
 * products come first (most relevant), then the featured collection, then the
 * post's existing cover as a last resort.
 *
 * An empty result means the hero would be invented rather than reproduced, so
 * callers should treat it as a reason to skip generation entirely.
 */
export async function resolveCoverReferences(opts: {
  body: string;
  collectionSlug?: string | null;
  fallbackCover?: string | null;
}): Promise<string[]> {
  if (!isDbConfigured()) return takeReferenceUrls([opts.fallbackCover]);

  const collectionSlug =
    opts.collectionSlug ?? linkedCollectionSlug(opts.body);

  try {
    const mentions = linkedProducts(opts.body);
    const photos = await photosForSlugs(mentions.map((m) => m.slug));
    const urls = mentions
      .map((m) => photos.get(m.slug)?.url)
      .filter((url): url is string => Boolean(url));

    if (urls.length < COVER_REFERENCE_LIMIT && collectionSlug) {
      const used = new Set(
        [...photos.values()].map((photo) => photo.slug),
      );
      const extra = await photosForCollection(
        collectionSlug,
        used,
        COVER_REFERENCE_LIMIT - urls.length,
      );
      urls.push(...extra.map((photo) => photo.url));
    }

    return takeReferenceUrls([...urls, opts.fallbackCover]);
  } catch (err) {
    console.error("[blog] cover reference lookup failed:", err);
    return takeReferenceUrls([opts.fallbackCover]);
  }
}
