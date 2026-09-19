/**
 * Products listing skeleton. Lives in the `(listing)` group so it does not wrap
 * `/products/[slug]`. A `loading.tsx` next to `[slug]` flushes HTTP 200 before
 * `notFound()`, which is how missing PDPs were served as shoppable 200 HTML.
 */

import { ProductsListingSkeleton } from "@/components/catalog/CatalogChromeSkeleton";

export default function ProductsLoading() {
  return <ProductsListingSkeleton />;
}
