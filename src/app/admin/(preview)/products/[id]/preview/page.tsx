import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, EyeOff, Pencil } from "lucide-react";
import { getProductForAdmin } from "@/lib/products";
import { isDbConfigured } from "@/lib/db";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";
import {
  adminProductEditorHref,
  isLiveProductStatus,
  liveProductPageHref,
} from "@/lib/catalog/product-page";
import {
  loadProductPageCompanionData,
  ProductPageView,
} from "@/components/product/ProductPageView";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const productId = Number((await params).id);
  if (!isDbConfigured() || !Number.isFinite(productId)) {
    return { title: "Admin · Product preview", robots: PRIVATE_PAGE_ROBOTS };
  }
  const product = await getProductForAdmin(productId);
  if (!product) {
    return { title: "Admin · Product preview", robots: PRIVATE_PAGE_ROBOTS };
  }
  return {
    title: `Preview · ${product.title}`,
    robots: PRIVATE_PAGE_ROBOTS,
  };
}

export default async function UnpublishedProductPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const productId = Number((await params).id);
  if (!isDbConfigured() || !Number.isFinite(productId)) notFound();

  const product = await getProductForAdmin(productId);
  if (!product) notFound();

  // Published listings have a canonical public URL. Don't keep a second
  // preview copy around that could drift from the live PDP.
  if (isLiveProductStatus(product.status)) {
    redirect(liveProductPageHref(product.slug));
  }

  const { relatedProducts, reviewSummary, reviews, collectionLinks } =
    await loadProductPageCompanionData(product);

  return (
    <>
      <UnpublishedPreviewBanner
        productId={product.id}
        status={product.status}
        title={product.title}
      />
      <ProductPageView
        product={product}
        reviewSummary={reviewSummary}
        reviews={reviews}
        collectionLinks={collectionLinks}
        relatedProducts={relatedProducts}
        surface="preview"
      />
    </>
  );
}

function UnpublishedPreviewBanner({
  productId,
  status,
  title,
}: {
  productId: number;
  status: string;
  title: string;
}) {
  const isDraft = status === "draft";
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-w-0 items-start gap-2 text-sm font-semibold text-amber-950">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="uppercase tracking-wide">
              {isDraft ? "Draft" : status} preview
            </span>
            <span className="mt-0.5 block font-medium text-amber-900/80">
              Customers cannot see {title}. Checkout will refuse this listing
              until you publish it.
            </span>
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/products/thumbnails"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:border-amber-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Thumbnail review
          </Link>
          <Link
            href={adminProductEditorHref(productId)}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-900"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit listing
          </Link>
        </div>
      </div>
    </div>
  );
}
