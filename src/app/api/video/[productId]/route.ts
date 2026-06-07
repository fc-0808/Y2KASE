/**
 * /api/video/[productId] — product video proxy.
 *
 * TikTok's PULL_FROM_URL method requires the video to be hosted on a domain
 * that has been verified in the TikTok Developer Portal. Our product videos
 * live on Cloudflare R2 (pub-*.r2.dev), which we don't control at the DNS
 * level. Instead we verify y2kase.com once in the TikTok portal, and this
 * endpoint proxies the request: TikTok fetches
 *   https://y2kase.com/api/video/42
 * which streams the product's R2 video back to TikTok's servers.
 *
 * The proxy is range-request aware (TikTok may send Range headers for
 * large video files), and sets Cache-Control headers so Vercel's Edge
 * caches the response and avoids repeated R2 roundtrips.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  const { productId: rawId } = await params;
  const productId = Number(rawId);
  if (!Number.isFinite(productId)) {
    return new NextResponse("Invalid product id", { status: 400 });
  }

  if (!isDbConfigured()) {
    return new NextResponse("Database not configured", { status: 503 });
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true, videoUrl: true, status: true },
  });

  if (!product || !product.videoUrl) {
    return new NextResponse("No video for this product", { status: 404 });
  }

  // Proxy the R2 video, forwarding Range headers so TikTok's servers
  // can seek into large files without re-downloading from the start.
  const rangeHeader = req.headers.get("Range");
  const upstream = await fetch(product.videoUrl, {
    headers: rangeHeader ? { Range: rangeHeader } : {},
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Failed to fetch video from storage", {
      status: 502,
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("Content-Type") ?? "video/mp4",
  );
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("Content-Range");
  if (contentRange) headers.set("Content-Range", contentRange);
  // Cache at the edge for 1 hour — product videos rarely change.
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
