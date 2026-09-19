/**
 * GET /blog/rss.xml — RSS 2.0 feed for the blog.
 *
 * Lets readers subscribe in feed readers and lets aggregators / syndication
 * tools (and Google) discover new posts quickly — a low-cost distribution
 * channel that compounds the blog's reach.
 */
import { listPublishedPosts } from "@/lib/blog";
import { absoluteUrl, BRAND } from "@/lib/seo";

export const dynamic = "force-dynamic";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  let posts: Awaited<ReturnType<typeof listPublishedPosts>>;
  try {
    posts = await listPublishedPosts();
  } catch (error) {
    console.error("[blog-rss] published-post query failed:", error);
    return new Response("Blog feed temporarily unavailable.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const items = posts
    .map(
      (p) => `    <item>
      <title>${xmlEscape(p.meta.title)}</title>
      <link>${absoluteUrl(`/blog/${p.slug}`)}</link>
      <guid isPermaLink="true">${absoluteUrl(`/blog/${p.slug}`)}</guid>
      <description>${xmlEscape(p.meta.excerpt)}</description>
      <pubDate>${new Date(`${p.meta.date}T00:00:00Z`).toUTCString()}</pubDate>
    </item>`,
    )
    .join("\n");

  const lastBuild = posts[0]
    ? new Date(`${posts[0].meta.date}T00:00:00Z`).toUTCString()
    : "Thu, 01 Jan 1970 00:00:00 GMT";

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>The Y2KASE Edit</title>
    <link>${absoluteUrl("/blog")}</link>
    <description>${xmlEscape(BRAND.description)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}
