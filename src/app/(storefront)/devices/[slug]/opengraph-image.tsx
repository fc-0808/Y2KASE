import { findDevice } from "@/lib/catalog/devices";
import { deviceSeo } from "@/lib/seo/device-content";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const runtime = "nodejs";
export const revalidate = 3600;

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Y2KASE device cases";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const device = findDevice(slug);

  if (!device) {
    return renderOgImage({ eyebrow: "Y2KASE", title: "Kawaii & Y2K Phone Cases" });
  }

  const seo = deviceSeo(slug, device.label);
  return renderOgImage({
    eyebrow: "Shop by device",
    title: seo.heading,
    emoji: device.icon,
  });
}
