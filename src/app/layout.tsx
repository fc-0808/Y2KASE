import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { VisitorTracker } from "@/components/VisitorTracker";
import { INDEXABLE_ROBOTS } from "@/lib/seo";
import { BRAND_TITLE_TEMPLATE, PAGE_COPY } from "@/lib/seo/copy";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// These files are the same latin cuts next/font/google used to download at
// compile time. Dev gives that download 3 seconds, which is not enough from
// here, so the page was stuck on the metric fallbacks. The files live in the
// repo and the CSS variables stay the same.
const nunito = localFont({
  src: "./fonts/nunito-400.woff2",
  variable: "--font-nunito",
  weight: "400 900",
  display: "swap",
});

const baloo = localFont({
  src: "./fonts/baloo-500.woff2",
  variable: "--font-baloo",
  weight: "500 800",
  display: "swap",
});

const pixel = localFont({
  src: "./fonts/pixel-400.woff2",
  variable: "--font-pixel",
  weight: "400",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-400.woff2",
  variable: "--font-geist-mono",
  weight: "400 600",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: PAGE_COPY.home.title,
    template: BRAND_TITLE_TEMPLATE,
  },
  description: PAGE_COPY.home.description,
  openGraph: {
    type: "website",
    siteName: "Y2KASE",
    url: SITE_URL,
    locale: "en_US",
    title: PAGE_COPY.home.title,
    description: PAGE_COPY.home.socialDescription,
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
    title: PAGE_COPY.home.title,
    description: PAGE_COPY.home.socialDescription,
    images: ["/brand/og.webp"],
  },
  authors: [{ name: SITE_NAME, url: "/about" }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Shopping",
  referrer: "strict-origin-when-cross-origin",
  robots: INDEXABLE_ROBOTS,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/brand/app-icon-192.png",
        type: "image/png",
        sizes: "192x192",
      },
    ],
    apple: [
      {
        url: "/brand/app-icon-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false, email: false, address: false },
  pinterest: { richPin: true },
  // Site-ownership verification for search/social platforms. Pinterest reads
  // <meta name="p:domain_verify"> to claim y2kase.com (unlocks Rich Pins,
  // catalog ingestion and the Pinterest tag's full attribution).
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    other: {
      "p:domain_verify": "4efb02ceeb9f008aabe77ae8f6fed9d1",
      ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
        ? {
            "msvalidate.01":
              process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
          }
        : {}),
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#fdf3fb",
  colorScheme: "light",
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
      <body className="flex min-h-dvh flex-col">
        {/* Decorative only — see `.bg-ambient` in globals.css for why the brand
            gradients are a fixed layer instead of a body background. */}
        <div className="bg-ambient" aria-hidden="true" />
        {children}
        <Analytics />
        <SpeedInsights />
        <VisitorTracker />
      </body>
    </html>
  );
}
