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
      {
        slug: "badtz-maru",
        name: "Badtz-Maru",
        kind: "character",
        icon: "🐧",
        accentColor: "#3f3f46",
        match: ["badtz-maru", "badtzmaru", "badtz maru"],
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
    slug: "rilakkuma",
    name: "Rilakkuma",
    kind: "brand",
    featured: true,
    icon: "🧸",
    accentColor: "#c58b57",
    description: "San-X's relaxed bear and friends.",
    match: ["rilakkuma", "san-x", "sanx", "relax bear", "relaxed bear"],
    children: [
      {
        slug: "korilakkuma",
        name: "Korilakkuma",
        kind: "character",
        icon: "🐻‍❄️",
        accentColor: "#f4d7e3",
        match: ["korilakkuma", "kori rilakkuma"],
      },
      {
        slug: "kiiroitori",
        name: "Kiiroitori",
        kind: "character",
        icon: "🐤",
        accentColor: "#ffd93d",
        match: ["kiiroitori", "kiiroi tori"],
      },
    ],
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
  // ── Brands the registry could classify into but the browse tree could not ──
  // A classification with no node behind it is worse than no classification:
  // `taxonomySlugChain` returns nothing, so filing links the product to zero
  // collections and the product falls out of the browse tree entirely. That is
  // how Crayon Shin-chan and Monchhichi cases ended up under Hello Kitty —
  // there was nowhere correct to put them. These stay unfeatured, so they only
  // surface once they actually hold stock.
  {
    slug: "chiikawa",
    name: "Chiikawa",
    kind: "brand",
    icon: "🐹",
    accentColor: "#ffd6e0",
    description: "Nagano's tiny, anxious little creatures.",
    match: ["chiikawa", "chikawa"],
    children: [
      { slug: "hachiware", name: "Hachiware", kind: "character", icon: "🐱", accentColor: "#a8dadc", match: ["hachiware"] },
      { slug: "usagi", name: "Usagi", kind: "character", icon: "🐰", accentColor: "#ffe066", match: ["usagi"] },
    ],
  },
  {
    slug: "peanuts",
    name: "Peanuts",
    kind: "brand",
    icon: "🐶",
    accentColor: "#e63946",
    description: "Snoopy, Woodstock and the whole Peanuts gang.",
    match: ["peanuts"],
    children: [
      { slug: "snoopy", name: "Snoopy", kind: "character", icon: "🐕", accentColor: "#1d3557", match: ["snoopy"] },
      { slug: "woodstock", name: "Woodstock", kind: "character", icon: "🐤", accentColor: "#ffb703", match: ["woodstock"] },
    ],
  },
  {
    slug: "disney",
    name: "Disney",
    kind: "brand",
    icon: "🏰",
    accentColor: "#4361ee",
    description: "Mickey, Stitch, Pooh and friends.",
    match: ["disney"],
    children: [
      { slug: "mickey-mouse", name: "Mickey Mouse", kind: "character", icon: "🐭", accentColor: "#d00000", match: ["mickey mouse", "mickey"] },
      { slug: "minnie-mouse", name: "Minnie Mouse", kind: "character", icon: "🎀", accentColor: "#ff477e", match: ["minnie mouse", "minnie"] },
      { slug: "stitch", name: "Stitch", kind: "character", icon: "👽", accentColor: "#0077b6", match: ["stitch", "lilo and stitch"] },
      { slug: "winnie-the-pooh", name: "Winnie the Pooh", kind: "character", icon: "🍯", accentColor: "#ffb703", match: ["winnie the pooh", "pooh"] },
    ],
  },
  {
    slug: "toy-story",
    name: "Toy Story",
    kind: "brand",
    icon: "🤠",
    accentColor: "#8ecae6",
    description: "Woody, Buzz and the toybox crew.",
    match: ["toy story"],
    children: [
      { slug: "woody", name: "Woody", kind: "character", icon: "🤠", accentColor: "#bc6c25", match: ["woody"] },
      { slug: "buzz-lightyear", name: "Buzz Lightyear", kind: "character", icon: "🚀", accentColor: "#7209b7", match: ["buzz lightyear", "buzz"] },
      { slug: "jessie", name: "Jessie", kind: "character", icon: "🐴", accentColor: "#e07a5f", match: ["jessie"] },
    ],
  },
  {
    slug: "pokemon",
    name: "Pokémon",
    kind: "brand",
    icon: "⚡",
    accentColor: "#ffcb05",
    description: "Pikachu, Eevee and the rest of the Pokédex.",
    match: ["pokemon", "pokémon"],
    children: [
      { slug: "pikachu", name: "Pikachu", kind: "character", icon: "⚡", accentColor: "#ffcb05", match: ["pikachu"] },
      { slug: "eevee", name: "Eevee", kind: "character", icon: "🦊", accentColor: "#c68642", match: ["eevee"] },
      { slug: "snorlax", name: "Snorlax", kind: "character", icon: "😴", accentColor: "#4a6fa5", match: ["snorlax"] },
    ],
  },
  {
    slug: "crayon-shin-chan",
    name: "Crayon Shin-chan",
    kind: "brand",
    icon: "🖍️",
    accentColor: "#ef476f",
    description: "The cheeky five-year-old and his crayon world.",
    match: ["crayon shin-chan", "crayon shin chan", "shin-chan", "shin chan", "shinchan"],
    children: [
      { slug: "shin-chan", name: "Shin-chan", kind: "character", icon: "🖍️", accentColor: "#ef476f", match: ["shin-chan", "shin chan", "shinchan"] },
    ],
  },
  {
    slug: "spongebob-squarepants",
    name: "SpongeBob SquarePants",
    kind: "brand",
    icon: "🧽",
    accentColor: "#fdc500",
    description: "Bikini Bottom's finest.",
    match: ["spongebob squarepants", "spongebob", "sponge bob"],
    children: [
      { slug: "spongebob", name: "SpongeBob", kind: "character", icon: "🧽", accentColor: "#fdc500", match: ["spongebob", "sponge bob"] },
      { slug: "patrick-star", name: "Patrick Star", kind: "character", icon: "⭐", accentColor: "#ff70a6", match: ["patrick star", "patrick"] },
    ],
  },
  {
    slug: "care-bears",
    name: "Care Bears",
    kind: "brand",
    icon: "🌈",
    accentColor: "#ff9ec6",
    description: "Pastel bears with belly badges.",
    match: ["care bears", "carebear", "carebears"],
  },
  {
    slug: "monchhichi",
    name: "Monchhichi",
    kind: "brand",
    icon: "🐵",
    accentColor: "#b5838d",
    description: "The classic thumb-sucking monkey doll.",
    match: ["monchhichi", "monchichi"],
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
  {
    slug: "originals",
    name: "Originals",
    kind: "genre",
    featured: true,
    icon: "✨",
    accentColor: "#7ec8ff",
    description:
      "Cute designs that aren't tied to a licensed character — clouds, animals, bows and more.",
    // Membership is NOT keyword-matched. Unlicensed products are filed by
    // `syncOriginalsMembership` so a title saying "original" cannot leak a
    // Sanrio case in, and clearing a brand automatically lands it here.
  },
];

/** Browse node for products with no licensed brand/character. */
export const ORIGINALS_SLUG = "originals";

/** Feature collection for MagSafe phone cases. Never file AirPods here. */
export const MAGSAFE_SLUG = "magsafe";

/**
 * Collections intentionally hidden from the "Shop the universe" homepage rail
 * (and its generated cover set). These broad genre umbrellas are still browsable
 * everywhere else — they're just not surfaced as feature tiles on the homepage.
 */
export const RAIL_HIDDEN_SLUGS: ReadonlySet<string> = new Set<string>([
  "anime",
  "kawaii",
  "y2k",
  "characters",
  "cartoon",
]);

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
 * The collection kinds that represent "who is on the case" — the axis the brand
 * classifier owns. Genre and feature memberships are curated separately and are
 * never touched when a product's brand changes.
 */
export const BRAND_COLLECTION_KINDS: ReadonlySet<string> = new Set<string>([
  "brand",
  "character",
]);

/**
 * A slug plus every ancestor slug above it, root last — e.g. `"hello-kitty"` →
 * `["hello-kitty", "sanrio"]`. Returns `[]` for a slug that isn't in the
 * taxonomy, which is how callers detect a registry entry with no browse node.
 */
export function taxonomySlugChain(slug: string): string[] {
  const flat = flattenTaxonomy();
  const bySlug = new Map(flat.map((n) => [n.slug, n]));
  const chain: string[] = [];
  let cur = bySlug.get(slug);
  // The taxonomy is shallow; the bound is a cycle guard, not a depth limit.
  for (let i = 0; cur && i < 8; i++) {
    chain.push(cur.slug);
    cur = cur.parentSlug ? bySlug.get(cur.parentSlug) : undefined;
  }
  return chain;
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
      let cur: FlatCollectionSeed | undefined = node;
      while (cur) {
        hits.add(cur.slug);
        cur = cur.parentSlug ? bySlug.get(cur.parentSlug) : undefined;
      }
    }
  }
  return [...hits];
}
