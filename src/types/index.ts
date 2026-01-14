// src/types/index.ts

export interface Product {
  id: string;
  title: string;
  description: string;
  slug: string;
  
  // Price Logic
  base_price: number;
  compare_at_price?: number;
  
  // Relations
  category_id?: number;
  collection_ids: number[];
  
  // Optional Expanded Data (for when you join tables)
  category?: { name: string }; 
  variants?: Variant[];
  media?: ProductMedia[];
  
  // 2-Axis Options
  option1_label: string;      // e.g. "Device"
  option2_label?: string;     // e.g. "Style"
  
  // Stats
  rating: number;             // matches decimal(3,2) from DB
  reviews_count: number;
  
  // Flags & Timestamps
  is_active: boolean;
  is_bundle: boolean;
  created_at: string;
  updated_at: string;         // Newly added
}

export interface Variant {
  id: string;
  product_id: string;
  option1_value: string;
  option2_value?: string;
  price?: number;
  compare_at_price?: number;
  stock: number;
  sku: string;
}

export interface ProductMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  display_order: number;
}

export interface Review {
  id: string;
  product_id: string;
  user_name: string;
  rating: number;
  comment: string;
  image_url?: string;
  created_at: string;
}

// Optional: Helper type for your Cart functionality later
export interface CartItem {
  product: Product;
  variant: Variant;
  quantity: number;
}