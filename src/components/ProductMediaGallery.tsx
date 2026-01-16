'use client'

import { useState } from 'react'
import Image from 'next/image'

interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  display_order: number
}

interface Props {
  media: MediaItem[]
}

export default function ProductMediaGallery({ media }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (!media || media.length === 0) {
    return (
      <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
        <span className="text-gray-400 text-4xl">📷</span>
      </div>
    )
  }

  const sortedMedia = [...media].sort((a, b) => a.display_order - b.display_order)
  const activeItem = sortedMedia[activeIndex]

  return (
    <div className="space-y-4">
      {/* Main Display */}
      <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
        {activeItem.type === 'video' ? (
          <video
            key={activeItem.id}
            src={activeItem.url}
            controls
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
          />
        ) : (
          <Image
            src={activeItem.url}
            alt="Product"
            fill
            className="object-cover"
            priority={activeIndex === 0}
          />
        )}

        {/* Type Badge */}
        {activeItem.type === 'video' && (
          <div className="absolute top-4 right-4 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
            🎥 VIDEO
          </div>
        )}
      </div>

      {/* Thumbnail Navigation */}
      {sortedMedia.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {sortedMedia.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setActiveIndex(idx)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                idx === activeIndex
                  ? 'border-pink-500 ring-2 ring-pink-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <span className="text-2xl">▶️</span>
                </div>
              ) : (
                <Image
                  src={item.url}
                  alt={`Thumbnail ${idx + 1}`}
                  fill
                  className="object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
