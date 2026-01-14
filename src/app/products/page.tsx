'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/store';
import type { Product } from '@/types/index';

interface DisplayProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  original_price?: number;
  category: string;
  images: string[];
  in_stock: boolean;
  stock_quantity: number;
  sku: string;
  created_at: string;
  updated_at: string;
  rating: number;
  reviews_count: number;
  isNew: boolean;
  compatibility: string[];
}

const MOCK_PRODUCTS: DisplayProduct[] = [
  {
    id: '1',
    name: 'Pink Butterfly Dreams',
    description: 'Adorable pink butterfly design with holographic accents',
    price: 24.99,
    original_price: 29.99,
    category: 'cute',
    images: ['https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 50,
    sku: 'Y2K-BTF-001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 4.9,
    reviews_count: 127,
    isNew: false,
    compatibility: ['iPhone 15', 'iPhone 14', 'iPhone 13'],
  },
  {
    id: '2',
    name: 'Holographic Hearts',
    description: 'Shimmering holographic hearts on clear case',
    price: 22.99,
    category: 'aesthetic',
    images: ['https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 35,
    sku: 'Y2K-HRT-002',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 4.8,
    reviews_count: 89,
    isNew: true,
    compatibility: ['iPhone 15', 'iPhone 14', 'Samsung S24'],
  },
  {
    id: '3',
    name: 'Cyber Y2K Chrome',
    description: 'Futuristic chrome finish with Y2K symbols',
    price: 26.99,
    category: 'retro',
    images: ['https://images.unsplash.com/photo-1609692814858-f7cd2f0afa4f?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 42,
    sku: 'Y2K-CHR-003',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 4.7,
    reviews_count: 64,
    isNew: true,
    compatibility: ['iPhone 15 Pro', 'iPhone 14 Pro'],
  },
  {
    id: '4',
    name: 'Pastel Cloud Case',
    description: 'Dreamy pastel clouds with rainbow accents',
    price: 21.99,
    category: 'cute',
    images: ['https://images.unsplash.com/photo-1556656793-08538906a9f8?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 28,
    sku: 'Y2K-CLD-004',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 4.9,
    reviews_count: 156,
    isNew: false,
    compatibility: ['iPhone 15', 'iPhone 14', 'iPhone 13', 'Samsung S23'],
  },
  {
    id: '5',
    name: 'Retro Flame Design',
    description: 'Classic Y2K flame pattern in vibrant colors',
    price: 23.99,
    original_price: 28.99,
    category: 'retro',
    images: ['https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 19,
    sku: 'Y2K-FLM-005',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 4.6,
    reviews_count: 73,
    isNew: false,
    compatibility: ['iPhone 15', 'iPhone 14'],
  },
  {
    id: '6',
    name: 'Kawaii Bear Friends',
    description: 'Cute kawaii bears with sparkles and stars',
    price: 24.99,
    category: 'cute',
    images: ['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 45,
    sku: 'Y2K-BEAR-006',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 5.0,
    reviews_count: 201,
    isNew: false,
    compatibility: ['iPhone 15', 'iPhone 14', 'iPhone 13', 'Samsung S24', 'Samsung S23'],
  },
  {
    id: '7',
    name: 'Gradient Sunset Vibes',
    description: 'Beautiful gradient sunset colors with glitter',
    price: 25.99,
    category: 'aesthetic',
    images: ['https://images.unsplash.com/photo-1605236453806-6ff36851218e?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 33,
    sku: 'Y2K-SUN-007',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 4.8,
    reviews_count: 92,
    isNew: true,
    compatibility: ['iPhone 15 Pro Max', 'iPhone 14 Pro Max'],
  },
  {
    id: '8',
    name: 'Star Girl Sparkle',
    description: 'Starry design with iridescent finish',
    price: 22.99,
    original_price: 27.99,
    category: 'aesthetic',
    images: ['https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=500&h=650&fit=crop'],
    in_stock: true,
    stock_quantity: 56,
    sku: 'Y2K-STAR-008',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: 4.7,
    reviews_count: 118,
    isNew: false,
    compatibility: ['iPhone 15', 'iPhone 14', 'Samsung S24'],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Cases', emoji: '✨' },
  { id: 'cute', label: 'Cute & Kawaii', emoji: '🎀' },
  { id: 'retro', label: 'Retro Y2K', emoji: '💿' },
  { id: 'aesthetic', label: 'Aesthetic', emoji: '🦋' },
];

const SORT_OPTIONS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-low', label: 'Price: Low to High' },
  { id: 'price-high', label: 'Price: High to Low' },
  { id: 'newest', label: 'Newest First' },
  { id: 'rating', label: 'Top Rated' },
];


export default function ProductsPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('featured');
  const [priceRange, setPriceRange] = useState([0, 50]);
  const [showFilters, setShowFilters] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const addToCart = useCart((state) => state.addItem);

  const filteredProducts = MOCK_PRODUCTS.filter((product) => {
    const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;
    const priceMatch = product.price >= priceRange[0] && product.price <= priceRange[1];
    return categoryMatch && priceMatch;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'price-low':
        return a.price - b.price;
      case 'price-high':
        return b.price - a.price;
      case 'newest':
        return a.isNew ? -1 : 1;
      case 'rating':
        return b.rating - a.rating;
      default:
        return 0;
    }
  });

  const handleAddToCart = (product: DisplayProduct) => {
    const cartProduct: Product = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      original_price: product.original_price,
      category: product.category,
      images: product.images,
      in_stock: product.in_stock,
      stock_quantity: product.stock_quantity,
      sku: product.sku,
      created_at: product.created_at,
      updated_at: product.updated_at,
      rating: product.rating,
      reviews_count: product.reviews_count,
    };
    addToCart(cartProduct, 1);
    setNotification(`${product.name} added to cart! 🛒`);
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
    <main className="min-h-screen bg-y2k-soft">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-24 right-6 z-50 animate-bounce-in">
          <div className="bg-gradient-to-r from-pink-500 to-y2k-500 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-3">
            <span className="text-lg">✨</span>
            <span className="text-sm font-semibold">{notification}</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md shadow-lg">
        <div className="container-y2k">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">📱</span>
              <span className="font-display text-xl font-bold text-gradient">Y2KASE</span>
            </Link>
            <div className="hidden md:flex items-center justify-center gap-6">
              {['Shop', 'New Arrivals', 'About', 'Contact'].map((item) => (
                <Link
                  key={item}
                  href={item === 'Shop' ? '/products' : `/${item.toLowerCase().replace(' ', '-')}`}
                  className="text-sm font-semibold text-y2k-700 hover:text-pink-500 transition-colors"
                >
                  {item}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <Link href="/cart" className="text-y2k-700 hover:text-pink-500 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </nav>

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
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-medium rounded-full transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-gradient-to-r from-pink-500 to-y2k-500 text-white'
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
                      <div className="relative aspect-[3/4] overflow-hidden">
                        <Image
                          src={product.images[0]}
                          alt={product.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />

                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex flex-col gap-2">
                          {product.isNew && (
                            <span className="badge-new inline-block px-3 py-1.5 text-xs font-bold uppercase rounded-full">
                              New ✨
                            </span>
                          )}
                          {product.original_price && (
                            <span className="badge-sale inline-block px-3 py-1.5 text-xs font-bold uppercase rounded-full">
                              {Math.round((1 - product.price / product.original_price) * 100)}% Off
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
                            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-pink-500 hover:text-white transition-colors"
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
                        <div className="flex">{renderStars(product.rating)}</div>
                        <span className="text-xs text-chrome-500">({product.reviews_count})</span>
                      </div>

                      {/* Name */}
                      <Link href={`/products/${product.id}`}>
                        <h3 className="font-display text-y2k-800 text-base md:text-lg font-semibold mb-1 group-hover:text-pink-500 transition-colors leading-snug">
                          {product.name}
                        </h3>
                      </Link>

                      {/* Description */}
                      <p className="text-chrome-500 text-sm mb-2 line-clamp-1">
                        {product.description}
                      </p>

                      {/* Price */}
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-pink-500 font-bold text-lg">
                          ${product.price}
                        </span>
                        {product.original_price && (
                          <span className="text-chrome-400 text-sm line-through">
                            ${product.original_price}
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
    </main>
  );
}
