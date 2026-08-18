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

const disableImageOptimization =
  process.env.NODE_ENV === "development" ||
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
    /**
     * Stub out the dead SQLite dialect adapters inside @better-auth/kysely-adapter.
     * They reference `DEFAULT_MIGRATION_LOCK_TABLE` which was removed from
     * kysely and never existed in 0.27-0.29. We use the Drizzle adapter so
     * these code paths are never executed, but Turbopack's static analysis
     * flags them. Stubs prevent the false-positive build failure.
     */
    resolveAlias: {
      "@better-auth/kysely-adapter/dist/bun-sqlite-dialect-DzNwOpKv.mjs":
        "./src/lib/kysely-stub.ts",
      "@better-auth/kysely-adapter/dist/d1-sqlite-dialect-C2B7YsIT.mjs":
        "./src/lib/kysely-stub.ts",
      "@better-auth/kysely-adapter/dist/node-sqlite-dialect.mjs":
        "./src/lib/kysely-stub.ts",
    },
  },

  // Better Auth bundles all its adapters (including kysely SQLite dialects)
  // in a single package. Those adapters require Node-only modules and have
  // transitive dependency version mismatches when Turbopack tries to statically
  // analyse them. We don't use them (we use the Drizzle adapter), so we opt
  // better-auth out of bundling entirely — it will be loaded at runtime via
  // native Node require instead.
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
    // Production resizing is load-bearing for mobile Core Web Vitals: source
    // catalog photos are 1024×1280, while a two-column phone card is ~180px
    // wide. Development stays direct-to-R2 because some VPNs resolve r2.dev to
    // a private address, which Next's secure optimizer correctly refuses.
    // Self-hosted production and CI exercise the same path as Vercel; the env
    // override remains an explicit operational escape hatch.
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
