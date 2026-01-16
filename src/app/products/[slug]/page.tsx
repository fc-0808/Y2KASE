import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProductMediaGallery from '@/components/ProductMediaGallery'
import Link from 'next/link'

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()

  // Fetch product with all related data
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(*),
      variants:product_variants(*),
      media:product_media(*)
    `)
    .eq('slug', params.slug)
    .single()

  if (error || !product) {
    notFound()
  }

  // Sort media by display_order
  const sortedMedia = product.media?.sort((a: any, b: any) => a.display_order - b.display_order) || []

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-12">
      <div className="container-y2k">
        {/* Breadcrumb */}
        <div className="mb-6 text-sm text-gray-600">
          <Link href="/" className="hover:text-pink-500">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/products" className="hover:text-pink-500">Products</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{product.title}</span>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left: Media Gallery */}
          <div>
            <ProductMediaGallery media={sortedMedia} />
          </div>

          {/* Right: Product Info */}
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">{product.title}</h1>

            {/* Category */}
            {product.category && (
              <div className="mb-4">
                <span className="inline-block px-3 py-1 bg-pink-100 text-pink-700 text-sm font-semibold rounded-full">
                  {product.category.name}
                </span>
              </div>
            )}

            {/* Price */}
            <div className="mb-6">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-pink-600">
                  ${product.base_price}
                </span>
                {product.compare_at_price && (
                  <span className="text-xl text-gray-400 line-through">
                    ${product.compare_at_price}
                  </span>
                )}
              </div>
            </div>

            {/* Rating */}
            {product.rating && (
              <div className="flex items-center gap-2 mb-6">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={i < Math.floor(product.rating!) ? 'text-yellow-400' : 'text-gray-300'}>
                      ★
                    </span>
                  ))}
                </div>
                <span className="text-sm text-gray-600">
                  {product.rating} ({product.reviews_count || 0} reviews)
                </span>
              </div>
            )}

            {/* Description */}
            {product.description && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
                <p className="text-gray-600 leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  {product.option1_label || 'Options'}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {product.variants.map((variant: any) => (
                    <button
                      key={variant.id}
                      className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-pink-500 transition-colors text-left"
                    >
                      <div className="font-medium text-gray-900">{variant.option1_value}</div>
                      {variant.option2_value && (
                        <div className="text-sm text-gray-600">{variant.option2_value}</div>
                      )}
                      <div className="text-sm font-semibold text-pink-600 mt-1">
                        ${variant.price || product.base_price}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add to Cart */}
            <button className="w-full bg-pink-600 text-white py-4 px-8 rounded-lg font-semibold text-lg hover:bg-pink-700 transition-colors">
              Add to Cart
            </button>

            {/* Product Details */}
            <div className="mt-8 pt-8 border-t">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Details</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">SKU</dt>
                  <dd className="text-gray-900 font-medium">{product.id.slice(0, 8)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Availability</dt>
                  <dd className="text-green-600 font-medium">
                    {product.is_active ? 'In Stock' : 'Out of Stock'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
