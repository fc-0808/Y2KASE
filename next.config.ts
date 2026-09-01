import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Relative, not "@/lib/routes": Next.js require()s this config before the app's
// path aliases exist. The module is kept dependency-free for the same reason.
import { REDIRECTS, assertRedirectsAreResolvable } from "./src/lib/routes";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Keep the optimizer's remote allow-list exact. The first host is the current
// production R2 bucket; the environment-derived host lets a bucket/custom
// domain move without a code release. Legacy import hosts remain allow-listed
// while old catalog rows are migrated.
const imageRemoteHosts = new Set([
  "pub-ed7f8ed365ab49089eec8a6a7398124f.r2.dev",
  "res.cloudinary.com",
  "i.etsystatic.com",
]);
try {
  if (process.env.R2_PUBLIC_URL) {
    imageRemoteHosts.add(new URL(process.env.R2_PUBLIC_URL).hostname);
  }
} catch {
  // A malformed R2 URL is reported by the code path that actually requires it.
}

// Vercel Image Optimization is a paid add-on. Production currently answers
// every `/_next/image` request with 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED
// (confirmed against y2kase.com). Catalog photos are already WebP on R2, so the
// storefront serves those URLs directly unless optimization is explicitly opted
// in after the Vercel add-on is enabled. Development stays direct-to-origin
// because some VPNs resolve r2.dev to a private address, which Next's optimizer
// correctly refuses. NEXT_IMAGE_UNOPTIMIZED remains an extra kill switch.
const disableImageOptimization =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_IMAGE_OPTIMIZED !== "true" ||
  process.env.NEXT_IMAGE_UNOPTIMIZED === "true";

const nextConfig: NextConfig = {
  // Drop the `X-Powered-By: Next.js` header — a few bytes off every response
  // and one less framework-fingerprint exposed.
  poweredByHeader: false,

  // Sourced from src/lib/routes.ts so the redirects and the canonical paths the
  // app links to can never disagree. Validated here rather than at import time
  // so a bad row surfaces as a build failure with a readable message.
  async redirects() {
    assertRedirectsAreResolvable(REDIRECTS);
    return [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: "www.y2kase.com" }],
        destination: "https://y2kase.com/:path*",
        permanent: true,
      },
      ...REDIRECTS.map(({ source, destination, permanent }) => ({
        source,
        destination,
        permanent,
      })),
    ];
  },

  // Pin the workspace root so Next.js doesn't pick up an unrelated lockfile
  // higher up in the user's home directory.
  turbopack: {
    root: projectRoot,
  },

  // Better Auth bundles all its adapters (including kysely SQLite dialects)
  // in a single package. We use the Drizzle adapter, so opt Better Auth out of
  // server bundling and load it at runtime through native Node resolution.
  // `sharp` is a native module used by the thumbnail-normalization server
  // actions; keep it external so the bundler loads it via native require
  // instead of trying to bundle the platform binary.
  serverExternalPackages: [
    "better-auth",
    "kysely",
    "@better-auth/kysely-adapter",
    "sharp",
  ],

  images: {
    // Default is unoptimized: Vercel's optimizer is currently 402ing, and
    // ingest already writes 1024×1280 WebP. Set NEXT_IMAGE_OPTIMIZED=true only
    // after Image Optimization is enabled on the Vercel project.
    unoptimized: disableImageOptimization,
    minimumCacheTTL: 86_400,
    qualities: [72, 75, 82],
    remotePatterns: [...imageRemoteHosts].map((hostname) => ({
      protocol: "https" as const,
      hostname,
      port: "",
      pathname: "/**",
      search: "",
    })),
    // Next 16 rejects local Image sources with query strings unless they are
    // explicitly allow-listed. Keep ordinary local images query-free, then
    // permit cache-busting only inside the three generated brand-asset trees.
    localPatterns: [
      { pathname: "/**", search: "" },
      { pathname: "/brand/collection-cards/**" },
      { pathname: "/brand/collections/**" },
      { pathname: "/brand/device-covers/**" },
    ],
  },
};

// Enable .mdx imports for the blog content collection. We deliberately keep the
// plugin set empty so the loader behaves identically under both the webpack
// build and the Turbopack dev server (Turbopack requires serializable plugin
// config), and we do NOT add "mdx" to pageExtensions — content files are
// imported as modules via the registry, never routed directly.
const withMDX = createMDX({});

// Points next-intl at src/i18n/request.ts, which resolves the locale per request
// and loads its catalogue. Inert until the routes move under `[locale]`: with no
// locale segment to read, every request resolves to English.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(withMDX(nextConfig));
