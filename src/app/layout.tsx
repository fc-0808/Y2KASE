import type { Metadata } from "next";
import { Nunito, Baloo_2, Press_Start_2P, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { CartDrawer } from "@/components/CartDrawer";
import { EmailCapturePopLoader } from "@/components/EmailCapturePopLoader";
import { VisitorTracker } from "@/components/VisitorTracker";

// Body — rounded, friendly, highly legible.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

// Headings — chunky rounded display for kawaii character.
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Wordmark + pixel accents — the Y2K arcade face.
const pixel = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

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
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <Footer />
        <CartDrawer />
        <EmailCapturePopLoader />
        <Analytics />
        <VisitorTracker />
      </body>
    </html>
  );
}
