"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  productId: number;
  slug: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  options: Record<string, string>;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  isOpen: boolean;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

/** A cart line is unique per product + selected options. */
export function lineKey(
  productId: number,
  options: Record<string, string>,
): string {
  const opt = Object.entries(options)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  return `${productId}__${opt}`;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      addItem: (item, quantity = 1) =>
        set((state) => {
          const key = lineKey(item.productId, item.options);
          const existing = state.items.find(
            (i) => lineKey(i.productId, i.options) === key,
          );
          if (existing) {
            return {
              isOpen: true,
              items: state.items.map((i) =>
                lineKey(i.productId, i.options) === key
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return { isOpen: true, items: [...state.items, { ...item, quantity }] };
        }),
      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter(
            (i) => lineKey(i.productId, i.options) !== key,
          ),
        })),
      updateQuantity: (key, quantity) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              lineKey(i.productId, i.options) === key
                ? { ...i, quantity: Math.max(0, quantity) }
                : i,
            )
            .filter((i) => i.quantity > 0),
        })),
      clear: () => set({ items: [] }),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    }),
    { name: "y2kase-cart" },
  ),
);

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}
