/**
 * Topic planner — keeps the content backlog full, grounded in the live catalog.
 *
 * Rather than inventing generic subjects, the planner builds candidate
 * headlines from real, in-stock collections (Sanrio, Hello Kitty, …) so every
 * generated article can link to pages that actually exist — the internal-linking
 * pattern that turns blog traffic into product discovery and sales.
 */
import { slugify } from "@/lib/ai";
import { getCollectionTree, type CollectionNode } from "@/lib/collections";
import { slugExists } from "./store";

/** Evergreen, search-intent title templates keyed to a collection name. */
const COLLECTION_TEMPLATES: {
  build: (name: string) => string;
  angle: string;
}[] = [
  {
    build: (n) => `The Best ${n} Phone Cases & Accessories (2026 Guide)`,
    angle:
      "A buyer's guide: top picks, what to look for, and how to build the look with cases, grips and charms.",
  },
  {
    build: (n) => `How to Style a ${n} Phone Case`,
    angle:
      "A styling how-to: pairing the case with grips, charms and straps for a cohesive aesthetic.",
  },
  {
    build: (n) => `${n} Aesthetic: Phone Case & Charm Ideas`,
    angle:
      "A trend/aesthetic feature exploring the vibe and concrete ways to recreate it.",
  },
  {
    build: (n) => `${n} Gift Guide: Phone Cases They'll Actually Love`,
    angle:
      "A gift guide framed around occasions (birthday, holidays) with clear picks.",
  },
];

/** Flatten the active collection tree to a de-duplicated node list. */
function flatten(nodes: CollectionNode[]): CollectionNode[] {
  const out: CollectionNode[] = [];
  const seen = new Set<number>();
  const walk = (list: CollectionNode[]) => {
    for (const n of list) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        out.push(n);
      }
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export type PlannedTopic = {
  title: string;
  angle: string;
  collectionSlug: string | null;
  priority: number;
};

/**
 * Produce up to `limit` fresh topic ideas whose slugs don't already exist as a
 * post. Featured collections with more products rank first, so the blog covers
 * the highest-value catalog areas soonest.
 */
export async function planTopics(limit: number): Promise<PlannedTopic[]> {
  if (limit <= 0) return [];

  const tree = await getCollectionTree();
  const nodes = flatten(tree)
    // Only build topics around collections that actually have products.
    .filter((n) => n.totalCount > 0)
    // Highest-value first: featured, then most products.
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) || b.totalCount - a.totalCount,
    );

  const planned: PlannedTopic[] = [];
  const usedTitles = new Set<string>();

  // Interleave templates across collections so early picks stay varied
  // (guide about Sanrio, styling about Hello Kitty, …) rather than four
  // near-identical posts about the same collection back-to-back.
  outer: for (
    let tpl = 0;
    tpl < COLLECTION_TEMPLATES.length && planned.length < limit;
    tpl++
  ) {
    const template = COLLECTION_TEMPLATES[tpl];
    for (const node of nodes) {
      if (planned.length >= limit) break outer;
      const title = template.build(node.name);
      if (usedTitles.has(title)) continue;
      const slug = slugify(title);
      if (!slug) continue;
      // Skip anything we've already published/queued under this slug.
      if (await slugExists(slug)) continue;

      usedTitles.add(title);
      planned.push({
        title,
        angle: template.angle,
        collectionSlug: node.slug,
        priority: (node.featured ? 10 : 0) + Math.min(node.totalCount, 9),
      });
    }
  }

  return planned;
}
