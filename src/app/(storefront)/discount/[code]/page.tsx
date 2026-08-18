import type { Metadata } from "next";
import { DiscountRedirect } from "@/components/DiscountRedirect";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Applying discount",
  robots: PRIVATE_PAGE_ROBOTS,
};

export default async function DiscountPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { code } = await params;
  const { redirect } = await searchParams;

  return <DiscountRedirect code={code} redirect={redirect} />;
}
