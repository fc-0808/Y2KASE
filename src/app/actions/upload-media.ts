'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function uploadProductMedia(formData: FormData) {
  const supabase = createAdminClient()
  const files = formData.getAll('files') as File[]
  const productId = formData.get('productId') as string
  const slug = formData.get('slug') as string

  if (!files || files.length === 0 || !productId || !slug) {
    return { error: 'Missing files or product ID' }
  }

  // Get current max display_order to avoid collisions
  const { data: existingMedia } = await supabase
    .from('product_media')
    .select('display_order')
    .eq('product_id', productId)
    .order('display_order', { ascending: false })
    .limit(1)

  const startOrder = existingMedia?.[0]?.display_order ?? -1

  // Process all files in parallel
  const uploadPromises = files.map(async (file, index) => {
    // 1. Detect Type
    const isVideo = file.type.startsWith('video/')
    const fileType = isVideo ? 'video' : 'image'

    // 2. Security Check
    if (isVideo && file.size > 50 * 1024 * 1024) {
      return { error: `Video ${file.name} is too large (Max 50MB)` }
    }

    // 3. Prepare Path
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `products/${slug}/${fileName}`

    // 4. Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from('product-media')
      .upload(filePath, file)

    if (uploadError) return { error: `Upload failed for ${file.name}` }

    // 5. Get URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-media')
      .getPublicUrl(filePath)

    // 6. Save to Database
    const { error: dbError } = await supabase
      .from('product_media')
      .insert({
        product_id: productId,
        url: publicUrl,
        type: fileType,
        display_order: startOrder + index + 1
      })

    // CRITICAL: If DB fails, cleanup the orphan file
    if (dbError) {
      await supabase.storage.from('product-media').remove([filePath])
      return { error: `DB Save failed for ${file.name}` }
    }

    return { success: true, url: publicUrl, type: fileType }
  })

  // Wait for all uploads to finish
  const uploadResults = await Promise.all(uploadPromises)

  return { results: uploadResults }
}
