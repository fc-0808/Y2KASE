/**
 * Collections taxonomy — the canonical browse tree (characters / brands /
 * genres) seeded into the `collections` table.
 *
 * This is config-as-code on purpose: the *shape* of the taxonomy (names,
 * hierarchy, menu placement, art) is stable and benefits from review + version
 * control, while *membership* (which product is in which collection) is live
 * data in `product_collections`. `scripts/seed-collections.ts` upserts this tree
 * idempotently, and the `match` keywords drive automatic assignment at ingest
 * and in `scripts/backfill-collections.ts`.
 *
 * To add a character/brand/genre: add a node here and re-run `npm run
 * seed:collections`. Nothing else needs to change.
 */

export type CollectionKind = "brand" | "character" | "genre" | "feature";

export type CollectionSeed = {
  /** Stable URL slug — also the upsert key. Never change once shipped. */
  slug: string;
  name: string;
  kind: CollectionKind;
  description?: string;
  /** Emoji icon shown when no `imageUrl` art is set. */
  icon?: string;
  /** Hex accent used on the collection landing page. */
  accentColor?: string;
  /** Surface in the primary mega-menu rails. */
  featured?: boolean;
  /**
   * Lowercase keywords used to auto-assign a product to this collection from
   * its tags / title / source folder. Keep them specific to avoid false hits.
   */
  match?: string[];
  children?: CollectionSeed[];
};

export const COLLECTION_TAXONOMY: CollectionSeed[] = [
  {
    slug: "sanrio",
    name: "Sanrio",
    kind: "brand",
    featured: true,
    icon: "🎀",
    accentColor: "#ff7eb6",
    description:
      "The whole Sanrio crew — Hello Kitty, Kuromi, My Melody and friends.",
    match: ["sanrio"],
    children: [
      {
        slug: "hello-kitty",
        name: "Hello Kitty",
        kind: "character",
        icon: "🐱",
        accentColor: "#ff4d6d",
        match: ["hello kitty", "hellokitty"],
      },
      {
        slug: "kuromi",
        name: "Kuromi",
        kind: "character",
        icon: "😈",
        accentColor: "#7b5cff",
        match: ["kuromi"],
      },
      {
        slug: "my-melody",
        name: "My Melody",
        kind: "character",
        icon: "🐰",
        accentColor: "#ff8fb1",
        match: ["my melody", "mymelody", "melody"],
      },
      {
        slug: "cinnamoroll",
        name: "Cinnamoroll",
        kind: "character",
        icon: "☁️",
        accentColor: "#7ec8ff",
        match: ["cinnamoroll", "cinnamon"],
      },
      {
        slug: "pompompurin",
        name: "Pompompurin",
        kind: "character",
        icon: "🍮",
        accentColor: "#ffd166",
        match: ["pompompurin", "purin"],
      },
      {
        slug: "keroppi",
        name: "Keroppi",
        kind: "character",
        icon: "🐸",
        accentColor: "#8ee06b",
        match: ["keroppi"],
      },
      {
        slug: "pochacco",
        name: "Pochacco",
        kind: "character",
        icon: "🐶",
        accentColor: "#9fd3ff",
        match: ["pochacco"],
      },
      {
        slug: "little-twin-stars",
        name: "Little Twin Stars",
        kind: "character",
        icon: "⭐",
        accentColor: "#b794ff",
        match: ["little twin stars", "kiki", "lala"],
      },
    ],
  },
  {
    slug: "miffy",
    name: "Miffy",
    kind: "brand",
    featured: true,
    icon: "🐰",
    accentColor: "#ff9f1c",
    description: "Dick Bruna's iconic little bunny.",
    match: ["miffy", "nijntje"],
  },
  {
    slug: "tamagotchi",
    name: "Tamagotchi",
    kind: "brand",
    featured: true,
    icon: "🥚",
    accentColor: "#22c1c3",
    description: "The original digital pet, reborn on your phone.",
    match: ["tamagotchi"],
  },
  {
    slug: "anime",
    name: "Anime",
    kind: "genre",
    featured: true,
    icon: "🌸",
    accentColor: "#ff5d8f",
    description: "Anime & manga-inspired designs.",
    match: ["anime", "manga"],
  },
  {
    slug: "cartoon",
    name: "Cartoon",
    kind: "genre",
    featured: true,
    icon: "📺",
    accentColor: "#ffb703",
    description: "Cartoon characters and retro toons.",
    match: ["cartoon", "toon"],
  },
  {
    slug: "kawaii",
    name: "Kawaii",
    kind: "genre",
    featured: true,
    icon: "💖",
    accentColor: "#ff8fab",
    description: "Soft, cute and undeniably kawaii.",
    match: ["kawaii", "cute"],
  },
  {
    slug: "y2k",
    name: "Y2K",
    kind: "genre",
    icon: "💿",
    accentColor: "#b5179e",
    description: "Early-2000s nostalgia, chrome and sparkle.",
    match: ["y2k", "2000s"],
  },
  {
    slug: "characters",
    name: "Characters",
    kind: "genre",
    icon: "🧸",
    accentColor: "#06d6a0",
    description: "Licensed and original character designs.",
    match: ["character"],
  },
  {
    slug: "magsafe",
    name: "MagSafe",
    kind: "feature",
    icon: "🧲",
    accentColor: "#8e8e93",
    description:
      "Cases with a built-in magnetic ring — snap-on MagSafe charging and accessories.",
    match: ["magsafe", "mag safe"],
  },
];

/** A flattened seed node with its resolved parent slug (null for top level). */
export type FlatCollectionSeed = CollectionSeed & { parentSlug: string | null };

/** Depth-first flatten that records each node's parent slug and order. */
export function flattenTaxonomy(
  nodes: CollectionSeed[] = COLLECTION_TAXONOMY,
  parentSlug: string | null = null,
  out: FlatCollectionSeed[] = [],
): FlatCollectionSeed[] {
  nodes.forEach((node) => {
    out.push({ ...node, parentSlug });
    if (node.children?.length) flattenTaxonomy(node.children, node.slug, out);
  });
  return out;
}

/**
 * Match a product's text signals (tags, title, source folder) against the
 * taxonomy's `match` keywords. Returns the slugs of every collection the
 * product should belong to — including ancestors, so tagging "Hello Kitty"
 * also surfaces the product under "Sanrio".
 */
export function matchCollectionSlugs(signals: {
  tags?: string[] | null;
  title?: string | null;
  sourceFolder?: string | null;
}): string[] {
  const hay = [
    ...(signals.tags ?? []),
    signals.title ?? "",
    signals.sourceFolder ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[_/\\-]+/g, " ");

  const flat = flattenTaxonomy();
  const bySlug = new Map(flat.map((n) => [n.slug, n]));
  const hits = new Set<string>();

  for (const node of flat) {
    const keywords = node.match ?? [];
    if (keywords.some((k) => hay.includes(k))) {
      // Add the node and walk up to the root so ancestors match too.
      let cur: FlatCollectionSeed | undefined = node;
      while (cur) {
        hits.add(cur.slug);
        cur = cur.parentSlug ? bySlug.get(cur.parentSlug) : undefined;
      }
    }
  }
  return [...hits];
}
