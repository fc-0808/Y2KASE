import { CartDrawerLoader } from "@/components/CartDrawerLoader";
import { CartRecoveryPopLoader } from "@/components/CartRecoveryPopLoader";
import { EmailCapturePopLoader } from "@/components/EmailCapturePopLoader";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportWidgetLoader } from "@/components/support/SupportWidgetLoader";
import { MarketingAnalytics } from "@/components/analytics/MarketingAnalytics";

/**
 * Shared chrome for shopper-facing routes.
 *
 * Keeping this below the root layout means checkout and admin routes never
 * render the taxonomy-backed header or ship the cart/popup client islands.
 * Route groups do not affect public URLs.
 */
export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawerLoader />
      <EmailCapturePopLoader />
      <CartRecoveryPopLoader />
      <SupportWidgetLoader />
      <MarketingAnalytics />
    </>
  );
}
