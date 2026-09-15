import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { CartDrawerLoader } from "@/components/CartDrawerLoader";

/**
 * Admin-authenticated storefront chrome for unpublished product previews.
 *
 * Lives in its own route group so it does not inherit the console sidebar —
 * the point is to inspect the shopper PDP. Auth is still enforced here (and
 * by `proxy.ts`). Drafts never render on the ISR-cached `/products/[slug]`
 * route, which would leak unpublished HTML into the public cache.
 */
export default async function AdminProductPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin(await headers());
  if (!session) {
    redirect("/admin/sign-in");
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawerLoader />
    </>
  );
}
