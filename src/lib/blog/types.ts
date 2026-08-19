import type { ComponentType } from "react";

/**
 * Shared blog types.
 *
 * The blog renders two content sources through one interface: hand-authored
 * MDX files (compiled at build time) and database-backed posts written by the
 * AI content engine. `PostMeta` is the common metadata shape; the renderable
 * post carries either an MDX `Content` component or a Markdown `body` string.
 */

export type PostMeta = {
  title: string;
  description: string;
  /** Short summary for cards + RSS. */
  excerpt: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** ISO modification timestamp when content changed after publication. */
  modified?: string;
  author: string;
  tags: string[];
  /** Cover image path/URL for cards + OG. */
  cover?: string;
  /** Optional manual reading-time override. */
  readingMinutes?: number;
  /** Hide from the index/sitemap while drafting. */
  draft?: boolean;
};

/** Where a post's content lives — a compiled MDX module or a DB row. */
export type PostSource = "mdx" | "db";

/** Lightweight shape used by listings, RSS, sitemap and related-reading. */
export type PostSummary = {
  slug: string;
  source: PostSource;
  meta: PostMeta;
};

/** Optional visible FAQ mirrored into FAQPage machine-readable context. */
export type PostFaq = { question: string; answer: string };

/**
 * An image rendered inside the article body.
 *
 * Figures are real catalog photography, not generated art: they are resolved
 * from the products the article already links to (see `./media.ts`), so the
 * case a reader sees next to a recommendation is the exact one they can buy.
 * Keeping them structured — rather than inlining Markdown image syntax into the
 * body — means the renderer never has to trust model output for a URL, and each
 * figure can carry its own product link for the caption.
 */
export type PostFigure = {
  /** Catalog CDN or generated-asset URL. Absolute https, or a /public path. */
  url: string;
  alt: string;
  /** Shown under the image; usually the product name. */
  caption?: string;
  /** Internal route the figure links to — normally the product page. */
  href?: string;
  /**
   * Zero-based index of the section this figure belongs to, counting `##` and
   * `###` headings alike; -1 places it in the intro, above the first heading.
   * The renderer clamps out-of-range values, so a figure is never silently
   * dropped when a post is edited.
   */
  section: number;
};

/**
 * A fully renderable post. MDX posts provide a `Content` component; DB posts
 * provide a Markdown `body` (and optionally an `faq`). Exactly one content
 * channel is populated per source.
 */
export type RenderablePost = {
  slug: string;
  source: PostSource;
  meta: PostMeta;
  /** Set for source==="mdx". */
  Content?: ComponentType;
  /** Set for source==="db". */
  body?: string;
  /** Optional FAQ block (DB posts). */
  faq?: PostFaq[];
  /** In-body catalog photography (DB posts), interleaved by the renderer. */
  images?: PostFigure[];
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** Human-friendly post date from an ISO `YYYY-MM-DD` string. */
export function formatPostDate(iso: string): string {
  return DATE_FMT.format(new Date(`${iso}T00:00:00`));
}

/** Reading-time estimate in minutes (manual override or a sensible default). */
export function readingMinutes(meta: PostMeta): number {
  return meta.readingMinutes ?? 3;
}

/**
 * Validate a stored `images` payload back into figures.
 *
 * The column is nullable (rows predate it) and jsonb is schemaless, so a
 * hand-edited or partially-written row could hold anything. `next/image` throws
 * on a malformed `src` — which would take the whole post down — so entries are
 * checked field by field and bad ones are dropped rather than rendered.
 */
export function coerceFigures(raw: unknown): PostFigure[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): PostFigure[] => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    // Anything else is unroutable by the image optimizer.
    if (!url.startsWith("/") && !url.startsWith("https://")) return [];
    const alt = typeof o.alt === "string" ? o.alt.trim() : "";
    const caption = typeof o.caption === "string" ? o.caption.trim() : "";
    const href = typeof o.href === "string" ? o.href.trim() : "";
    return [
      {
        url,
        alt,
        ...(caption ? { caption } : {}),
        ...(href.startsWith("/") ? { href } : {}),
        section: Number.isFinite(o.section) ? Math.trunc(o.section as number) : -1,
      },
    ];
  });
}

/** Estimate reading minutes from raw text at ~200 wpm (min 1). */
export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Newest-first comparator by ISO date. */
export function byDateDesc(a: PostSummary, b: PostSummary): number {
  return b.meta.date.localeCompare(a.meta.date);
}
