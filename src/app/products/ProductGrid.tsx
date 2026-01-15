'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/store';
import type { ProductDisplay, Product } from '@/types/index';

const SORT_OPTIONS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-low', label: 'Price: Low to High' },
  { id: 'price-high', label: 'Price: High to Low' },
  { id: 'newest', label: 'Newest First' },
  { id: 'rating', label: 'Top Rated' },
];

interface ProductGridProps {
  initialProducts: ProductDisplay[];
  categories: Array<{ id: number; name: string; slug: string }>;
}

export default function ProductGrid({ initialProducts, categories }: ProductGridProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('featured');
  const [priceRange, setPriceRange] = useState([0, 50]);
  const [showFilters, setShowFilters] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const addToCart = useCart((state) => state.addItem);

  // Build category filter options from database
  const categoryOptions = [
    { id: 'all', label: 'All Cases', emoji: '✨', slug: 'all' },
    ...categories.map((cat) => ({
      id: cat.slug,
      label: cat.name,
      emoji: '🎀', // You can store emojis in DB or map them here
      slug: cat.slug,
    })),
  ];

  const filteredProducts = initialProducts
    .filter((product) => {
      const categoryMatch = selectedCategory === 'all' || product.category?.slug === selectedCategory;
      const priceMatch = product.price >= priceRange[0] && product.price <= priceRange[1];
      return categoryMatch && priceMatch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'newest':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        default:
          return 0;
      }
    });

  const handleAddToCart = (product: ProductDisplay) => {
    // CRITICAL: Never create fake variants. If no variants exist, the product is unavailable.
    if (!product.variants || product.variants.length === 0) {
      setNotification(`${product.title} is currently unavailable ❌`);
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    // Use the first real variant from the database
    const variant = product.variants[0];

    addToCart(product as Product, variant, 1);
    setNotification(`${product.title} added to cart! 🛒`);
    setTimeout(() => setNotification(null), 3000);
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={`text-sm ${i < Math.floor(rating) ? 'text-yellow-400' : 'text-chrome-300'}`}>
        ★
      </span>
    ));
  };

  return (
    <>
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-24 right-6 z-50 animate-bounce-in">
          <div className="bg-linear-to-r from-pink-500 to-y2k-500 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-3">
            <span className="text-lg">✨</span>
            <span className="text-sm font-semibold">{notification}</span>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sticky top-16 z-40 bg-white/90 backdrop-blur-md border-y border-pink-100">
        <div className="container-y2k">
          <div className="flex items-center justify-between py-4">
            <span className="text-chrome-600 text-sm font-medium">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'case' : 'cases'} ✨
            </span>

            <div className="flex items-center gap-4">
              {/* Mobile Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden flex items-center gap-2 text-y2k-700 text-sm font-semibold bg-pink-50 px-4 py-2 rounded-full"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
              </button>

              {/* Sort Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-white border-2 border-pink-200 px-4 py-2 pr-10 text-sm text-y2k-700 cursor-pointer hover:border-pink-400 focus:outline-none focus:border-pink-500 rounded-full font-medium"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-400 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container-y2k py-10">
        <div className="flex gap-10">
          {/* Sidebar Filters */}
          <aside className={`${showFilters ? 'block' : 'hidden'} lg:block w-full lg:w-60 shrink-0`}>
            <div className="sticky top-36 space-y-8">
              {/* Categories */}
              <div className="card-y2k p-6">
                <h3 className="font-display text-y2k-800 font-semibold mb-4 flex items-center gap-2">
                  <span>🏷️</span> Categories
                </h3>
                <div className="space-y-2">
                  {categoryOptions.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.slug)}
                      className={`flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-medium rounded-full transition-all ${
                        selectedCategory === cat.slug
                          ? 'bg-linear-to-r from-pink-500 to-y2k-500 text-white'
                          : 'text-y2k-700 hover:bg-pink-50'
                      }`}
                    >
                      <span>{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div className="card-y2k p-6">
                <h3 className="font-display text-y2k-800 font-semibold mb-4 flex items-center gap-2">
                  <span>💰</span> Price Range
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm text-chrome-600 mb-2">
                      <span>Min</span>
                      <span className="font-semibold text-pink-500">${priceRange[0]}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="5"
                      value={priceRange[0]}
                      onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm text-chrome-600 mb-2">
                      <span>Max</span>
                      <span className="font-semibold text-pink-500">${priceRange[1]}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="5"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Reset Filters */}
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setPriceRange([0, 50]);
                  setSortBy('featured');
                }}
                className="w-full text-sm text-pink-500 hover:text-pink-600 transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <span>🔄</span> Reset all filters
              </button>
            </div>
          </aside>

          {/* Products Grid */}
          <div className="flex-1">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="text-5xl mb-4">😢</span>
                <p className="text-chrome-600 mb-4 font-medium">No cases match your filters</p>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setPriceRange([0, 50]);
                  }}
                  className="btn btn-primary"
                >
                  Clear Filters ✨
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                {filteredProducts.map((product) => (
                  <div key={product.id} className="group">
                    {/* Product Image */}
                    <div className="card-y2k overflow-hidden mb-4">
                      <div className="relative aspect-3/4 overflow-hidden">
                        <Image
                          src={product.image || '/placeholder.jpg'}
                          alt={product.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />

                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex flex-col gap-2">
                          {product.created_at && new Date(product.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) && (
                            <span className="badge-new inline-block px-3 py-1.5 text-xs font-bold uppercase rounded-full">
                              New ✨
                            </span>
                          )}
                          {product.compare_at_price && product.compare_at_price > product.price && (
                            <span className="badge-sale inline-block px-3 py-1.5 text-xs font-bold uppercase rounded-full">
                              {Math.round((1 - product.price / product.compare_at_price) * 100)}% Off
                            </span>
                          )}
                        </div>

                        {/* Hover Actions */}
                        <div className="absolute inset-0 bg-pink-500/0 group-hover:bg-pink-500/10 transition-colors duration-300" />
                        <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                          <button
                            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-pink-500 hover:text-white transition-colors"
                            aria-label="Add to wishlist"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleAddToCart(product)}
                            disabled={!product.variants || product.variants.length === 0}
                            className={`w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg transition-colors ${
                              !product.variants || product.variants.length === 0
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-pink-500 hover:text-white'
                            }`}
                            aria-label="Add to cart"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Product Info */}
                    <div className="text-center">
                      {/* Rating */}
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <div className="flex">{renderStars(product.rating || 5)}</div>
                        <span className="text-xs text-chrome-500">({product.reviews_count || 0})</span>
                      </div>

                      {/* Name */}
                      <Link href={`/products/${product.slug}`}>
                        <h3 className="font-display text-y2k-800 text-base md:text-lg font-semibold mb-1 group-hover:text-pink-500 transition-colors leading-snug">
                          {product.title}
                        </h3>
                      </Link>

                      {/* Description */}
                      <p className="text-chrome-500 text-sm mb-2 line-clamp-1">
                        {product.description}
                      </p>

                      {/* Price */}
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-pink-500 font-bold text-lg">
                          ${product.price.toFixed(2)}
                        </span>
                        {product.compare_at_price && product.compare_at_price > product.price && (
                          <span className="text-chrome-400 text-sm line-through">
                            ${product.compare_at_price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
