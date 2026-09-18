/**
 * Shopper vs unpublished product URLs.
 *
 * The public PDP (`/products/[slug]`) only loads `status = 'active'`. Linking a
 * draft there 404s. Admin surfaces therefore send unpublished products to an
 * authenticated preview that renders the same PDP chrome, so a merchant can
 * check the page before publishing — without ever putting draft HTML on the
 * ISR-cached public route (which would leak unpublished listings to shoppers
 * and crawlers).
 *
 * Pure helpers only: the thumbnail review client, the preview page, and any
 * future "view product" control must agree. No DB, no React.
 */

/** Status that is allowed to render on the public storefront PDP. */
export const LIVE_PRODUCT_STATUS = "active";

export type ProductPageRef = {
  productId: number;
  slug: string;
  productStatus: string;
};

export function isLiveProductStatus(status: string): boolean {
  return status === LIVE_PRODUCT_STATUS;
}

/**
 * Whether approving a thumbnail should also flip the listing live.
 *
 * Only drafts can move. Already-active products stay put; archived listings
 * stay retired. The operator has to ask — a review pass must not leak
 * unpublished SKUs onto the storefront.
 */
export function shouldPublishDraftOnApprove(
  status: string,
  publish: boolean | undefined,
): boolean {
  return publish === true && status === "draft";
}

export function liveProductPageHref(slug: string): string {
  return `/products/${slug}`;
}

/**
 * Authenticated, noindex preview of the shopper PDP. Never share this URL
 * publicly — `/admin` is robots-disallowed and session-gated, but it still
 * identifies an unpublished listing.
 */
export function unpublishedProductPageHref(productId: number): string {
  return `/admin/products/${productId}/preview`;
}

export function adminProductEditorHref(productId: number): string {
  return `/admin/products/${productId}`;
}

/**
 * The page a merchant should open to inspect a listing as a shopper would.
 * Published products go to the live PDP; everything else (draft, archived)
 * goes to the admin preview.
 */
export function productPageHref(product: ProductPageRef): string {
  return isLiveProductStatus(product.productStatus)
    ? liveProductPageHref(product.slug)
    : unpublishedProductPageHref(product.productId);
}

export function productPageLinkLabel(status: string): string {
  if (isLiveProductStatus(status)) return "View live product page";
  if (status === "draft") return "Preview draft product page";
  return "Preview unpublished product page";
}

/**
 * Open the product page in a new tab so an in-progress admin queue (selection,
 * generation, bulk actions) is not thrown away.
 */
export const PRODUCT_PAGE_LINK_ATTRS = {
  target: "_blank",
  rel: "noreferrer",
} as const;
