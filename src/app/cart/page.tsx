import type { Metadata } from "next";
import { CartClient } from "./CartClient";

export const metadata: Metadata = {
  title: "Your Bag",
  description: "Review your Y2KASE bag and check out securely.",
};

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-10 sm:px-6 lg:px-8">
      <CartClient />
    </div>
  );
}
