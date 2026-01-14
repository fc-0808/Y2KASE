'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to monitoring service (Sentry, LogRocket, etc.)
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-y2k-soft flex items-center justify-center p-4">
      <div className="card-y2k p-8 max-w-md w-full text-center">
        <span className="text-5xl mb-4 block">😵</span>
        <h2 className="font-display text-y2k-800 text-2xl font-bold mb-3">
          Something went wrong
        </h2>
        <p className="text-chrome-600 mb-6">
          Don&apos;t worry, it&apos;s not you — it&apos;s us. Try again or head back home.
        </p>
        {process.env.NODE_ENV === 'development' && error.message && (
          <pre className="text-left text-xs bg-y2k-100 p-3 rounded-lg mb-6 overflow-auto max-h-32 text-y2k-700">
            {error.message}
          </pre>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={reset} className="btn btn-outline">
            Try Again 🔄
          </button>
          <Link href="/" className="btn btn-primary">
            Go Home ✨
          </Link>
        </div>
      </div>
    </div>
  );
}
