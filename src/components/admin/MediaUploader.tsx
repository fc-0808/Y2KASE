'use client'

import { useState, useRef } from 'react'
import { uploadProductMedia } from '@/app/actions/upload-media'
import { deleteProductMedia } from '@/app/actions/delete-media'
import Image from 'next/image'

interface MediaItem {
  id?: string
  url: string
  type: 'image' | 'video'
}

interface Props {
  productId: string
  productSlug: string
  onUploadComplete?: () => void
}

export default function MediaUploader({ productId, productSlug, onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)

    const formData = new FormData()
    formData.append('productId', productId)
    formData.append('slug', productSlug)

    Array.from(files).forEach((file) => {
      formData.append('files', file)
    })

    const result = await uploadProductMedia(formData)

    setUploading(false)

    if (result.results) {
      const newItems = result.results
        .filter(r => r.success && r.url)
        .map(r => ({ url: r.url!, type: r.type as 'image' | 'video' }))
      
      setMediaItems(prev => [...prev, ...newItems])
      
      if (onUploadComplete) onUploadComplete()
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(item: MediaItem, index: number) {
    if (!item.id) {
      // Just uploaded, not yet saved with ID - remove from UI only
      setMediaItems(prev => prev.filter((_, i) => i !== index))
      return
    }

    const confirmed = confirm('Delete this media? This cannot be undone.')
    if (!confirmed) return

    const result = await deleteProductMedia(item.id, item.url)
    
    if (result.success) {
      setMediaItems(prev => prev.filter((_, i) => i !== index))
    } else {
      alert('Failed to delete media')
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          uploading 
            ? 'bg-gray-50 border-gray-300' 
            : 'border-pink-300 hover:bg-pink-50 hover:border-pink-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFiles}
          className="hidden"
          disabled={uploading}
        />
        
        {uploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mb-2"></div>
            <p className="text-gray-500">Uploading media...</p>
          </div>
        ) : (
          <div>
            <span className="text-4xl block mb-2">📸 🎥</span>
            <p className="text-gray-700 font-medium">Click to upload Photos & Videos</p>
            <p className="text-sm text-gray-500 mt-1">Select multiple files at once</p>
          </div>
        )}
      </div>

      {/* Media Grid with Delete Buttons */}
      {mediaItems.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
          {mediaItems.map((item, idx) => (
            <div
              key={idx}
              className="relative aspect-square rounded-lg overflow-hidden border bg-gray-100 shadow-sm group"
            >
              {item.type === 'video' ? (
                <video
                  src={item.url}
                  className="w-full h-full object-cover"
                  controls
                />
              ) : (
                <Image
                  src={item.url}
                  alt="Product media"
                  fill
                  className="object-cover"
                />
              )}
              
              {/* Video Badge */}
              {item.type === 'video' && (
                <span className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-full">
                  VIDEO
                </span>
              )}

              {/* Delete Button */}
              <button
                onClick={() => handleDelete(item, idx)}
                className="absolute top-2 left-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
