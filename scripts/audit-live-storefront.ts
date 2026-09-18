/**
 * Live HTTP crawl of the public storefront.
 *
 *   npx tsx scripts/audit-live-storefront.ts
 *   STOREFRONT_ORIGIN=https://y2kase.com npx tsx scripts/audit-live-storefront.ts
 *
 * Walks the sitemap plus catalog pagination, then HEADs every unique catalog
 * object those pages actually emit. Use this to confirm visitors get
 * media.y2kase.com (not /_next/image or r2.dev) and that those objects 200.
 */
import https from "node:https";
import { lookup as systemLookup } from "node:dns";
import { Resolver } from "node:dns/promises";

import { mapWithConcurrency } from "../src/lib/catalog/concurrency";

const publicDns = new Resolver();
publicDns.setServers(["1.1.1.1", "8.8.8.8"]);
const dnsCache = new Map<string, Promise<string[]>>();

async function resolvePublicA(hostname: string): Promise<string[]> {
  const hit = dnsCache.get(hostname);
  if (hit) return hit;
  const pending = publicDns.resolve4(hostname);
  dnsCache.set(hostname, pending);
  return pending;
}

function requestOnIp(
  urlStr: string,
  ip: string,
  method: "HEAD" | "GET",
  extraHeaders: Record<string, string> = {},
): Promise<{
  status: number;
  headers: Headers;
  body: Buffer;
}> {
  const url = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        hostname: ip,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers: {
          host: url.hostname,
          "user-agent": UA,
          ...extraHeaders,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(", "));
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function fetchMedia(
  url: string,
  method: "HEAD" | "GET",
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const hostname = new URL(url).hostname;
  try {
    const ips = await resolvePublicA(hostname);
    return await requestOnIp(url, ips[0], method, extraHeaders);
  } catch {
    return new Promise((resolve, reject) => {
      systemLookup(hostname, (err, address) => {
        if (err || !address) {
          reject(err ?? new Error(`ENOTFOUND ${hostname}`));
          return;
        }
        requestOnIp(url, address, method, extraHeaders).then(resolve, reject);
      });
    });
  }
}

const ORIGIN = (process.env.STOREFRONT_ORIGIN ?? "https://y2kase.com").replace(
  /\/$/,
  "",
);
const PAGE_CONCURRENCY = 6;
const HEAD_CONCURRENCY = 16;
const CACHE_SAMPLE = 40;
const UA = "Y2KASE-live-storefront-audit/1.0";

const SRC_RE =
  /\s(?:src|srcSet|srcset|poster|content)=["']([^"']+)["']/gi;
const RANGE_RE = /(\d+)\s*[–-]\s*\d+\s+of\s+(\d+)\s+products/i;

type PageResult = {
  path: string;
  status: number;
  catalogSrcs: string[];
  nextImage: number;
  r2Dev: number;
};

function catalogish(url: string): boolean {
  return (
    url.includes("media.y2kase.com") ||
    url.includes("r2.dev") ||
    url.includes("cloudinary") ||
    url.includes("etsystatic") ||
    url.includes("/_next/image")
  );
}

function extractSrcs(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(SRC_RE)) {
    for (const part of match[1].split(/[,\s]+/)) {
      const url = part.replace(/^\d+w$/, "").trim();
      if (
        /^https?:\/\//.test(url) &&
        catalogish(url) &&
        /\.(webp|jpe?g|png|gif|avif|mp4|mov|webm)(?:\?|$)/i.test(url)
      ) {
        found.add(url);
      }
    }
  }
  return [...found];
}

function paginate(basePath: string, total: number, pageSize = 24): string[] {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const paths = [basePath];
  const joiner = basePath.includes("?") ? "&" : "?";
  for (let page = 2; page <= pages; page++) {
    paths.push(`${basePath}${joiner}page=${page}`);
  }
  return paths;
}

async function fetchText(path: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${ORIGIN}${path}`, {
    redirect: "follow",
    headers: { "user-agent": UA },
  });
  return { status: res.status, html: res.ok ? await res.text() : "" };
}

async function sitemapPaths(): Promise<string[]> {
  const res = await fetch(`${ORIGIN}/sitemap.xml`, {
    headers: { "user-agent": UA },
  });
  if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return locs.map((loc) => {
    const url = new URL(loc);
    return `${url.pathname}${url.search}`;
  });
}

async function listingExtras(sitemap: string[]): Promise<string[]> {
  const extras = new Set<string>();
  const listingRoots = [
    "/products",
    "/devices/iphone",
    ...sitemap.filter((path) => path.startsWith("/collections/")),
  ];
  await mapWithConcurrency(listingRoots, PAGE_CONCURRENCY, async (path) => {
    const { status, html } = await fetchText(path);
    if (!status || status >= 400) return;
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
    const match = text.match(RANGE_RE);
    if (!match) return;
    const total = Number(match[2]);
    for (const extra of paginate(path, total)) extras.add(extra);
  });
  return [...extras];
}

async function headMedia(url: string): Promise<{
  url: string;
  ok: boolean;
  status: number;
  cache: string;
  cf: string;
  error?: string;
}> {
  try {
    const res = await fetchMedia(
      url,
      "GET",
      { range: "bytes=0-0" },
    );
    return {
      url,
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      cache: res.headers.get("cache-control") ?? "",
      cf: res.headers.get("cf-cache-status") ?? "",
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      cache: "",
      cf: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getCacheSample(url: string): Promise<{
  url: string;
  status: number;
  cf: string;
  age: string;
  cache: string;
  bytes: number;
  error?: string;
}> {
  try {
    const isVideo = /\.(mp4|mov|webm)(?:\?|$)/i.test(url);
    const res = await fetchMedia(
      url,
      "GET",
      isVideo ? { range: "bytes=0-1023" } : {},
    );
    return {
      url,
      status: res.status,
      cf: res.headers.get("cf-cache-status") ?? "",
      age: res.headers.get("age") ?? "",
      cache: res.headers.get("cache-control") ?? "",
      bytes: res.body.byteLength,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      cf: "",
      age: "",
      cache: "",
      bytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`Crawling ${ORIGIN}`);
  const sitemap = await sitemapPaths();
  const extras = await listingExtras(sitemap);
  const paths = [...new Set([...sitemap, ...extras])];

  const pages: PageResult[] = await mapWithConcurrency(
    paths,
    PAGE_CONCURRENCY,
    async (path) => {
      const { status, html } = await fetchText(path);
      const catalogSrcs = html ? extractSrcs(html) : [];
      return {
        path,
        status,
        catalogSrcs,
        nextImage: catalogSrcs.filter((url) => url.includes("/_next/image"))
          .length,
        r2Dev: catalogSrcs.filter((url) => url.includes("r2.dev")).length,
      };
    },
  );

  const failedPages = pages.filter((page) => page.status < 200 || page.status >= 400);
  const nextImagePages = pages.filter((page) => page.nextImage > 0);
  const r2Pages = pages.filter((page) => page.r2Dev > 0);
  const emptyPdps = pages.filter(
    (page) =>
      page.status === 200 &&
      /^\/products\/.+/.test(page.path) &&
      !page.catalogSrcs.some((url) => url.includes("media.y2kase.com")),
  );

  const unique = [
    ...new Set(pages.flatMap((page) => page.catalogSrcs)),
  ].sort();
  const heads = await mapWithConcurrency(unique, HEAD_CONCURRENCY, headMedia);
  const missing = heads.filter((row) => !row.ok);
  const mediaHost = unique.filter((url) => url.includes("media.y2kase.com"));
  const sample = mediaHost.slice(0, CACHE_SAMPLE);
  const cache = await mapWithConcurrency(sample, 8, getCacheSample);

  const cfCounts = new Map<string, number>();
  for (const row of cache) {
    const key = row.cf || "(none)";
    cfCounts.set(key, (cfCounts.get(key) ?? 0) + 1);
  }

  console.log("\n=== Pages ===");
  console.table([
    {
      sitemap: sitemap.length,
      withPagination: paths.length,
      failed: failedPages.length,
      nextImage: nextImagePages.length,
      r2Dev: r2Pages.length,
      pdpsWithoutMedia: emptyPdps.length,
    },
  ]);

  console.log("\n=== Unique catalog objects in HTML ===");
  console.table([
    {
      unique: unique.length,
      mediaHost: mediaHost.length,
      headOk: heads.filter((row) => row.ok).length,
      headFail: missing.length,
    },
  ]);

  console.log("\n=== Cloudflare GET sample (custom domain) ===");
  console.table(
    [...cfCounts.entries()].map(([cf, count]) => ({ cf, count })),
  );

  if (failedPages.length) {
    console.log("\nFailed pages:");
    for (const page of failedPages.slice(0, 30)) {
      console.log(`  HTTP ${page.status}  ${page.path}`);
    }
  }
  if (nextImagePages.length) {
    console.log("\nPages still emitting /_next/image:");
    for (const page of nextImagePages.slice(0, 20)) {
      console.log(`  ${page.path}  (${page.nextImage})`);
    }
  }
  if (r2Pages.length) {
    console.log("\nPages still emitting r2.dev:");
    for (const page of r2Pages.slice(0, 20)) {
      console.log(`  ${page.path}  (${page.r2Dev})`);
    }
  }
  if (emptyPdps.length) {
    console.log("\nPDPs with no media.y2kase.com photo:");
    for (const page of emptyPdps.slice(0, 20)) console.log(`  ${page.path}`);
  }
  if (missing.length) {
    console.log("\nUnreachable catalog objects:");
    for (const row of missing.slice(0, 30)) {
      console.log(`  HTTP ${row.status}  ${row.url}`);
    }
  }

  const failing =
    failedPages.length +
    nextImagePages.length +
    r2Pages.length +
    emptyPdps.length +
    missing.length;
  if (failing > 0) {
    console.error(`\n✗ ${failing} live storefront issue(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(
    "\n✓ sitemap + listing pagination render without Vercel Image Optimization or r2.dev, and every emitted catalog object returns HTTP 200",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
