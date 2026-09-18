import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutFooter } from "@/components/checkout/CheckoutFooter";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { MarketingAnalytics } from "@/components/analytics/MarketingAnalytics";
import { AuthConversionTracker } from "@/components/auth/AuthConversionTracker";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

/**
 * Minimal conversion-focused chrome for the bag and checkout result routes.
 *
 * This layout deliberately excludes the taxonomy menu, cart drawer, marketing
 * popups, and support widget while preserving the existing checkout UI.
 */
export default function CheckoutLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <CheckoutHeader />
      <main className="flex-1">{children}</main>
      <CheckoutFooter />
      <MarketingAnalytics />
      <Suspense fallback={null}>
        <AuthConversionTracker />
      </Suspense>
    </>
  );
}
