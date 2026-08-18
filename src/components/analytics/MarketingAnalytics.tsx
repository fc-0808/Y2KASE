import { ConsentMode } from "@/components/analytics/ConsentMode";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { PinterestTag } from "@/components/analytics/PinterestTag";
import { TikTokPixel } from "@/components/analytics/TikTokPixel";
import { UtmCapture } from "@/components/analytics/UtmCapture";

/** Marketing measurement shared by storefront and checkout—never admin. */
export function MarketingAnalytics() {
  return (
    <>
      <ConsentMode />
      <GoogleAnalytics />
      <MetaPixel />
      <TikTokPixel />
      <PinterestTag />
      <UtmCapture />
    </>
  );
}
