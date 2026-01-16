// src/types/index.ts
// IMPORTANT: These types are derived from the auto-generated database types.
// To regenerate database types, run: npx supabase gen types typescript --project-id "your-project-id" > src/types/database.types.ts

import type { Tables } from './database.types';

// Base types from database
export type Product = Tables<'products'>;
export type Variant = Tables<'product_variants'>;
export type ProductMedia = Tables<'product_media'>;
export type Review = Tables<'reviews'>;
export type Category = Tables<'categories'>;
export type Collection = Tables<'collections'>;

// Extended types for when you join tables
export type ProductWithRelations = Product & {
  category?: Category | null;
  variants?: Variant[] | null;
  media?: ProductMedia[] | null;
  reviews?: Review[] | null;
};

// Helper type for display purposes (with computed fields)
export type ProductDisplay = ProductWithRelations & {
  price: number; // Computed from variants or base_price
  compatibility: string[]; // Computed from variants' option1_value
  image: string; // First media item's URL
};

// Cart functionality
// Note: Product in cart may have extended data (media, category) from when it was added
export interface CartItem {
  product: Product & {
    media?: ProductMedia[];
    category?: Category;
  };
  variant: Variant;
  quantity: number;
}

// Media Upload Types
export type MediaType = 'image' | 'video'

export interface MediaUploadResult {
  success?: boolean
  error?: string
  url?: string
  type?: MediaType
}
