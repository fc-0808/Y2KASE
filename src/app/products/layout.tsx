import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shop Phone Cases | Y2KASE',
  description: 'Browse our collection of cute, trendy Y2K aesthetic phone cases. Find your perfect match for iPhone and Samsung devices.',
  openGraph: {
    title: 'Shop Phone Cases | Y2KASE',
    description: 'Browse our collection of cute, trendy Y2K aesthetic phone cases.',
    type: 'website',
  },
};

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
