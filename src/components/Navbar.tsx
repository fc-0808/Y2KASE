'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/store';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const totalItems = useCart((state) => state.getTotalItems());
  
  // Pages where navbar should always be in "scrolled" (solid) state
  const isInnerPage = pathname !== '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const showSolidNav = scrolled || isInnerPage;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        showSolidNav 
          ? 'bg-white/90 backdrop-blur-md shadow-lg py-3' 
          : 'bg-transparent py-5'
      }`}
    >
      <div className="container-y2k">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">📱</span>
            <span className={`font-display text-xl font-bold ${showSolidNav ? 'text-gradient' : 'text-white'}`}>
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
                  showSolidNav
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
              className={`flex items-center gap-2 transition-colors relative ${
                showSolidNav
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
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
              <span className="hidden sm:inline text-sm font-semibold">Cart</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
