/**
 * Blog content layer.
 *
 * Posts are authored as MDX in src/content/blog and registered explicitly here.
 * An explicit registry (vs. filesystem globbing) is deterministic, type-safe and
 * 100% reliable on serverless — there's no runtime fs access that could fail to
 * be traced into the function bundle. To publish a post: add the MDX file and a
 * single line below.
 */
import type { ComponentType } from "react";

import * as bestY2k from "@/content/blog/best-y2k-phone-cases-2026.mdx";
import * as styleCharms from "@/content/blog/how-to-style-phone-charms.mdx";
import * as sanrioGuide from "@/content/blog/sanrio-phone-case-guide.mdx";

export type PostMeta = {
  title: string;
  description: string;
  /** Short summary for cards + RSS. */
  excerpt: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  author: string;
  tags: string[];
  /** Cover image path (under /public) for cards + OG. */
  cover?: string;
  /** Optional manual reading-time override. */
  readingMinutes?: number;
  /** Hide from the index/sitemap while drafting. */
  draft?: boolean;
};

type PostModule = { default: ComponentType; meta: PostMeta };

export type BlogPost = {
  slug: string;
  meta: PostMeta;
  Content: ComponentType;
};

/** The post registry. Order is irrelevant — listings sort by date. */
const REGISTRY: { slug: string; mod: PostModule }[] = [
  {
    slug: "best-y2k-phone-cases-2026",
    mod: bestY2k as unknown as PostModule,
  },
  {
    slug: "how-to-style-phone-charms",
    mod: styleCharms as unknown as PostModule,
  },
  {
    slug: "sanrio-phone-case-guide",
    mod: sanrioGuide as unknown as PostModule,
  },
];

function toPost(entry: { slug: string; mod: PostModule }): BlogPost {
  return {
    slug: entry.slug,
    meta: entry.mod.meta,
    Content: entry.mod.default,
  };
}

function byDateDesc(a: BlogPost, b: BlogPost): number {
  return b.meta.date.localeCompare(a.meta.date);
}

/** All published posts, newest first. */
export function getAllPosts(): BlogPost[] {
  return REGISTRY.map(toPost)
    .filter((p) => !p.meta.draft)
    .sort(byDateDesc);
}

/** A single published post by slug, or null. */
export function getPost(slug: string): BlogPost | null {
  const entry = REGISTRY.find((e) => e.slug === slug);
  if (!entry) return null;
  const post = toPost(entry);
  return post.meta.draft ? null : post;
}

/** Slugs of all published posts (for generateStaticParams + sitemap). */
export function getAllPostSlugs(): string[] {
  return getAllPosts().map((p) => p.slug);
}

/** Up to `limit` published posts excluding `slug` (for "related reading"). */
export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  return getAllPosts()
    .filter((p) => p.slug !== slug)
    .slice(0, limit);
}

/** Reading-time estimate in minutes (manual override or a sensible default). */
export function readingMinutes(meta: PostMeta): number {
  return meta.readingMinutes ?? 3;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** Human-friendly post date. */
export function formatPostDate(iso: string): string {
  return DATE_FMT.format(new Date(`${iso}T00:00:00`));
}
