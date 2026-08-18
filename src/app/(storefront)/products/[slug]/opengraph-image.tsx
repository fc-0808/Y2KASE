import { getProductBySlug } from "@/lib/products";
import { formatPrice } from "@/lib/utils";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const runtime = "nodejs";
export const revalidate = 3600;

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Y2KASE product";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => null);

  if (!product) {
    return renderOgImage({ eyebrow: "Y2KASE", title: "Kawaii & Y2K Phone Cases" });
  }

  return renderOgImage({
    eyebrow: "Phone Cases & Accessories",
    title: product.title,
    badge: `from ${formatPrice(product.price, product.currency)}`,
    imageUrl: product.images[0]?.url ?? null,
  });
}
