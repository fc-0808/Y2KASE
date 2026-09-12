/**
 * Static MDX blog content layer.
 *
 * The flagship, hand-authored posts are MDX in src/content/blog and registered
 * explicitly here. An explicit registry (vs. filesystem globbing) is
 * deterministic, type-safe and 100% reliable on serverless — there's no runtime
 * fs access that could fail to be traced into the function bundle. To publish an
 * editorial post: add the MDX file and a single line below.
 *
 * AI-generated posts live in the database instead — see `@/lib/blog/store`. The
 * unified public API in `@/lib/blog` merges both sources.
 */
import type { ComponentType } from "react";

import * as bestY2k from "@/content/blog/best-y2k-phone-cases-2026.mdx";
import * as styleCharms from "@/content/blog/how-to-style-phone-charms.mdx";
import * as magsafeVerify from "@/content/blog/how-we-verify-magsafe.mdx";
import * as sanrioGuide from "@/content/blog/sanrio-phone-case-guide.mdx";

import type { PostMeta, PostSummary, RenderablePost } from "./types";
import { byDateDesc } from "./types";

type PostModule = { default: ComponentType; meta: PostMeta };

/** The MDX post registry. Order is irrelevant — listings sort by date. */
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
    slug: "how-we-verify-magsafe",
    mod: magsafeVerify as unknown as PostModule,
  },
  {
    slug: "sanrio-phone-case-guide",
    mod: sanrioGuide as unknown as PostModule,
  },
];

function toSummary(entry: { slug: string; mod: PostModule }): PostSummary {
  return { slug: entry.slug, source: "mdx", meta: entry.mod.meta };
}

/** All published MDX posts, newest first. */
export function getMdxSummaries(): PostSummary[] {
  return REGISTRY.map(toSummary)
    .filter((p) => !p.meta.draft)
    .sort(byDateDesc);
}

/** The set of slugs owned by MDX posts (used to dedupe against DB posts). */
export function getMdxSlugs(): Set<string> {
  return new Set(REGISTRY.map((e) => e.slug));
}

/** A single published MDX post by slug (renderable), or null. */
export function getMdxPost(slug: string): RenderablePost | null {
  const entry = REGISTRY.find((e) => e.slug === slug);
  if (!entry) return null;
  const meta = entry.mod.meta;
  if (meta.draft) return null;
  return { slug, source: "mdx", meta, Content: entry.mod.default };
}
