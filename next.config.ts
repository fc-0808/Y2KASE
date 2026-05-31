import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
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
  serverExternalPackages: ["better-auth", "kysely", "@better-auth/kysely-adapter"],

  images: {
    // Allow optimizing images served from Cloudinary and (during migration) Etsy's CDN.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "i.etsystatic.com" },
    ],
  },
};

export default nextConfig;
