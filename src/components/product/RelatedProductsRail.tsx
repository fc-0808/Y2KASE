"use client";

import { useEffect, useState } from "react";
import { ProductCard, PRODUCT_RAIL_ITEM } from "@/components/ProductCard";
import { ScrollableProductRail } from "@/components/home/ScrollableProductRail";
import { loadCharacterCases } from "@/app/(storefront)/catalog-actions";
import {
  composeRelated,
  leadingCharacter,
  sameProductIds,
} from "@/lib/catalog/browse-affinity";
import { readRecentProducts } from "@/lib/catalog/recently-viewed";
import type { ProductListItem } from "@/lib/products";

/**
 * Server HTML is the anonymous related list, which is what a crawler indexes.
 * After hydration, three or more visits to another character lead this row
 * with that character's cases for the same device. Recently viewed stays a
 * separate row; those products are not repeated here.
 */
export function RelatedProductsRail({
  products,
  productId,
  productType,
  characterSlug,
  personalize,
}: {
  products: ProductListItem[];
  productId: number;
  productType: string;
  characterSlug: string | null;
  personalize: boolean;
}) {
  const [shown, setShown] = useState(products);

  useEffect(() => {
    if (!personalize) return;
    let cancelled = false;
    const history = readRecentProducts();
    const recentIds = new Set(history.map((item) => item.id));
    const lead = leadingCharacter(history, {
      id: productId,
      characterSlug,
    });

    const apply = (affinity: ProductListItem[]) => {
      if (cancelled) return;
      const next = composeRelated(products, affinity, {
        currentId: productId,
        recentIds,
      });
      if (cancelled) return;
      // localStorage is empty during SSR. The server list has to paint first.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown((current) => (sameProductIds(current, next) ? current : next));
    };

    if (!lead) {
      apply([]);
      return () => {
        cancelled = true;
      };
    }

    loadCharacterCases({ characterSlug: lead, productType })
      .then(apply)
      .catch((error: unknown) => {
        console.error("[related-rail] affinity unavailable:", error);
        apply([]);
      });

    return () => {
      cancelled = true;
    };
  }, [personalize, productId, productType, characterSlug, products]);

  return (
    <ScrollableProductRail>
      {shown.map((item) => (
        <div key={item.id} className={PRODUCT_RAIL_ITEM}>
          <ProductCard product={item} />
        </div>
      ))}
    </ScrollableProductRail>
  );
}
