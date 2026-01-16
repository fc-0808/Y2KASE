'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function createProductAction(data: {
  title: string
  slug: string
  description: string
  base_price: number
}) {
  try {
    const supabase = createAdminClient()

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        title: data.title,
        slug: data.slug,
        description: data.description,
        base_price: data.base_price,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      console.error('Product creation error:', error)
      return { error: error.message }
    }

    return { product }
  } catch (err: any) {
    console.error('Product creation exception:', err)
    return { error: err.message || 'Failed to create product' }
  }
}
