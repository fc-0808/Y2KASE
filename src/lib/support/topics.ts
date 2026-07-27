/**
 * Help widget content — the questions that would otherwise become tickets.
 *
 * Every support tool worth using answers before it escalates: the shopper gets
 * their answer in a second instead of waiting for a reply, and we don't spend
 * an inbox round-trip on "when does it arrive". These five cover the bulk of
 * what /contact and the inbox actually receive.
 *
 * Answers are intentionally shorter and more actionable than the FAQ page —
 * but the FACTS must stay identical to `src/app/faq/page.tsx` and
 * `src/lib/legal.ts`. Change a shipping window or return period in one place
 * and change it in all three.
 */

import type { ComponentType } from "react";
import { Package, RotateCcw, Smartphone, Tag, Truck } from "lucide-react";
import { BUNDLE, WELCOME_COUPON } from "@/lib/promotions";
import { ROUTES } from "@/lib/routes";

export type SupportTopic = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  question: string;
  answer: string;
  /** Where to go for the full story. Internal routes only. */
  link?: { label: string; href: string };
};

export const SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: "tracking",
    icon: Package,
    question: "Where's my order?",
    answer:
      "Orders leave us within 1–3 business days and every parcel gets a tracking number by email the moment it ships. Your live status and tracking link are always in your account.",
    link: { label: "Track my order", href: "/account/orders" },
  },
  {
    id: "shipping",
    icon: Truck,
    question: "How long does shipping take?",
    answer:
      "7–14 business days worldwide, 1–3 days within Hong Kong, with express options at checkout. Standard shipping is free once your bag passes the threshold shown in your cart.",
    link: { label: "Shipping policy", href: "/policies/shipping-policy" },
  },
  {
    id: "returns",
    icon: RotateCcw,
    question: "Can I return or exchange it?",
    answer:
      "Yes — 30 days from delivery for unused items in their original packaging. If something arrives damaged, send us photos within 7 days and we'll replace it at no cost.",
    link: { label: "Refund policy", href: "/policies/refund-policy" },
  },
  {
    id: "fit",
    icon: Smartphone,
    question: "Will it fit my phone?",
    answer:
      "Pick your exact model on the product page — we cover iPhone 13 through 17, including Pro and Pro Max. Anything labelled MagSafe has magnets aligned to Apple's standard.",
    link: { label: "Browse all cases", href: "/products" },
  },
  {
    id: "discounts",
    icon: Tag,
    question: "Are there any discount codes?",
    // Derived from the promotions engine so the widget can never quote a
    // discount that checkout won't actually apply.
    answer: `New besties get ${WELCOME_COUPON.percentOff}% off with ${WELCOME_COUPON.code}, and ${BUNDLE.label} applies automatically to any ${BUNDLE.groupSize} items. Paste your code in the bag before you check out — note the two can't be stacked.`,
    link: {
      label: `Claim ${WELCOME_COUPON.percentOff}% off`,
      href: ROUTES.welcomeGift,
    },
  },
];
