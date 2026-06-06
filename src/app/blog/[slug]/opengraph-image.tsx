import { getPost } from "@/lib/blog";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const runtime = "nodejs";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Y2KASE blog post";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    return renderOgImage({ eyebrow: "The Y2KASE Edit", title: "Blog" });
  }

  // Text-forward editorial card. We intentionally do NOT embed the /public
  // cover here: that would require Satori to self-fetch our own origin over
  // HTTP, which is slow and fragile. The branded gradient + headline reads
  // clean and generates instantly.
  return renderOgImage({
    eyebrow: "The Y2KASE Edit",
    title: post.meta.title,
    emoji: "✨",
  });
}
