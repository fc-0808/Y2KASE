'use client'

import { useState } from 'react'
import MediaUploader from '@/components/admin/MediaUploader'
import { createAdminClient } from '@/lib/supabase/admin'

export default function NewProductPage() {
  const [loading, setLoading] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [productSlug, setProductSlug] = useState<string>('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    
    try {
      const supabase = createAdminClient()

      const { data: product, error } = await supabase
        .from('products')
        .insert({
          title: formData.get('title') as string,
          slug: formData.get('slug') as string,
          description: formData.get('description') as string,
          base_price: parseFloat(formData.get('base_price') as string),
          is_active: true
        })
        .select()
        .single()

      setLoading(false)

      if (error || !product) {
        alert('Failed to create product: ' + (error?.message || 'Unknown error'))
        return
      }

      setSuccessId(product.id)
      setProductSlug(product.slug)
    } catch (err: any) {
      setLoading(false)
      alert('Failed to create product: ' + err.message)
    }
  }

  // Success Screen with Media Uploader
  if (successId) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border rounded-xl p-8 shadow-sm">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <span className="text-3xl">✅</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Created!</h2>
              <p className="text-gray-600">ID: {successId}</p>
              <p className="text-sm text-gray-500 mt-1">Slug: {productSlug}</p>
            </div>

            {/* THE NEW UPLOADER */}
            <div className="mb-8">
              <h3 className="font-bold text-gray-900 mb-4 text-lg">Step 2: Add Media</h3>
              <MediaUploader 
                productId={successId} 
                productSlug={productSlug}
                onUploadComplete={() => console.log('Upload complete!')}
              />
            </div>

            <div className="text-center border-t pt-6">
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-blue-600 underline hover:text-blue-800"
              >
                Finish & Create Another Product
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Product Creation Form
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border rounded-xl p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Create New Product</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Title
              </label>
              <input
                type="text"
                name="title"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="Handmade Ceramic Mug"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Slug (URL-friendly)
              </label>
              <input
                type="text"
                name="slug"
                required
                pattern="[a-z0-9-]+"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="handmade-ceramic-mug"
              />
              <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="Describe your product..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base Price ($)
              </label>
              <input
                type="number"
                name="base_price"
                required
                step="0.01"
                min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="29.99"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pink-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-pink-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Product & Continue to Upload Media'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
