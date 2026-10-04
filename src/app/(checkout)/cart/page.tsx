import type { Metadata } from "next";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";
import { CartClient } from "./CartClient";

export const metadata: Metadata = {
  title: "Your Bag",
  description: "Review your Y2KASE bag and check out securely.",
  robots: PRIVATE_PAGE_ROBOTS,
};

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:py-14">
      <CartClient />
    </div>
  );
}
