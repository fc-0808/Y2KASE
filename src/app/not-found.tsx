import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-y2k-soft flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <span className="text-8xl mb-6 block">🔍</span>
        <h1 className="font-display text-y2k-800 text-4xl md:text-5xl font-bold mb-4">
          404
        </h1>
        <h2 className="font-display text-y2k-600 text-xl md:text-2xl font-semibold mb-4">
          Page Not Found
        </h2>
        <p className="text-chrome-600 mb-8">
          Oops! This page seems to have vanished into the Y2K void. 
          Let&apos;s get you back to somewhere cute! 💖
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/" className="btn btn-primary">
            Go Home ✨
          </Link>
          <Link href="/products" className="btn btn-secondary">
            Shop Cases 📱
          </Link>
        </div>
      </div>
    </main>
  );
}
