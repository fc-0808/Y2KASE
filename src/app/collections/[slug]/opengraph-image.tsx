import { getCollectionBySlug } from "@/lib/collections";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const runtime = "nodejs";
export const revalidate = 3600;

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Y2KASE collection";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug).catch(() => null);

  if (!collection) {
    return renderOgImage({ eyebrow: "Collection", title: "Shop Y2KASE" });
  }

  return renderOgImage({
    eyebrow: "Collection",
    title: collection.name,
    imageUrl: collection.imageUrl,
    emoji: collection.icon ?? "🎀",
  });
}
