import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your Cart | Y2KASE',
  description: 'Review your cart and checkout. Free shipping on orders over $35!',
};

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
