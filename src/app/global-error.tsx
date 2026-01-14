'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary for root layout errors.
 * This catches errors in the root layout itself.
 * Must include its own <html> and <body> tags.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log to error monitoring service
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ 
        fontFamily: 'system-ui, sans-serif',
        background: 'linear-gradient(135deg, #fef7ff 0%, #edfcff 50%, #f4ffe6 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        margin: 0,
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.9)',
          borderRadius: '20px',
          border: '2px solid rgba(255, 45, 138, 0.15)',
          padding: '2rem',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(233, 70, 240, 0.1)',
        }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>⚠️</span>
          <h2 style={{ 
            fontWeight: 'bold', 
            fontSize: '1.5rem', 
            color: '#711c70',
            marginBottom: '0.75rem',
          }}>
            Critical Error
          </h2>
          <p style={{ 
            color: '#868e96', 
            marginBottom: '1.5rem',
            lineHeight: 1.6,
          }}>
            The application encountered a critical error. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            style={{
              background: 'linear-gradient(135deg, #ff2d8a 0%, #e946f0 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '50px',
              padding: '0.875rem 1.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
