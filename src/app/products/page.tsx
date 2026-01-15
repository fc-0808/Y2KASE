import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import ProductGrid from './ProductGrid';
import type { ProductDisplay, Product, Variant, ProductMedia, Category } from '@/types/index';

export const revalidate = 60; // Cache for 60 seconds

// Type for the Supabase query result with joins
type ProductWithJoins = Product & {
  category: Category | null;
  variants: Variant[] | null;
  media: ProductMedia[] | null;
};

export default async function ProductsPage() {
  const supabase = await createClient();

  // Fetch real data from Supabase
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(name, slug),
      variants:product_variants(*),
      media:product_media(*)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching products:', error);
  }

  // Transform data to match ProductDisplay interface
  const formattedProducts: ProductDisplay[] = ((products || []) as unknown as ProductWithJoins[]).map((product) => {
    // Calculate price from variants or use base_price
    const variantPrices = product.variants?.map((v: Variant) => v.price).filter((p): p is number => p !== null) || [];
    const price = variantPrices.length > 0 ? Math.min(...variantPrices) : product.base_price;

    // Build compatibility list from variants' option1_value
    const compatibility = [...new Set(product.variants?.map((v: Variant) => v.option1_value) || [])];

    // Get the main image (display_order = 0)
    const image = product.media?.find((m: ProductMedia) => m.display_order === 0)?.url || '/placeholder.jpg';

    return {
      ...product,
      price,
      compatibility,
      image,
    };
  });

  return (
    <main className="min-h-screen bg-y2k-soft">
      {/* Navigation */}
      <Navbar />

      {/* Page Header */}
      <section className="pt-28 pb-12">
        <div className="container-y2k">
          <div className="flex flex-col items-center text-center">
            <span className="text-4xl mb-3">📱✨</span>
            <h1 className="font-display text-y2k-800 text-3xl md:text-4xl font-bold mb-3">
              Phone Cases
            </h1>
            <p className="text-chrome-600 max-w-lg">
              Find your perfect match! Cute, trendy, and totally Y2K aesthetic cases for your phone.
            </p>
          </div>
        </div>
      </section>

      {/* Product Grid (Client Component for Interactivity) */}
      <ProductGrid initialProducts={formattedProducts} />
    </main>
  );
}
