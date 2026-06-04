import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProductForAdmin } from "@/lib/products";
import { isDbConfigured } from "@/lib/db";
import { STYLE_OPTION_NAME } from "@/lib/pricing";
import { ProductEditor } from "./ProductEditor";

export const metadata: Metadata = { title: "Admin · Edit product" };
export const dynamic = "force-dynamic";

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);

  if (!isDbConfigured() || !Number.isFinite(productId)) notFound();

  const product = await getProductForAdmin(productId);
  if (!product) notFound();

  const styleOption = product.options.find((o) => o.name === STYLE_OPTION_NAME);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/products"
        className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ChevronLeft className="h-4 w-4" /> All products
      </Link>

      <ProductEditor
        productId={product.id}
        title={product.title}
        slug={product.slug}
        status={product.status}
        isIphoneCase={product.productType === "iphone_case"}
        videoUrl={product.videoUrl}
        videoPosition={product.videoPosition}
        images={product.images.map((i) => ({
          id: i.id,
          url: i.url,
          filename: i.sourceFilename,
          styleTags: i.styleTags ?? [],
        }))}
        availableStyles={styleOption?.values ?? []}
      />
    </div>
  );
}
