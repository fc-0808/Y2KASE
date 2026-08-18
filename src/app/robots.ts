import type { MetadataRoute } from "next";
import { IS_INDEXABLE_DEPLOYMENT, SITE_URL } from "@/lib/site";

const PRIVATE_PATHS = ["/admin", "/api/", "/checkout/", "/preview/"];

export default function robots(): MetadataRoute.Robots {
  if (!IS_INDEXABLE_DEPLOYMENT) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        // Pinterest Catalogs is intentionally public even though application
        // APIs are otherwise excluded from crawling.
        allow: ["/", "/api/feed/pinterest"],
        disallow: PRIVATE_PATHS,
      },
      // Explicit answer-engine search access documents product intent and keeps
      // these crawlers allowed if the broad policy is tightened in the future.
      {
        userAgent: ["OAI-SearchBot", "PerplexityBot"],
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
