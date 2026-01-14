'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProductsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Products page error:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-y2k-soft">
      <Navbar />
      
      <div className="pt-32 pb-20 flex items-center justify-center p-4">
        <div className="card-y2k p-8 max-w-md w-full text-center">
          <span className="text-5xl mb-4 block">📱💔</span>
          <h2 className="font-display text-y2k-800 text-2xl font-bold mb-3">
            Couldn&apos;t load products
          </h2>
          <p className="text-chrome-600 mb-6">
            We had trouble fetching our cute cases. Let&apos;s try that again!
          </p>
          {process.env.NODE_ENV === 'development' && error.message && (
            <pre className="text-left text-xs bg-y2k-100 p-3 rounded-lg mb-6 overflow-auto max-h-32 text-y2k-700">
              {error.message}
            </pre>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={reset} className="btn btn-primary">
              Try Again ✨
            </button>
            <Link href="/" className="btn btn-outline">
              Go Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
