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

/** Estimate reading minutes from raw text at ~200 wpm (min 1). */
export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Newest-first comparator by ISO date. */
export function byDateDesc(a: PostSummary, b: PostSummary): number {
  return b.meta.date.localeCompare(a.meta.date);
}
