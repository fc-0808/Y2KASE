import type { Metadata } from "next";
import { DiscountRedirect } from "@/components/DiscountRedirect";

export const metadata: Metadata = {
  title: "Applying discount",
  robots: { index: false, follow: false },
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
