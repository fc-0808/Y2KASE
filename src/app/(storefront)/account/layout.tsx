/**
 * Customer account area.
 *
 * Auth is enforced HERE, at the data layer (a Server Component) — not only in
 * proxy.ts — per the same defense-in-depth rule the admin area follows. An
 * anonymous (guest) session is treated as logged-out for account access.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountNav } from "@/app/(storefront)/account/AccountNav";
import { getSession } from "@/lib/auth";
import { isSignedInUser } from "@/lib/auth-redirect";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Account",
  robots: PRIVATE_PAGE_ROBOTS,
};

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession(await headers());
  if (!session || !isSignedInUser(session.user)) {
    redirect("/sign-in?callbackUrl=/account/orders");
  }

  const user = session.user;
  const name = user.name?.trim() ?? "";
  const email = user.email ?? "";
  const showName = name.length > 0 && name.toLowerCase() !== email.toLowerCase();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display text-2xl font-black leading-none tracking-tight sm:text-3xl">
        My Account
      </h1>

      <div className="mt-5 grid items-start gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-6">
        <aside className="card-cute sticky top-[calc(var(--storefront-header-h)+0.75rem)] overflow-hidden">
          <div className="h-1 w-full bg-holo-vivid" />
          <div className="px-3 py-4">
            <div className="px-3">
              {showName ? (
                <p className="truncate text-sm font-black leading-5">{name}</p>
              ) : null}
              <p className="mt-0.5 text-xs leading-4 text-[var(--foreground)]/60 [overflow-wrap:anywhere]">
                {email}
              </p>
            </div>
            <div className="mt-3">
              <AccountNav />
            </div>
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
