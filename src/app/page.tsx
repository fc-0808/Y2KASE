'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const categories = [
  {
    title: 'Cute & Kawaii',
    subtitle: 'Adorable Designs',
    emoji: '🎀',
    image: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=600&h=800&fit=crop',
    href: '/products?category=cute',
  },
  {
    title: 'Retro Vibes',
    subtitle: '2000s Nostalgia',
    emoji: '💿',
    image: 'https://images.unsplash.com/photo-1609692814858-f7cd2f0afa4f?w=600&h=800&fit=crop',
    href: '/products?category=retro',
  },
  {
    title: 'Aesthetic',
    subtitle: 'Trendy Styles',
    emoji: '✨',
    image: 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=600&h=800&fit=crop',
    href: '/products?category=aesthetic',
  },
];

const featuredProducts = [
  {
    id: 1,
    name: 'Pink Butterfly Dreams',
    price: 24.99,
    image: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=500&h=650&fit=crop',
    badge: 'Bestseller',
  },
  {
    id: 2,
    name: 'Holographic Hearts',
    price: 22.99,
    originalPrice: 29.99,
    image: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=500&h=650&fit=crop',
    badge: 'Sale',
  },
  {
    id: 3,
    name: 'Cyber Y2K Chrome',
    price: 26.99,
    image: 'https://images.unsplash.com/photo-1609692814858-f7cd2f0afa4f?w=500&h=650&fit=crop',
    badge: 'New',
  },
  {
    id: 4,
    name: 'Pastel Cloud Case',
    price: 21.99,
    image: 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=500&h=650&fit=crop',
  },
];

export default function Home() {
  const currentYear = new Date().getFullYear();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled 
            ? 'bg-white/90 backdrop-blur-md shadow-lg py-3' 
            : 'bg-transparent py-5'
        }`}
      >
        <div className="container-y2k">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">📱</span>
              <span className={`font-display text-xl font-bold ${scrolled ? 'text-gradient' : 'text-white'}`}>
                Y2KASE
              </span>
            </Link>

            {/* Center Navigation */}
            <div className="hidden md:flex items-center justify-center gap-6">
              {['Shop', 'New Arrivals', 'About', 'Contact'].map((item) => (
                <Link
                  key={item}
                  href={item === 'Shop' ? '/products' : `/${item.toLowerCase().replace(' ', '-')}`}
                  className={`text-sm font-semibold transition-colors ${
                    scrolled
                      ? 'text-y2k-700 hover:text-pink-500'
                      : 'text-white/90 hover:text-white'
                  }`}
                >
                  {item}
                </Link>
              ))}
            </div>

            {/* Right Icons */}
            <div className="flex items-center gap-4">
              <Link
                href="/cart"
                className={`flex items-center gap-2 transition-colors ${
                  scrolled
                    ? 'text-y2k-700 hover:text-pink-500'
                    : 'text-white/90 hover:text-white'
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
                <span className="hidden sm:inline text-sm font-semibold">Cart</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-y2k-gradient">
        {/* Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 text-6xl float sparkle">✨</div>
          <div className="absolute top-40 right-20 text-5xl float sparkle" style={{ animationDelay: '0.5s' }}>💖</div>
          <div className="absolute bottom-40 left-20 text-4xl float sparkle" style={{ animationDelay: '1s' }}>🦋</div>
          <div className="absolute bottom-20 right-10 text-5xl float sparkle" style={{ animationDelay: '1.5s' }}>⭐</div>
          <div className="absolute top-1/3 left-1/4 text-3xl float" style={{ animationDelay: '0.3s' }}>💿</div>
          <div className="absolute top-1/2 right-1/4 text-4xl float" style={{ animationDelay: '0.8s' }}>🌸</div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 w-full">
          <div className="container-y2k">
            <div className="flex flex-col items-center justify-center text-center px-4">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
                <span className="text-lg">✨</span>
                <span className="text-white text-sm font-semibold">Free Shipping on Orders $35+</span>
                <span className="text-lg">✨</span>
              </div>
              
              <h1 className="font-display text-white text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-tight mb-4 drop-shadow-lg">
                Y2K Vibes
              </h1>
              <h2 className="font-display text-white/90 text-3xl sm:text-4xl md:text-5xl font-semibold mb-6">
                Phone Cases 📱💕
              </h2>
              
              <p className="text-white/80 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
                Express yourself with our cute, trendy, and totally aesthetic phone cases. 
                Bringing back the best of 2000s style! 
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/products" className="btn btn-secondary text-lg px-8 py-4">
                  Shop Now ✨
                </Link>
                <Link
                  href="/products?filter=new"
                  className="btn bg-white/20 backdrop-blur-sm border-2 border-white/40 text-white hover:bg-white hover:text-pink-500 transition-all text-lg px-8 py-4"
                >
                  New Arrivals 🆕
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-8 h-12 border-3 border-white/50 rounded-full flex items-start justify-center p-2">
            <div className="w-2 h-3 bg-white/80 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* Brand Promise */}
      <section className="py-16 bg-white">
        <div className="container-y2k">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { emoji: '🚚', title: 'Free Shipping', desc: 'On orders over $35' },
              { emoji: '💝', title: 'Gift Wrapping', desc: 'Available at checkout' },
              { emoji: '🔄', title: 'Easy Returns', desc: '30-day return policy' },
              { emoji: '💬', title: 'Support', desc: 'We\'re here to help!' },
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center text-center p-6 rounded-2xl hover:bg-y2k-50 transition-colors">
                <span className="text-4xl mb-3">{item.emoji}</span>
                <h4 className="font-display text-y2k-800 text-lg font-semibold mb-1">{item.title}</h4>
                <p className="text-chrome-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Categories Section */}
      <section className="py-20 bg-y2k-soft">
        <div className="container-y2k">
          {/* Section Header */}
          <div className="flex flex-col items-center text-center mb-12">
            <span className="text-3xl mb-3">🛍️</span>
            <h2 className="font-display text-y2k-800 text-3xl md:text-4xl font-bold mb-3">
              Shop by Style
            </h2>
            <p className="text-chrome-600 max-w-md">
              Find your perfect vibe! From kawaii cute to retro cool, we&apos;ve got the case for you.
            </p>
          </div>

          {/* Category Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map((category, idx) => (
              <Link key={idx} href={category.href} className="group block">
                <div className="card-y2k overflow-hidden">
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <Image
                      src={category.image}
                      alt={category.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-pink-500/80 via-transparent to-transparent" />
                    
                    {/* Category Text */}
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <span className="text-4xl mb-2 block">{category.emoji}</span>
                      <p className="text-white/80 text-sm font-medium mb-1">
                        {category.subtitle}
                      </p>
                      <h3 className="font-display text-white text-2xl font-bold mb-3">
                        {category.title}
                      </h3>
                      <span className="inline-flex items-center gap-2 text-white text-sm font-semibold group-hover:gap-3 transition-all">
                        Shop Now
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20 bg-white">
        <div className="container-y2k">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12">
            <div className="text-center md:text-left mb-6 md:mb-0">
              <span className="text-3xl mb-2 block">⭐</span>
              <h2 className="font-display text-y2k-800 text-3xl md:text-4xl font-bold">
                Trending Now
              </h2>
              <p className="text-chrome-600 mt-2">Our most-loved phone cases</p>
            </div>
            <Link
              href="/products"
              className="inline-flex items-center justify-center md:justify-start gap-2 text-pink-500 font-semibold hover:text-pink-600 transition-colors"
            >
              View All Cases
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {featuredProducts.map((product) => (
              <div key={product.id} className="group">
                {/* Product Image */}
                <div className="card-y2k overflow-hidden mb-4">
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {product.badge && (
                      <div className="absolute top-3 left-3">
                        <span
                          className={`inline-block px-3 py-1.5 text-xs font-bold uppercase rounded-full ${
                            product.badge === 'Bestseller'
                              ? 'badge-hot'
                              : product.badge === 'Sale'
                              ? 'badge-sale'
                              : 'badge-new'
                          }`}
                        >
                          {product.badge}
                        </span>
                      </div>
                    )}
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-pink-500/0 group-hover:bg-pink-500/10 transition-colors duration-300" />
                    <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-2 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                      <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-pink-500 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </button>
                      <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-pink-500 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Product Info */}
                <div className="text-center">
                  <h3 className="font-display text-y2k-800 text-base md:text-lg font-semibold mb-2 group-hover:text-pink-500 transition-colors">
                    {product.name}
                  </h3>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-pink-500 font-bold text-lg">${product.price}</span>
                    {product.originalPrice && (
                      <span className="text-chrome-400 text-sm line-through">
                        ${product.originalPrice}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote/Feature Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-y2k-gradient opacity-90" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-10 left-10 text-5xl float sparkle">💖</div>
          <div className="absolute bottom-10 right-10 text-5xl float sparkle" style={{ animationDelay: '0.5s' }}>✨</div>
          <div className="absolute top-1/2 left-1/4 text-4xl float" style={{ animationDelay: '1s' }}>🦋</div>
        </div>
        
        <div className="container-y2k relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-5xl mb-6 block">📱💕</span>
            <h2 className="font-display text-white text-3xl md:text-4xl lg:text-5xl font-bold leading-relaxed mb-6">
              Your phone deserves to be as cute as you are!
            </h2>
            <p className="text-white/80 text-lg mb-8">
              Join thousands of happy customers who&apos;ve found their perfect case match.
            </p>
            <Link href="/products" className="btn bg-white text-pink-500 hover:bg-pink-50 text-lg px-8 py-4">
              Find Your Match ✨
            </Link>
          </div>
        </div>
      </section>


      {/* Newsletter Section */}
      <section className="bg-white">
        <div className="container-y2k">
          <div className="py-20">
            <div className="max-w-lg mx-auto text-center">
              <span className="text-4xl mb-4 block">💌</span>
              <h2 className="font-display text-y2k-800 text-3xl md:text-4xl font-bold mb-4">
                Join the Y2K Fam!
              </h2>
              <p className="text-chrome-600 mb-8">
                Get exclusive deals, early access to new drops, and cute content delivered to your inbox! 
              </p>
              
              <form className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="email"
                  placeholder="Enter your email ✨"
                  className="flex-1"
                  required
                />
                <button type="submit" className="btn btn-primary whitespace-nowrap">
                  Subscribe 💖
                </button>
              </form>
              
              <p className="text-chrome-400 text-xs">
                No spam, just good vibes! Unsubscribe anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Instagram Section */}
      <section className="py-16 bg-y2k-50">
        <div className="container-y2k">
          <div className="text-center mb-10">
            <span className="text-3xl mb-3 block">📸</span>
            <h2 className="font-display text-y2k-800 text-2xl md:text-3xl font-bold mb-2">
              Follow Us @Y2KASE
            </h2>
            <p className="text-chrome-600">Tag us in your pics for a chance to be featured!</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <a 
                key={i} 
                href="https://www.etsy.com/shop/Y2KASEstudio"
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square overflow-hidden rounded-xl group"
              >
                <Image
                  src={`https://images.unsplash.com/photo-${
                    ['1601784551446-20c9e07cdbdb', '1592899677977-9c10ca588bbd', '1609692814858-f7cd2f0afa4f', 
                     '1556656793-08538906a9f8', '1585060544812-6b45742d762f', '1511707171634-5f897ff02aa9'][i - 1]
                  }?w=300&h=300&fit=crop`}
                  alt={`Instagram post ${i}`}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-pink-500/0 group-hover:bg-pink-500/30 transition-colors flex items-center justify-center">
                  <span className="text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity">💖</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-y2k-900">
        <div className="container-y2k">
          {/* Main Footer Content */}
          <div className="py-16">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
              
              {/* Brand Column */}
              <div>
                <Link href="/" className="inline-flex items-center gap-2 mb-6">
                  <span className="text-2xl">📱</span>
                  <span className="font-display text-white text-xl font-bold">Y2KASE</span>
                </Link>
                
                <p className="text-y2k-300 text-sm leading-relaxed mb-6">
                  Bringing Y2K vibes to your phone! Cute, trendy, and totally aesthetic cases for the main character energy you deserve. ✨
                </p>
                
                <div className="flex items-center gap-3">
                  {[
                    { name: 'Instagram', icon: '📸' },
                    { name: 'TikTok', icon: '🎵' },
                    { name: 'Pinterest', icon: '📌' },
                    { name: 'Etsy', icon: '🛍️' },
                  ].map((social) => (
                    <a
                      key={social.name}
                      href={social.name === 'Etsy' ? 'https://www.etsy.com/shop/Y2KASEstudio' : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-y2k-800 rounded-full flex items-center justify-center text-lg hover:bg-pink-500 transition-colors"
                      aria-label={social.name}
                    >
                      {social.icon}
                    </a>
                  ))}
                </div>
              </div>

              {/* Shop Column */}
              <div>
                <h5 className="text-white font-display font-semibold mb-6">
                  Shop 🛒
                </h5>
                <ul className="space-y-3">
                  {['All Cases', 'iPhone Cases', 'Samsung Cases', 'New Arrivals', 'Best Sellers', 'Sale'].map((item) => (
                    <li key={item}>
                      <Link 
                        href="/products" 
                        className="text-y2k-300 text-sm hover:text-pink-400 transition-colors"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Help Column */}
              <div>
                <h5 className="text-white font-display font-semibold mb-6">
                  Help 💬
                </h5>
                <ul className="space-y-3">
                  {['Contact Us', 'Shipping Info', 'Returns & Exchanges', 'Size Guide', 'FAQ', 'Track Order'].map((item) => (
                    <li key={item}>
                      <Link 
                        href="/contact" 
                        className="text-y2k-300 text-sm hover:text-pink-400 transition-colors"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Contact Column */}
              <div>
                <h5 className="text-white font-display font-semibold mb-6">
                  Say Hi! 👋
                </h5>
                <div className="space-y-4 text-y2k-300 text-sm">
                  <p className="flex items-center gap-2">
                    <span>📧</span>
                    <a href="mailto:hello@y2kase.com" className="hover:text-pink-400 transition-colors">
                      hello@y2kase.com
                    </a>
                  </p>
                  <p className="flex items-start gap-2">
                    <span>⏰</span>
                    <span>Mon-Fri: 9am - 5pm EST</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span>💖</span>
                    <span>We typically respond within 24 hours!</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bottom */}
          <div className="border-t border-y2k-800">
            <div className="py-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-y2k-400 text-sm">
                © {currentYear} Y2KASE. Made with 💖 
              </p>
              
              <div className="flex items-center gap-6">
                {['Privacy Policy', 'Terms of Service', 'Shipping Policy'].map((item) => (
                  <Link 
                    key={item} 
                    href="#" 
                    className="text-y2k-400 text-sm hover:text-pink-400 transition-colors"
                  >
                    {item}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
