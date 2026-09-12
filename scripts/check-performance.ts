import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCatalogParams } from "../src/lib/catalog/params";
import { useCart } from "../src/lib/store/cart";

const catalog = parseCatalogParams(
  {
    q: ` ${"case ".repeat(40)} `,
    page: "999999",
    tag: "invalid tag!",
    device: "IPHONE",
    brand: Array.from({ length: 30 }, (_, index) => `brand-${index}`),
  },
  "/products",
);
assert.equal(catalog.q?.length, 120);
assert.equal(catalog.page, 1_000);
assert.equal(catalog.tag, undefined);
assert.equal(catalog.device, "iphone");
assert.equal(catalog.brands.length, 24);

const colorParams = parseCatalogParams(
  {
    color: ["pink", "navy", "chartreuse", ...Array.from({ length: 20 }, (_, i) => `c${i}`)],
  },
  "/products",
);
assert.deepEqual(colorParams.colors, ["pink"]);

const motifParams = parseCatalogParams(
  {
    motif: ["clouds", "puppy", "not-a-theme", ...Array.from({ length: 20 }, (_, i) => `m${i}`)],
  },
  "/products",
);
assert.deepEqual(motifParams.motifs, ["puppy", "clouds"]);

const persistOptions = useCart.persist.getOptions();
assert.ok(persistOptions.partialize, "cart persistence must be explicitly filtered");
assert.deepEqual(Object.keys(persistOptions.partialize(useCart.getState())), [
  "items",
]);
assert.ok(persistOptions.merge, "legacy cart snapshots must use a safe merge");
const merged = persistOptions.merge(
  { items: [], isOpen: true },
  { ...useCart.getState(), isOpen: true },
);
assert.equal(merged.isOpen, false, "drawer UI state must never survive reload");

const proxySource = readFileSync("src/proxy.ts", "utf8");
const storefrontLayout = readFileSync(
  "src/app/(storefront)/layout.tsx",
  "utf8",
);
const heroSource = readFileSync(
  "src/components/home/HeroCarousel.tsx",
  "utf8",
);
const nextConfig = readFileSync("next.config.ts", "utf8");
const productMedia = readFileSync("src/components/ProductMedia.tsx", "utf8");
const productDetail = readFileSync(
  "src/components/ProductDetailClient.tsx",
  "utf8",
);
assert.match(proxySource, /matcher:\s*\["\/admin\/:path\*"\]/);
assert.doesNotMatch(proxySource, /_next\/static/);
assert.match(storefrontLayout, /CartDrawerLoader/);
assert.doesNotMatch(storefrontLayout, /from "@\/components\/CartDrawer"/);
assert.match(heroSource, /fetchPriority=\{i === 0 \? "high" : "low"\}/);
assert.match(heroSource, /autoPlayArmed/);
// Vercel `/_next/image` is 402ing. Optimization stays opt-in; catalog photos
// must keep serving the stored R2 WebP directly even if someone opts back in.
assert.match(nextConfig, /NEXT_IMAGE_OPTIMIZED !== "true"/);
assert.match(productMedia, /unoptimized/);
assert.match(productDetail, /unoptimized/);

console.log("✓ storefront performance invariants passed");
