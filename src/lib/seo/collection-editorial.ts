/**
 * Unique on-page copy for collection landings, plus the internal links that
 * should always appear from that URL.
 *
 * Head terms stay in {@link collectionSeo} so titles cannot drift. This module
 * owns the *body* — the paragraph under the grid that stops a character page
 * from being a templated clone of every other character page, and the related
 * links that point at the PAGE_COPY owner for sibling queries (iPhone, MagSafe,
 * parent brand, flagship guides).
 */

import { IPHONE_FIT } from "@/lib/pricing";

export type EditorialLink = { href: string; label: string };

export type CollectionEditorial = {
  /** Visible paragraphs below the product grid. */
  paragraphs: string[];
  /** Indexable related URLs. Keep these off noindex facet paths. */
  related: EditorialLink[];
};

const IPHONE: EditorialLink = {
  href: "/devices/iphone",
  label: "iPhone cases",
};
const AIRPODS: EditorialLink = {
  href: "/devices/airpods",
  label: "AirPods cases",
};
const MAGSAFE: EditorialLink = {
  href: "/collections/magsafe",
  label: "MagSafe phone cases",
};
const KAWAII: EditorialLink = {
  href: "/collections/kawaii",
  label: "Kawaii phone cases",
};
const Y2K: EditorialLink = {
  href: "/collections/y2k",
  label: "Y2K phone cases",
};
const INSIGHTS: EditorialLink = {
  href: "/insights",
  label: "What's in the catalog",
};

const BODIES: Record<string, CollectionEditorial> = {
  sanrio: {
    paragraphs: [
      `Sanrio phone cases at Y2KASE cover the characters people actually search for — Hello Kitty, Kuromi, My Melody, Cinnamoroll and the rest of the crew — on ${IPHONE_FIT.through}, including Pro and Pro Max. Each character has its own landing page so a Kuromi shopper is not stuck filtering a mixed Sanrio grid.`,
      "Designs run from classic red-bow Hello Kitty to darker Kuromi palettes. Cases marked MagSafe have a verified magnetic ring for chargers and wallets; unmarked cases are sold as regular snap-on covers. Charms and grips are sold as styles on the product page, not as a separate Sanrio-only SKU.",
    ],
    related: [
      { href: "/collections/hello-kitty", label: "Hello Kitty phone cases" },
      { href: "/collections/kuromi", label: "Kuromi phone cases" },
      { href: "/collections/my-melody", label: "My Melody phone cases" },
      { href: "/blog/sanrio-phone-case-guide", label: "Sanrio character guide" },
      IPHONE,
      MAGSAFE,
    ],
  },
  "hello-kitty": {
    paragraphs: [
      `Hello Kitty phone cases here are the classic Sanrio look: red bow, clean lines, and the easy-to-gift palette people expect. Fit is ${IPHONE_FIT.dash} (including Pro and Pro Max); pick the exact model on the product page so the camera ring matches.`,
      "If you want the rest of the Sanrio universe, start from the Sanrio collection rather than mixing Hello Kitty with Kuromi on this URL — this page is only for Hello Kitty. MagSafe-marked Hello Kitty cases snap to MagSafe chargers; others do not.",
    ],
    related: [
      { href: "/collections/sanrio", label: "All Sanrio phone cases" },
      { href: "/collections/kuromi", label: "Kuromi phone cases" },
      { href: "/blog/sanrio-phone-case-guide", label: "Sanrio character guide" },
      IPHONE,
      MAGSAFE,
    ],
  },
  kuromi: {
    paragraphs: [
      "Kuromi phone cases are the Sanrio option with an edge — purple, black, and punk-pastel instead of the red-bow Hello Kitty look. Every case on this page is filed as Kuromi, so you are not scrolling past My Melody to find her.",
      `Available for ${IPHONE_FIT.through}, including Pro and Pro Max. MagSafe-labelled Kuromi cases have a reviewed magnet ring; if MagSafe is not marked, treat it as a regular case. Charms and grips attach from the style selector on each product.`,
    ],
    related: [
      { href: "/collections/sanrio", label: "All Sanrio phone cases" },
      { href: "/collections/hello-kitty", label: "Hello Kitty phone cases" },
      { href: "/blog/sanrio-phone-case-guide", label: "Sanrio character guide" },
      IPHONE,
      MAGSAFE,
    ],
  },
  "my-melody": {
    paragraphs: [
      "My Melody phone cases are the soft-pink Sanrio lane — cottagecore, bows, and a gentler palette than Kuromi. This page is My Melody only; sister characters live on their own collections under Sanrio.",
      `${IPHONE_FIT.dash}, Pro and Pro Max. Use the MagSafe badge on the product, not the character, to decide whether a charger or wallet will snap on.`,
    ],
    related: [
      { href: "/collections/sanrio", label: "All Sanrio phone cases" },
      { href: "/collections/kuromi", label: "Kuromi phone cases" },
      { href: "/blog/sanrio-phone-case-guide", label: "Sanrio character guide" },
      IPHONE,
      MAGSAFE,
    ],
  },
  cinnamoroll: {
    paragraphs: [
      `Cinnamoroll phone cases are the pastel-blue Sanrio sky-pup look — calmer than Hello Kitty, softer than Kuromi. Stock is ${IPHONE_FIT.throughShort}, including Pro and Pro Max, with MagSafe called out per product after review.`,
    ],
    related: [
      { href: "/collections/sanrio", label: "All Sanrio phone cases" },
      { href: "/blog/sanrio-phone-case-guide", label: "Sanrio character guide" },
      IPHONE,
      MAGSAFE,
    ],
  },
  miffy: {
    paragraphs: [
      `Miffy phone cases follow Dick Bruna's simple bunny — graphic, a little Dutch-modern, and less busy than Sanrio character art. These are Miffy designs for ${IPHONE_FIT.dash} (Pro and Pro Max included).`,
      "MagSafe compatibility is a product-level mark, not a Miffy-wide promise. If you want character cases more generally, the character index and kawaii collection sit alongside this page.",
    ],
    related: [KAWAII, IPHONE, MAGSAFE, INSIGHTS],
  },
  tamagotchi: {
    paragraphs: [
      `Tamagotchi phone cases bring the original digital-pet shell language — chunky pixels, device nostalgia, early-2000s color — onto ${IPHONE_FIT.throughShort}. They sit next to our Y2K collection rather than replacing it: Tamagotchi is the character/IP, Y2K is the broader finish and era.`,
    ],
    related: [Y2K, IPHONE, MAGSAFE, INSIGHTS],
  },
  rilakkuma: {
    paragraphs: [
      `Rilakkuma phone cases are San-X's relaxed bear — honey browns, lazy poses, and the Korilakkuma / Kiiroitori friends when we stock them as their own child pages. Fit is ${IPHONE_FIT.dash}, Pro and Pro Max.`,
    ],
    related: [KAWAII, IPHONE, MAGSAFE],
  },
  kawaii: {
    paragraphs: [
      "Kawaii phone cases is the umbrella for the cute, pastel, character-forward side of Y2KASE — not a synonym for Sanrio, and not the same query as Y2K. Sanrio, Miffy and originals all appear here when they read as kawaii; chrome and holographic Y2K finishes have their own collection.",
      `Shop ${IPHONE_FIT.dash} cases, then narrow by MagSafe or by a specific character if you already know who you want.`,
    ],
    related: [
      { href: "/collections/sanrio", label: "Sanrio phone cases" },
      { href: "/collections/originals", label: "Original phone cases" },
      Y2K,
      IPHONE,
      MAGSAFE,
      INSIGHTS,
    ],
  },
  y2k: {
    paragraphs: [
      "Y2K phone cases at Y2KASE means early-2000s finishes: holographic, chrome, glitter, Tamagotchi energy — not every cute character case in the catalog. If you want Hello Kitty specifically, use that character page; this one is for the era and the shine.",
      `${IPHONE_FIT.throughShort}, including Pro and Pro Max. MagSafe is labelled per case after the merchandising review described in our MagSafe notes.`,
    ],
    related: [
      { href: "/collections/tamagotchi", label: "Tamagotchi phone cases" },
      { href: "/blog/best-y2k-phone-cases-2026", label: "Y2K case trends" },
      { href: "/blog/how-we-verify-magsafe", label: "How we verify MagSafe" },
      KAWAII,
      IPHONE,
      MAGSAFE,
    ],
  },
  magsafe: {
    paragraphs: [
      "MagSafe phone cases on this page are the ones we have actually classified as MagSafe — a visible magnet ring or equivalent evidence, not a keyword stuffed into the title. Unmarked cases stay off this URL on purpose so a shopper buying a charger or wallet is not guessing.",
      `Alignment follows Apple's MagSafe layout on ${IPHONE_FIT.throughShort} (including Pro and Pro Max). Wallets and chargers from other brands still vary; the badge means the case has the ring, not that every third-party accessory will feel identical.`,
    ],
    related: [
      { href: "/blog/how-we-verify-magsafe", label: "How we verify MagSafe" },
      IPHONE,
      KAWAII,
      INSIGHTS,
    ],
  },
  originals: {
    paragraphs: [
      "Original phone cases are Y2KASE designs that are not tied to a licensed character — clouds, bows, animals, holographic finishes without a Sanrio or Disney mark. Licensed IP is filed on its own brand or character page so this collection cannot accidentally mix a Hello Kitty case in.",
    ],
    related: [KAWAII, Y2K, IPHONE, MAGSAFE, INSIGHTS],
  },
  anime: {
    paragraphs: [
      "Anime phone cases collect manga- and anime-inspired designs that are not already filed under a more specific licensed brand page. If a case is clearly Sanrio, Pokémon or Chiikawa, it lives there; this page is the remaining anime look.",
    ],
    related: [
      { href: "/collections/pokemon", label: "Pokémon phone cases" },
      KAWAII,
      IPHONE,
      MAGSAFE,
    ],
  },
};

const KIND_FALLBACK_RELATED: EditorialLink[] = [IPHONE, MAGSAFE, KAWAII];

function uniqueRelated(links: EditorialLink[]): EditorialLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

/**
 * Body copy + related links for a collection landing. Curated slugs get
 * unique paragraphs; everyone else gets a short, name-specific fallback so
 * we never emit another "Shop {name} — kawaii, Y2K and holographic" clone
 * as the only on-page text.
 */
export function collectionEditorial(input: {
  slug: string;
  name: string;
  kind?: string | null;
  parent?: { slug: string; name: string } | null;
  stockedDeviceIds?: string[];
}): CollectionEditorial {
  const curated = BODIES[input.slug];
  const base = curated
    ? editorialFromCurated(curated, input.parent)
    : editorialFallback(input);

  return withDeviceRelated(base, input.stockedDeviceIds, input.slug);
}

function editorialFromCurated(
  curated: CollectionEditorial,
  parent?: { slug: string; name: string } | null,
): CollectionEditorial {
  const parentLink =
    parent &&
    !curated.related.some((link) => link.href === `/collections/${parent.slug}`)
      ? [
          {
            href: `/collections/${parent.slug}`,
            label: `${parent.name} phone cases`,
          },
        ]
      : [];
  return {
    paragraphs: curated.paragraphs,
    related: uniqueRelated([...parentLink, ...curated.related]),
  };
}

function editorialFallback(input: {
  slug: string;
  name: string;
  kind?: string | null;
  parent?: { slug: string; name: string } | null;
}): CollectionEditorial {
  const parent = input.parent;
  const paragraphs = [
    parent
      ? `${input.name} phone cases at Y2KASE sit under ${parent.name}. This page is only ${input.name} — ${IPHONE_FIT.throughShort}, including Pro and Pro Max — so you are not filtering a mixed ${parent.name} grid.`
      : `${input.name} phone cases at Y2KASE are built for ${IPHONE_FIT.throughShort}, including Pro and Pro Max. MagSafe is labelled on the product after review, not assumed from the collection name.`,
  ];

  const related: EditorialLink[] = [];
  if (parent) {
    related.push({
      href: `/collections/${parent.slug}`,
      label: `${parent.name} phone cases`,
    });
  }
  related.push(...KIND_FALLBACK_RELATED);
  return { paragraphs, related: uniqueRelated(related) };
}

/**
 * Related links follow the stocked mix: AirPods-only pages must not point
 * shoppers at MagSafe, and a collection that actually sells AirPods should
 * name `/devices/airpods` — the URL that owns that query.
 */
function withDeviceRelated(
  editorial: CollectionEditorial,
  stockedDeviceIds: string[] | undefined,
  slug: string,
): CollectionEditorial {
  const ids = stockedDeviceIds ?? [];
  const airpodsOnly = ids.length === 1 && ids[0] === "airpods";
  let related = editorial.related;
  if (airpodsOnly) {
    related = related.filter((link) => link.href !== MAGSAFE.href);
  }
  if (ids.includes("airpods") && slug !== "magsafe") {
    related = uniqueRelated([AIRPODS, ...related]);
  }
  return { paragraphs: editorial.paragraphs, related };
}
