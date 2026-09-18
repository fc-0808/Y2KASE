/**
 * Product page URL contract — live PDP vs unpublished preview.
 *
 *   tsx scripts/check-product-page.ts
 *
 * The failure mode this guards: admin queues linking drafts at `/products/[slug]`,
 * which 404s because the public PDP is active-only — or, worse, loading drafts
 * on that ISR route and caching unpublished HTML for shoppers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LIVE_PRODUCT_STATUS,
  PRODUCT_PAGE_LINK_ATTRS,
  adminProductEditorHref,
  isLiveProductStatus,
  liveProductPageHref,
  productPageHref,
  productPageLinkLabel,
  shouldPublishDraftOnApprove,
  unpublishedProductPageHref,
} from "../src/lib/catalog/product-page";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  }
}

const live = {
  productId: 42,
  slug: "pastel-polka-dot-airpods-case",
  productStatus: LIVE_PRODUCT_STATUS,
};

const draft = {
  productId: 42,
  slug: "pastel-polka-dot-airpods-case",
  productStatus: "draft",
};

test("published products open the public PDP", () => {
  assert.equal(isLiveProductStatus("active"), true);
  assert.equal(isLiveProductStatus("draft"), false);
  assert.equal(isLiveProductStatus("archived"), false);
  assert.equal(
    productPageHref(live),
    liveProductPageHref(live.slug),
  );
  assert.equal(productPageHref(live), `/products/${live.slug}`);
  assert.equal(productPageLinkLabel("active"), "View live product page");
});

test("drafts open the authenticated preview, never the public PDP", () => {
  assert.equal(
    productPageHref(draft),
    unpublishedProductPageHref(draft.productId),
  );
  assert.equal(productPageHref(draft), "/admin/products/42/preview");
  assert.notEqual(productPageHref(draft), liveProductPageHref(draft.slug));
  assert.equal(productPageLinkLabel("draft"), "Preview draft product page");
});

test("archived listings use the same unpublished preview as drafts", () => {
  assert.equal(
    productPageHref({ ...draft, productStatus: "archived" }),
    "/admin/products/42/preview",
  );
  assert.equal(
    productPageLinkLabel("archived"),
    "Preview unpublished product page",
  );
});

test("the admin editor is a distinct URL from the shopper preview", () => {
  assert.equal(adminProductEditorHref(42), "/admin/products/42");
  assert.notEqual(adminProductEditorHref(42), unpublishedProductPageHref(42));
});

test("product page inspection opens in a new tab", () => {
  assert.equal(PRODUCT_PAGE_LINK_ATTRS.target, "_blank");
  assert.equal(PRODUCT_PAGE_LINK_ATTRS.rel, "noreferrer");
});

const publicPdp = readFileSync(
  "src/app/(storefront)/products/[slug]/page.tsx",
  "utf8",
);
const productLib = readFileSync("src/lib/products.ts", "utf8");
const previewPage = readFileSync(
  "src/app/admin/(preview)/products/[id]/preview/page.tsx",
  "utf8",
);
const previewLayout = readFileSync(
  "src/app/admin/(preview)/layout.tsx",
  "utf8",
);
const review = readFileSync(
  "src/app/admin/(protected)/products/thumbnails/ThumbnailsReview.tsx",
  "utf8",
);

test("the public PDP stays active-only and never loads admin products", () => {
  assert.match(publicPdp, /getProductBySlug/);
  assert.doesNotMatch(publicPdp, /getProductForAdmin/);
  assert.match(
    productLib,
    /eq\(products\.slug, slug\),\s*eq\(products\.status, "active"\)/,
  );
});

test("unpublished preview is session-gated and not the admin chrome", () => {
  assert.match(previewLayout, /requireAdmin/);
  assert.match(previewLayout, /SiteHeader/);
  assert.doesNotMatch(previewLayout, /AdminNavbar/);
  assert.match(previewPage, /getProductForAdmin/);
  assert.match(previewPage, /force-dynamic/);
  assert.match(previewPage, /liveProductPageHref\(product\.slug\)/);
});

test("thumbnail cards route through productPageHref instead of a hard-coded PDP", () => {
  assert.match(review, /productPageHref/);
  assert.doesNotMatch(review, /href=\{`\/products\/\$\{item\.slug\}`\}/);
});

test("thumbnail approve publishes drafts only when the operator asks", () => {
  assert.equal(shouldPublishDraftOnApprove("draft", true), true);
  assert.equal(shouldPublishDraftOnApprove("draft", false), false);
  assert.equal(shouldPublishDraftOnApprove("draft", undefined), false);
  assert.equal(shouldPublishDraftOnApprove("active", true), false);
  assert.equal(shouldPublishDraftOnApprove("archived", true), false);
});

test("thumbnail review keeps publish-on-approve opt-in for cards and bulk", () => {
  assert.match(review, /publishDraftsOnApprove/);
  assert.match(
    review,
    /y2kase\.admin\.thumbnails\.publish-drafts-on-approve/,
  );
  assert.match(
    review,
    /approveThumbnailProposal\(\s*item\.productId,\s*publishDraftsOnApprove/,
  );
  assert.match(
    review,
    /bulkApproveThumbnails\(c, publishDraftsOnApprove\)/,
  );
  assert.match(review, /Publish drafts on approve/);
});

if (failed > 0) {
  console.error(`\n${failed} product-page check(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`Product page URL invariants passed (${passed}).`);
