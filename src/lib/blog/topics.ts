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
import { slugExists, topicTitleExists } from "./store";

/** "an Anime case", "a Y2K case". */
function indefinite(name: string): "a" | "an" {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

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
    build: (n) => `How to Style ${indefinite(n)} ${n} Phone Case`,
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

/**
 * Informational cluster topics that support the commercial landing pages
 * without targeting the same query. Checked for existing slugs like the
 * collection templates, so they enqueue once.
 *
 * Higher `priority` is claimed first. The search backlog sits above the
 * generic template wave so a catch-up run publishes gift and character
 * queries before another near-duplicate buyer's guide.
 */
const EVERGREEN_TOPICS: {
  title: string;
  angle: string;
  collectionSlug: string | null;
  priority: number;
}[] = [
  {
    title: "The Best Kuromi Phone Cases & Accessories (2026 Guide)",
    angle:
      "A Kuromi buyer's guide: the purple-and-black look, which case and charm to pair, and how it differs from a general Sanrio roundup. Do not recap the Sanrio or Hello Kitty guides.",
    collectionSlug: "kuromi",
    priority: 49,
  },
  {
    title: "The Best Chiikawa Phone Cases & Accessories (2026 Guide)",
    angle:
      "A Chiikawa buyer's guide for the small-character aesthetic. Distinct from the generic kawaii and Sanrio roundups.",
    collectionSlug: "chiikawa",
    priority: 48,
  },
  {
    title: "The Best Snoopy Phone Cases & Accessories (2026 Guide)",
    angle:
      "A Snoopy and Peanuts buyer's guide. Distinct from the cartoon and characters roundups.",
    collectionSlug: "snoopy",
    priority: 47,
  },
  {
    title: "How to Style a Hello Kitty Phone Case",
    angle:
      "A styling how-to: pairing a Hello Kitty case with grips, charms and straps. Not a ranked best-of list, and not a rewrite of the Hello Kitty buyer's guide.",
    collectionSlug: "hello-kitty",
    priority: 46,
  },
  {
    title: "Holiday Phone Case Gift Guide 2026",
    angle:
      "A late-2026 holiday gift guide. Group picks by who they are for (Hello Kitty, Kuromi, Cinnamoroll, My Melody) and name a specific case for each. Do not rewrite the Sanrio buyer's guide as a ranked top-10.",
    collectionSlug: "sanrio",
    priority: 45,
  },
  {
    title: "The Best Pompompurin Phone Cases & Accessories (2026 Guide)",
    angle:
      "A Pompompurin buyer's guide: the pudding-yellow look and which case and charm to start with. Distinct from the Sanrio roundup.",
    collectionSlug: "pompompurin",
    priority: 44,
  },
  {
    title: "How to Style a Y2K Phone Case",
    angle:
      "A styling how-to for a Y2K case: charms, grips and straps that complete the look. Not a rewrite of the Y2K buyer's guide.",
    collectionSlug: "y2k",
    priority: 43,
  },
  {
    title: "MagSafe Phone Cases: What Compatibility Actually Means",
    angle:
      "Explain MagSafe magnets, charging and wallets in plain language, then point readers to MagSafe-ready cases. Informational — do not compete with the MagSafe shop page.",
    collectionSlug: "magsafe",
    priority: 15,
  },
  {
    title: "Cute iPhone Case Ideas for 2026",
    angle:
      "A trend roundup of kawaii, Y2K and character iPhone cases. Informational — do not compete with the iPhone Cases shop page.",
    collectionSlug: null,
    priority: 15,
  },
  {
    title: "How to Style a Phone Charm With Your Case",
    angle:
      "A practical how-to for attaching and pairing charms and grips without cluttering the look.",
    collectionSlug: null,
    priority: 15,
  },
];

/** Skip one-product doorway pages. Three live products is enough to illustrate. */
const MIN_COLLECTION_PRODUCTS = 3;

/**
 * Same catalog listed twice (parent count equals child count). Keep the name
 * shoppers actually search.
 */
const PREFER_CHILD_ALIAS = new Set(["snoopy", "shin-chan"]);

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

/**
 * Collections worth a post: enough products to illustrate, and not an alias of
 * a parent that already lists the same catalog.
 */
function topicCollections(nodes: CollectionNode[]): CollectionNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const skip = new Set<string>();
  for (const node of nodes) {
    if (node.parentId == null) continue;
    const parent = byId.get(node.parentId);
    if (!parent || node.totalCount !== parent.totalCount) continue;
    skip.add(PREFER_CHILD_ALIAS.has(node.slug) ? parent.slug : node.slug);
  }
  return nodes.filter(
    (node) => node.totalCount >= MIN_COLLECTION_PRODUCTS && !skip.has(node.slug),
  );
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
  const nodes = topicCollections(flatten(tree)).sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) || b.totalCount - a.totalCount,
  );

  const planned: PlannedTopic[] = [];
  const usedTitles = new Set<string>();

  for (const topic of EVERGREEN_TOPICS) {
    if (planned.length >= limit) break;
    const slug = slugify(topic.title);
    if (!slug || usedTitles.has(topic.title)) continue;
    if ((await slugExists(slug)) || (await topicTitleExists(topic.title))) continue;
    usedTitles.add(topic.title);
    planned.push({
      title: topic.title,
      angle: topic.angle,
      collectionSlug: topic.collectionSlug,
      priority: topic.priority,
    });
  }

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
      // Skip anything already published or already queued under this headline.
      // The stored post slug often drops words the model rewrote, so the
      // topic title is the reliable duplicate check.
      if ((await slugExists(slug)) || (await topicTitleExists(title))) continue;

      usedTitles.add(title);
      planned.push({
        title,
        angle: template.angle,
        collectionSlug: node.slug,
        // Uncovered buyer's guides outrank styling how-tos. A first guide for
        // Shin-chan is a new query; a second article on Kawaii is not.
        priority:
          (tpl === 0 ? 30 : 0) +
          (node.featured ? 10 : 0) +
          Math.min(node.totalCount, 9),
      });
    }
  }

  return planned;
}
