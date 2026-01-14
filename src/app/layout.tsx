import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import '@/styles/globals.css';

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Y2KASE | Aesthetic Phone Cases',
  description: 'Shop trendy Y2K aesthetic phone cases! Cute, retro, and nostalgic designs for iPhone & Samsung. Express your 2000s style with our unique collection.',
  keywords: ['Y2K', 'phone cases', 'aesthetic', 'iPhone case', 'Samsung case', 'cute phone case', 'retro', '2000s', 'trendy', 'kawaii'],
  authors: [{ name: 'Y2KASE' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://y2kase.com',
    siteName: 'Y2KASE',
    title: 'Y2KASE | Aesthetic Phone Cases',
    description: 'Shop trendy Y2K aesthetic phone cases! Cute, retro, and nostalgic designs for iPhone & Samsung.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=1200&h=630&fit=crop',
        width: 1200,
        height: 630,
        alt: 'Y2KASE Phone Cases Collection',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Y2KASE | Aesthetic Phone Cases',
    description: 'Shop trendy Y2K aesthetic phone cases! Cute, retro, and nostalgic designs.',
    images: ['https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=1200&h=630&fit=crop'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`scroll-smooth ${fredoka.variable} ${nunito.variable}`}>
      <head>
        <meta name="theme-color" content="#ff2d8a" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
