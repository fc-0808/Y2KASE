import { COLLECTION_COVERS_VERSION } from "@/lib/brand/collection-covers";

/**
 * Look-rail crop of a collection cover.
 *
 * The hero file is 1024px wide, for the homepage banner. The catalog tile is
 * 80–108px, so the rail serves a 360px file (crisp at 3×) from
 * `public/brand/collection-rail`. Rebuild with `npx tsx scripts/build-collection-rail.ts`
 * after `covers:generate`.
 */
export function collectionRailSrc(slug: string): string {
  return `/brand/collection-rail/${slug}.webp?v=${COLLECTION_COVERS_VERSION}`;
}
