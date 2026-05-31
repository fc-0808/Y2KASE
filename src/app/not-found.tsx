import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-4 text-center">
      <div>
        <p className="text-6xl">🎀</p>
        <h1 className="mt-4 text-3xl font-black">Page not found</h1>
        <p className="mt-2 text-[var(--foreground)]/60">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-[var(--primary)] px-6 py-3 font-bold text-white"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
