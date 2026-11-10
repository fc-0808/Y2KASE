"use client";

/**
 * Recently viewed products rail.
 *
 * Records the current product into localStorage on mount, then renders the
 * previously viewed items (excluding the current one). The stored character
 * and device are what "You may also like" uses to lead with the character
 * this browser has actually been shopping. Entirely client-side, so it costs
 * the server nothing and personalizes without an account.
 */

import { useEffect, useState } from "react";
import { ProductCard, PRODUCT_RAIL_ITEM } from "@/components/ProductCard";
import { ScrollableProductRail } from "@/components/home/ScrollableProductRail";
import {
  rememberRecentProduct,
  type RecentProduct,
} from "@/lib/catalog/recently-viewed";

export function RecentlyViewed({ current }: { current: RecentProduct }) {
  const [items, setItems] = useState<RecentProduct[]>([]);

  useEffect(() => {
    const previous = rememberRecentProduct(current);
    // The row shows ten. Two older visits stay stored so the related rail
    // can still tell which character this browser has been shopping.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(previous.slice(0, 10));
  }, [current]);

  if (items.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="mb-5 text-xl font-black">Recently viewed</h2>
      <ScrollableProductRail>
        {items.map((item) => (
          <div key={item.id} className={PRODUCT_RAIL_ITEM}>
            <ProductCard
              product={{
                ...item,
                tags: [],
                featured: false,
              }}
            />
          </div>
        ))}
      </ScrollableProductRail>
    </section>
  );
}
