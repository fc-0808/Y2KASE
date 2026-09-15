/**
 * Live reachability audit for every active listing's storefront media.
 *
 *   npx tsx scripts/audit-storefront-media.ts
 *
 * Heads every unique catalog object through the S3 API (R2 keys we own) or
 * HTTP (foreign CDNs). Reports products whose listing card or PDP gallery
 * would still emit a 404 after the retired-numeric filter.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { neon } from "@neondatabase/serverless";

import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import { DEVICE_FAMILIES } from "../src/lib/catalog/devices";
import { makeR2Client, r2KeyFromUrl } from "../src/lib/catalog/r2";
import {
  isStorefrontRenderableUrl,
  selectStorefrontImages,
  storefrontHeroUrl,
  storefrontVideoUrl,
} from "../src/lib/catalog/storefront-media";

const HEAD_CONCURRENCY = 24;
/** Must stay in lockstep with `LISTING_IMAGE_CANDIDATES` in `src/lib/products.ts`. */
const LISTING_IMAGE_CANDIDATES = 12;
const CATALOG_PAGE_SIZE = 24;

type ImageRow = {
  product_id: number;
  slug: string;
  title: string;
  status: string;
  video_url: string | null;
  image_id: number | null;
  position: number | null;
  url: string | null;
};

function classifyPath(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return "invalid";
  }
  if (/\/products\/\d+\/\d+\.(?:webp|jpe?g|png|gif)$/i.test(pathname)) {
    return "legacy-numeric";
  }
  if (/thumbnail-cleaned/i.test(pathname)) return "thumbnail-cleaned";
  if (/thumbnail-proposal/i.test(pathname)) return "thumbnail-proposal";
  if (/\/products\/manual\//i.test(pathname)) return "manual";
  if (/\/products\/[^/]+\/\d{3}-/i.test(pathname)) return "ingest-hashed";
  if (/\/products\/[^/]+\/\d+\//i.test(pathname)) return "category-folder";
  if (url.includes("cloudinary")) return "cloudinary";
  if (url.includes("etsystatic")) return "etsy";
  if (/\.(mp4|mov|webm)(?:\?|$)/i.test(pathname)) return "video";
  return "other";
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set.");
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");

  const sql = neon(dbUrl);
  const r2 = makeR2Client();

  const rows = (await sql`
    SELECT
      p.id AS product_id,
      p.slug,
      p.title,
      p.status,
      p.video_url,
      pi.id AS image_id,
      pi.position,
      pi.url
    FROM products p
    LEFT JOIN product_images pi ON pi.product_id = p.id
    WHERE p.status = 'active'
    ORDER BY p.id, pi.position
  `) as ImageRow[];

  const byProduct = new Map<
    number,
    {
      slug: string;
      title: string;
      videoUrl: string | null;
      images: { id: number; position: number; url: string }[];
    }
  >();
  for (const row of rows) {
    let product = byProduct.get(row.product_id);
    if (!product) {
      product = {
        slug: row.slug,
        title: row.title,
        videoUrl: row.video_url,
        images: [],
      };
      byProduct.set(row.product_id, product);
    }
    if (row.url && row.image_id != null && row.position != null) {
      product.images.push({
        id: row.image_id,
        position: row.position,
        url: row.url,
      });
    }
  }

  const uniqueUrls = [
    ...new Set(
      [...byProduct.values()].flatMap((product) => [
        ...product.images.map((image) => image.url),
        ...(product.videoUrl ? [product.videoUrl] : []),
      ]),
    ),
  ];

  const existence = new Map<string, "ok" | "missing" | "error">();
  const errors: { url: string; reason: string }[] = [];

  await mapWithConcurrency(uniqueUrls, HEAD_CONCURRENCY, async (url) => {
    const key = r2KeyFromUrl(url);
    if (key) {
      try {
        await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        existence.set(url, "ok");
      } catch (err) {
        const name = (err as { name?: string }).name;
        const status = (err as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
          existence.set(url, "missing");
        } else {
          existence.set(url, "error");
          errors.push({
            url,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      existence.set(url, res.ok ? "ok" : res.status === 404 ? "missing" : "error");
      if (!res.ok && res.status !== 404) {
        errors.push({ url, reason: `HTTP ${res.status}` });
      }
    } catch (err) {
      existence.set(url, "error");
      errors.push({
        url,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const missingByPattern = new Map<string, number>();
  const missingRenderableByPattern = new Map<string, number>();
  for (const url of uniqueUrls) {
    if (existence.get(url) !== "missing") continue;
    const pattern = classifyPath(url);
    missingByPattern.set(pattern, (missingByPattern.get(pattern) ?? 0) + 1);
    if (isStorefrontRenderableUrl(url)) {
      missingRenderableByPattern.set(
        pattern,
        (missingRenderableByPattern.get(pattern) ?? 0) + 1,
      );
    }
  }

  const noHero: string[] = [];
  const heroMissing: string[] = [];
  const listingHeroBeyondWindow: string[] = [];
  const galleryMissing: {
    slug: string;
    live: number;
    missing: number;
    samples: string[];
  }[] = [];
  const videoMissing: string[] = [];

  for (const product of byProduct.values()) {
    const ordered = [...product.images].sort((a, b) => a.position - b.position);
    const live = selectStorefrontImages(ordered);
    const hero = storefrontHeroUrl(ordered);
    const listingHero = storefrontHeroUrl(
      ordered.slice(0, LISTING_IMAGE_CANDIDATES),
    );
    if (!hero) noHero.push(product.slug);
    else if (existence.get(hero) === "missing") heroMissing.push(product.slug);
    if (hero && !listingHero) listingHeroBeyondWindow.push(product.slug);

    const deadLive = live.filter((image) => existence.get(image.url) === "missing");
    if (deadLive.length > 0) {
      galleryMissing.push({
        slug: product.slug,
        live: live.length,
        missing: deadLive.length,
        samples: deadLive.slice(0, 3).map((image) => image.url),
      });
    }

    if (storefrontVideoUrl(product.videoUrl) && existence.get(product.videoUrl!) === "missing") {
      videoMissing.push(product.slug);
    }
  }

  console.log("\n=== Catalog ===");
  console.table([
    {
      activeProducts: byProduct.size,
      uniqueUrls: uniqueUrls.length,
      ok: uniqueUrls.filter((url) => existence.get(url) === "ok").length,
      missing: uniqueUrls.filter((url) => existence.get(url) === "missing").length,
      error: uniqueUrls.filter((url) => existence.get(url) === "error").length,
    },
  ]);

  console.log("\n=== Missing objects by path pattern (all URLs) ===");
  console.table(
    [...missingByPattern.entries()].map(([pattern, count]) => ({
      pattern,
      count,
    })),
  );

  console.log("\n=== Missing objects still considered storefront-renderable ===");
  console.table(
    [...missingRenderableByPattern.entries()].map(([pattern, count]) => ({
      pattern,
      count,
    })),
  );

  console.log("\n=== Product impact ===");
  console.table([
    {
      noRenderableHero: noHero.length,
      renderableHeroMissing: heroMissing.length,
      listingHeroBeyondWindow: listingHeroBeyondWindow.length,
      galleryHasMissing: galleryMissing.length,
      videoMissing: videoMissing.length,
    },
  ]);

  if (noHero.length) {
    console.log("\nNo storefront hero:");
    for (const slug of noHero.slice(0, 40)) console.log(`  ${slug}`);
    if (noHero.length > 40) console.log(`  … ${noHero.length - 40} more`);
  }
  if (heroMissing.length) {
    console.log("\nListing/PDP hero 404s:");
    for (const slug of heroMissing.slice(0, 40)) console.log(`  ${slug}`);
    if (heroMissing.length > 40) {
      console.log(`  … ${heroMissing.length - 40} more`);
    }
  }
  if (listingHeroBeyondWindow.length) {
    console.log(
      `\nLive hero sits after the first ${LISTING_IMAGE_CANDIDATES} gallery rows (listing cards would miss it):`,
    );
    for (const slug of listingHeroBeyondWindow.slice(0, 40)) {
      console.log(`  ${slug}`);
    }
    if (listingHeroBeyondWindow.length > 40) {
      console.log(`  … ${listingHeroBeyondWindow.length - 40} more`);
    }
  }
  if (galleryMissing.length) {
    console.log("\nPDP galleries that still include 404s:");
    for (const row of galleryMissing.slice(0, 30)) {
      console.log(
        `  ${row.slug}  live=${row.live} missing=${row.missing}`,
      );
      for (const sample of row.samples) console.log(`    ${sample}`);
    }
    if (galleryMissing.length > 30) {
      console.log(`  … ${galleryMissing.length - 30} more`);
    }
  }
  if (videoMissing.length) {
    console.log("\nMissing videos:");
    for (const slug of videoMissing) console.log(`  ${slug}`);
  }
  if (errors.length) {
    console.log("\nNon-404 transport errors:");
    for (const row of errors.slice(0, 20)) {
      console.log(`  ${row.reason}  ${row.url}`);
    }
  }

  const failing =
    noHero.length +
    heroMissing.length +
    listingHeroBeyondWindow.length +
    galleryMissing.length +
    videoMissing.length;
  if (failing > 0) {
    console.error(
      `\n✗ ${failing} product surface(s) still have missing storefront media.`,
    );
    process.exitCode = 1;
  } else {
    console.log("\n✓ every active listing has a live hero and a fully live gallery");
  }

  const origin = process.env.STOREFRONT_ORIGIN ?? "http://localhost:3000";
  const slugs = [...byProduct.values()].map((product) => product.slug);
  const collectionRows = (await sql`
    SELECT c.slug, COUNT(*)::int AS n
    FROM collections c
    INNER JOIN product_collections pc ON pc.collection_id = c.id
    INNER JOIN products p ON p.id = pc.product_id AND p.status = 'active'
    GROUP BY c.slug
    ORDER BY c.slug
  `) as { slug: string; n: number }[];
  try {
    await crawlRenderedPages(origin, slugs, collectionRows);
  } catch (err) {
    console.error(
      `\nCould not crawl ${origin}: ${err instanceof Error ? err.message : err}`,
    );
    process.exitCode = 1;
  }
}

const SRC_RE = /\s(?:src|srcSet|srcset|poster)=["']([^"']+)["']/gi;

function catalogSrcs(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(SRC_RE)) {
    const candidates = match[1]
      .split(/[,\s]+/)
      .filter((part) => /^https?:\/\//.test(part));
    for (const url of candidates) {
      if (
        url.includes("r2.dev") ||
        url.includes("media.y2kase.com") ||
        url.includes("cloudinary") ||
        url.includes("etsystatic")
      ) {
        found.add(url);
      }
    }
  }
  return [...found];
}

function paginatedPaths(basePath: string, total: number): string[] {
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const paths = [basePath];
  for (let page = 2; page <= pageCount; page++) {
    const joiner = basePath.includes("?") ? "&" : "?";
    paths.push(`${basePath}${joiner}page=${page}`);
  }
  return paths;
}

async function crawlRenderedPages(
  origin: string,
  slugs: string[],
  collections: { slug: string; n: number }[],
): Promise<void> {
  const health = await fetch(origin, { redirect: "follow" });
  if (!health.ok) {
    throw new Error(`storefront responded HTTP ${health.status}`);
  }

  const listingPaths = [
    "/",
    "/collections",
    ...paginatedPaths("/products", slugs.length),
    ...paginatedPaths("/products?magsafe=false", slugs.length),
    ...DEVICE_FAMILIES.flatMap((family) =>
      family.devices
        .filter((device) => !device.comingSoon)
        .flatMap((device) =>
          paginatedPaths(`/devices/${device.id}`, slugs.length),
        ),
    ),
    ...collections.flatMap((collection) =>
      paginatedPaths(
        `/collections/${encodeURIComponent(collection.slug)}`,
        collection.n,
      ),
    ),
  ];

  console.log(
    `\n=== Rendered HTML crawl (${origin}, ${listingPaths.length} listing pages, ${slugs.length} PDPs) ===`,
  );

  const retired: { path: string; url: string }[] = [];
  const failedPages: { path: string; status: number }[] = [];
  const emptyPdps: string[] = [];

  const paths = [
    ...listingPaths,
    ...slugs.map((slug) => `/products/${encodeURIComponent(slug)}`),
  ];

  await mapWithConcurrency(paths, 6, async (path) => {
    const res = await fetch(`${origin}${path}`, { redirect: "follow" });
    if (!res.ok) {
      failedPages.push({ path, status: res.status });
      return;
    }
    const html = await res.text();
    const srcs = catalogSrcs(html);
    for (const url of srcs) {
      if (!isStorefrontRenderableUrl(url)) {
        retired.push({ path, url });
      }
    }
    if (path.startsWith("/products/") && path !== "/products") {
      const hasPhoto = srcs.some((url) => url.includes("/products/"));
      if (!hasPhoto) emptyPdps.push(path);
    }
  });

  console.table([
    {
      pages: paths.length,
      retiredInHtml: retired.length,
      failedPages: failedPages.length,
      pdpsWithoutPhoto: emptyPdps.length,
    },
  ]);

  if (failedPages.length) {
    for (const row of failedPages.slice(0, 20)) {
      console.log(`  HTTP ${row.status}  ${row.path}`);
    }
  }
  if (retired.length) {
    for (const row of retired.slice(0, 20)) {
      console.log(`  retired src on ${row.path}`);
      console.log(`    ${row.url}`);
    }
  }
  if (emptyPdps.length) {
    for (const path of emptyPdps.slice(0, 20)) {
      console.log(`  no catalog photo: ${path}`);
    }
  }

  if (failedPages.length || retired.length || emptyPdps.length) {
    console.error("\n✗ rendered catalog pages still expose missing media.");
    process.exitCode = 1;
    return;
  }
  console.log("✓ rendered listing pages and PDPs contain no retired catalog URLs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
