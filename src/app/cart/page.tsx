'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/store';

export default function CartPage() {
  const { items, removeItem, updateQuantity, getTotalPrice, clearCart } = useCart();

  // Empty Cart State
  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-y2k-soft">
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
              <div className="w-20" />
            </div>
          </div>
        </nav>

        {/* Empty State */}
        <div className="pt-32 pb-20">
          <div className="container-y2k">
            <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <span className="text-6xl mb-6">🛒</span>
              <h1 className="font-display text-y2k-800 text-2xl md:text-3xl font-bold mb-3">
                Your Cart is Empty!
              </h1>
              <p className="text-chrome-600 mb-8">
                Time to find your perfect phone case match! Browse our cute collection and treat yourself. 💖
              </p>
              <Link href="/products" className="btn btn-primary">
                Shop Now ✨
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const subtotal = getTotalPrice();
  const shipping = subtotal > 35 ? 0 : 4.99;
  const tax = (subtotal + shipping) * 0.08;
  const total = subtotal + shipping + tax;

  return (
    <main className="min-h-screen bg-y2k-soft">
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
            <div className="w-20" />
          </div>
        </div>
      </nav>


      {/* Page Content */}
      <div className="pt-28 pb-16">
        <div className="container-y2k">
          {/* Page Header */}
          <div className="mb-10 text-center">
            <span className="text-4xl mb-3 block">🛒</span>
            <h1 className="font-display text-y2k-800 text-3xl md:text-4xl font-bold">Your Cart</h1>
            <p className="text-chrome-600 mt-2">Almost there! Review your cute picks 💖</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {/* Cart Items */}
            <div className="lg:col-span-2">
              <div className="card-y2k overflow-hidden">
                {/* Table Header - Desktop */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-pink-100 bg-pink-50/50">
                  <div className="col-span-6 text-xs font-bold uppercase text-y2k-600 tracking-wide">
                    Product
                  </div>
                  <div className="col-span-2 text-xs font-bold uppercase text-y2k-600 tracking-wide text-center">
                    Quantity
                  </div>
                  <div className="col-span-2 text-xs font-bold uppercase text-y2k-600 tracking-wide text-right">
                    Price
                  </div>
                  <div className="col-span-2 text-xs font-bold uppercase text-y2k-600 tracking-wide text-right">
                    Total
                  </div>
                </div>

                {/* Cart Items */}
                {items.map((item) => (
                  <div
                    key={`${item.product.id}-${item.variant.id}`}
                    className="grid grid-cols-1 md:grid-cols-12 gap-4 p-6 border-b border-pink-100 items-center"
                  >
                    {/* Product Info */}
                    <div className="md:col-span-6 flex items-start gap-4">
                      <div className="relative w-20 h-24 shrink-0 rounded-xl overflow-hidden bg-pink-50">
                        <Image
                          src={item.product?.media?.[0]?.url || 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=150&h=200&fit=crop'}
                          alt={item.product?.title || 'Product'}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="flex flex-col justify-center min-w-0">
                        <Link href={`/products/${item.product.slug}`}>
                          <h3 className="font-display text-y2k-800 text-base font-semibold hover:text-pink-500 transition-colors leading-snug mb-1">
                            {item.product?.title || 'Product'}
                          </h3>
                        </Link>
                        <p className="text-chrome-500 text-xs mb-2">
                          SKU: {item.variant?.sku || 'N/A'}
                        </p>
                        <button
                          onClick={() => removeItem(item.variant.id)}
                          className="text-pink-400 hover:text-pink-600 text-xs font-medium transition-colors self-start flex items-center gap-1"
                        >
                          <span>🗑️</span> Remove
                        </button>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="md:col-span-2 flex items-center justify-start md:justify-center">
                      <div className="inline-flex items-center border-2 border-pink-200 rounded-full overflow-hidden">
                        <button
                          onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center text-y2k-600 hover:bg-pink-50 transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        </button>
                        <span className="w-10 h-8 flex items-center justify-center text-sm font-semibold text-y2k-800 border-x-2 border-pink-200">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center text-y2k-600 hover:bg-pink-50 transition-colors"
                          aria-label="Increase quantity"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="md:col-span-2 flex items-center justify-start md:justify-end">
                      <span className="text-chrome-600 text-sm md:hidden mr-2">Price:</span>
                      <span className="text-y2k-700 text-sm font-medium">
                        ${(item.variant?.price || item.product?.base_price || 0).toFixed(2)}
                      </span>
                    </div>

                    {/* Total */}
                    <div className="md:col-span-2 flex items-center justify-start md:justify-end">
                      <span className="text-chrome-600 text-sm md:hidden mr-2">Total:</span>
                      <span className="text-pink-500 font-bold text-sm">
                        ${((item.variant?.price || item.product?.base_price || 0) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Cart Actions */}
                <div className="flex items-center justify-between p-6 bg-pink-50/30">
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-2 text-y2k-600 text-sm font-medium hover:text-pink-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                    </svg>
                    Continue Shopping
                  </Link>
                  <button
                    onClick={clearCart}
                    className="text-chrome-500 text-sm font-medium hover:text-pink-500 transition-colors flex items-center gap-1"
                  >
                    <span>🗑️</span> Clear Cart
                  </button>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="card-y2k sticky top-24 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-pink-100 bg-gradient-to-r from-pink-50 to-y2k-50">
                  <h2 className="font-display text-y2k-800 text-lg font-bold flex items-center gap-2">
                    <span>📋</span> Order Summary
                  </h2>
                </div>

                {/* Summary Details */}
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-chrome-600 text-sm">Subtotal</span>
                    <span className="text-y2k-700 text-sm font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-chrome-600 text-sm">Shipping</span>
                    {shipping === 0 ? (
                      <span className="text-lime-600 text-sm font-bold">FREE! 🎉</span>
                    ) : (
                      <span className="text-y2k-700 text-sm font-medium">${shipping.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-chrome-600 text-sm">Estimated Tax</span>
                    <span className="text-y2k-700 text-sm font-medium">${tax.toFixed(2)}</span>
                  </div>
                </div>

                {/* Total */}
                <div className="px-6 py-5 bg-gradient-to-r from-pink-50 to-y2k-50 border-t border-pink-100">
                  <div className="flex items-center justify-between mb-5">
                    <span className="font-display text-y2k-800 text-base font-bold">Total</span>
                    <span className="text-pink-500 text-xl font-bold">
                      ${total.toFixed(2)}
                    </span>
                  </div>

                  {/* Free Shipping Notice */}
                  {subtotal < 35 && (
                    <div className="bg-cyber-50 border-2 border-cyber-200 p-3 rounded-xl mb-5">
                      <p className="text-xs text-cyber-700 text-center font-medium">
                        Add <span className="font-bold">${(35 - subtotal).toFixed(2)}</span> more for FREE shipping! 🚚✨
                      </p>
                    </div>
                  )}

                  <Link href="/checkout" className="btn btn-primary w-full text-center mb-3">
                    Checkout 💖
                  </Link>

                  {/* Payment Icons */}
                  <div className="flex items-center justify-center gap-2 pt-3 border-t border-pink-100">
                    {['💳', '🍎', '🅿️', '💰'].map((icon, idx) => (
                      <div
                        key={idx}
                        className="w-10 h-6 bg-white rounded-lg flex items-center justify-center border border-pink-100"
                      >
                        <span className="text-sm">{icon}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trust Badges */}
                <div className="px-6 py-5 border-t border-pink-100">
                  <div className="space-y-3">
                    {[
                      { emoji: '🔒', text: 'Secure Checkout' },
                      { emoji: '🔄', text: '30-Day Easy Returns' },
                      { emoji: '✅', text: 'Quality Guaranteed' },
                    ].map((badge, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-lg">{badge.emoji}</span>
                        <span className="text-chrome-600 text-xs font-medium">{badge.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
