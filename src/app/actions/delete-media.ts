'use server'

import { createClient } from '@/lib/supabase/server'

export async function deleteProductMedia(mediaId: string, mediaUrl: string) {
  const supabase = await createClient()

  // 1. Extract file path from URL
  const urlParts = mediaUrl.split('/storage/v1/object/public/product-media/')
  if (urlParts.length < 2) {
    return { error: 'Invalid media URL' }
  }
  const filePath = urlParts[1]

  // 2. Delete from database first (safer - if this fails, we keep the file)
  const { error: dbError } = await supabase
    .from('product_media')
    .delete()
    .eq('id', mediaId)

  if (dbError) {
    return { error: 'Failed to delete media record' }
  }

  // 3. Delete from storage (if this fails, orphan file exists but no DB record)
  const { error: storageError } = await supabase.storage
    .from('product-media')
    .remove([filePath])

  if (storageError) {
    // Log but don't fail - the DB record is gone which is most important
    console.error('Storage deletion failed:', storageError)
  }

  return { success: true }
}
