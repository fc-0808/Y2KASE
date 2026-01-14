export default function Loading() {
  return (
    <div className="min-h-screen bg-y2k-soft flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          <span className="text-6xl block animate-bounce">📱</span>
          <span className="absolute -top-2 -right-2 text-2xl sparkle">✨</span>
        </div>
        <p className="font-display text-y2k-600 text-lg mt-4 animate-pulse">
          Loading...
        </p>
      </div>
    </div>
  );
}
