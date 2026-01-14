import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product, Variant } from '@/types/index';

interface CartState {
  items: CartItem[];
}

interface CartActions {
  addItem: (product: Product, variant: Variant, quantity: number) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

type CartStore = CartState & CartActions;

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product, variant: Variant, quantity: number) => {
        set((state) => {
          const existingItem = state.items.find((item) => item.variant.id === variant.id);
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.variant.id === variant.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                product,
                variant,
                quantity,
              },
            ],
          };
        });
      },

      removeItem: (variantId: string) => {
        set((state) => ({
          items: state.items.filter((item) => item.variant.id !== variantId),
        }));
      },

      updateQuantity: (variantId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(variantId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.variant.id === variantId ? { ...item, quantity } : item
          ),
        }));
      },

      clearCart: () => {
        set({ items: [] });
      },

      getTotalPrice: () => {
        return get().items.reduce((total, item) => {
          const price = item.variant?.price || item.product?.base_price || 0;
          return total + price * item.quantity;
        }, 0);
      },

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: 'cart-storage',
    }
  )
);

interface UserState {
  user: Record<string, unknown> | null;
  isLoading: boolean;
}

interface UserActions {
  setUser: (user: Record<string, unknown> | null) => void;
  clearUser: () => void;
  setIsLoading: (loading: boolean) => void;
}

type UserStore = UserState & UserActions;

export const useUser = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
