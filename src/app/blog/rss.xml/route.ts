/**
 * GET /blog/rss.xml — RSS 2.0 feed for the blog.
 *
 * Lets readers subscribe in feed readers and lets aggregators / syndication
 * tools (and Google) discover new posts quickly — a low-cost distribution
 * channel that compounds the blog's reach.
 */
import { getAllPosts } from "@/lib/blog";
import { absoluteUrl, BRAND } from "@/lib/seo";

export const revalidate = 3600;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = getAllPosts();

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
    : new Date().toUTCString();

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
    },
  });
}
