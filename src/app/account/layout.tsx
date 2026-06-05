/**
 * Customer account area.
 *
 * Auth is enforced HERE, at the data layer (a Server Component) — not only in
 * proxy.ts — per the same defense-in-depth rule the admin area follows. An
 * anonymous (guest) session is treated as logged-out for account access.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Package, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession(await headers());
  if (!session?.user || session.user.isAnonymous) {
    redirect("/sign-in?callbackUrl=/account/orders");
  }

  const user = session.user;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-black sm:text-3xl">
          My Account
        </h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          Signed in as{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {user.email}
          </span>
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[200px_1fr]">
        {/* Sidebar nav */}
        <nav className="flex gap-2 md:flex-col">
          <Link
            href="/account/orders"
            className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
          >
            <Package className="h-4 w-4" />
            My Orders
          </Link>
          <Link
            href="/products"
            className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
          >
            <Sparkles className="h-4 w-4" />
            Keep Shopping
          </Link>
        </nav>

        <section>{children}</section>
      </div>
    </div>
  );
}
