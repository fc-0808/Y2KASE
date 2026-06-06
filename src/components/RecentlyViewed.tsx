"use client";

/**
 * Recently viewed products rail.
 *
 * Records the current product into localStorage on mount, then renders the
 * previously viewed items (excluding the current one). A classic, high-ROI
 * merchandising pattern: it brings shoppers back to products they were
 * considering and increases pages-per-session — entirely client-side, so it
 * costs the server nothing and personalizes without any account.
 */

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import type { ProductListItem } from "@/lib/products";

const STORAGE_KEY = "y2k_recently_viewed";
const MAX = 12;

type StoredItem = Pick<
  ProductListItem,
  "id" | "slug" | "title" | "price" | "compareAtPrice" | "currency" | "imageUrl"
>;

function read(): StoredItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredItem[]) : [];
  } catch {
    return [];
  }
}

export function RecentlyViewed({ current }: { current: StoredItem }) {
  const [items, setItems] = useState<StoredItem[]>([]);

  useEffect(() => {
    const previous = read().filter((i) => i.slug !== current.slug);

    // Persist with the current product moved to the front.
    const next = [current, ...previous].slice(0, MAX);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — display still works for this view
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(previous.slice(0, 10));
  }, [current]);

  if (items.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="mb-5 text-xl font-black">Recently viewed</h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div key={item.id} className="w-40 shrink-0 sm:w-52">
            <ProductCard
              product={{
                ...item,
                tags: [],
                featured: false,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
