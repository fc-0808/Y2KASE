import type { Metadata } from "next";
import { Nunito, Baloo_2, Press_Start_2P, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { CartDrawer } from "@/components/CartDrawer";
import { EmailCapturePopLoader } from "@/components/EmailCapturePopLoader";
import { VisitorTracker } from "@/components/VisitorTracker";
import { JsonLd } from "@/components/JsonLd";
import { ConsentMode } from "@/components/analytics/ConsentMode";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { TikTokPixel } from "@/components/analytics/TikTokPixel";
import { PinterestTag } from "@/components/analytics/PinterestTag";
import { UtmCapture } from "@/components/analytics/UtmCapture";
import { CookieConsent } from "@/components/analytics/CookieConsent";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";

// Body — rounded, friendly, highly legible. `swap` keeps text paintable while
// the webfont loads (no invisible-text flash blocking FCP/LCP).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

// Headings — chunky rounded display for kawaii character.
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

// Wordmark + pixel accents — the Y2K arcade face.
const pixel = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Monospace — only used inside the admin console (order IDs, IPs, env keys),
// never on a storefront page. Keep it available via the CSS variable but do NOT
// preload it, so shoppers don't pay for a font file they'll never render.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// Product imagery is served cross-origin from the Cloudflare R2 CDN. Opening
// that connection (DNS + TCP + TLS) early — before the HTML parser discovers
// the first <img> — shaves a full round-trip off the largest contentful paint.
const IMAGE_CDN_ORIGIN = (() => {
  try {
    const base = process.env.R2_PUBLIC_URL;
    return base ? new URL(base).origin : null;
  } catch {
    return null;
  }
})();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Y2KASE — Kawaii & Y2K Phone Cases ✨",
    template: "%s · Y2KASE",
  },
  description:
    "Welcome to the Y2KASE Club, bestie! Kawaii, Y2K & holographic phone cases, charms and accessories. Free shipping over $35. Express your vibe. ✨",
  openGraph: {
    type: "website",
    siteName: "Y2KASE",
    url: SITE_URL,
    title: "Y2KASE — Kawaii & Y2K Phone Cases ✨",
    description:
      "Kawaii, Y2K & holographic phone cases, charms and accessories. Express your vibe. ✨",
    images: [
      {
        url: "/brand/og.webp",
        width: 1200,
        height: 630,
        alt: "Y2KASE — Kawaii & Y2K Phone Cases",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Y2KASE — Kawaii & Y2K Phone Cases ✨",
    description:
      "Kawaii, Y2K & holographic phone cases, charms and accessories. Express your vibe. ✨",
    images: ["/brand/og.webp"],
  },
  // Site-ownership verification for search/social platforms. Pinterest reads
  // <meta name="p:domain_verify"> to claim y2kase.com (unlocks Rich Pins,
  // catalog ingestion and the Pinterest tag's full attribution).
  verification: {
    other: {
      "p:domain_verify": "4efb02ceeb9f008aabe77ae8f6fed9d1",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${nunito.variable} ${baloo.variable} ${pixel.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {IMAGE_CDN_ORIGIN && (
          <>
            <link rel="preconnect" href={IMAGE_CDN_ORIGIN} crossOrigin="" />
            <link rel="dns-prefetch" href={IMAGE_CDN_ORIGIN} />
          </>
        )}
      </head>
      <body className="flex min-h-dvh flex-col">
        <ConsentMode />
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <Footer />
        <CartDrawer />
        <EmailCapturePopLoader />
        <Analytics />
        <VisitorTracker />
        <GoogleAnalytics />
        <MetaPixel />
        <TikTokPixel />
        <PinterestTag />
        <UtmCapture />
        <CookieConsent />
      </body>
    </html>
  );
}
