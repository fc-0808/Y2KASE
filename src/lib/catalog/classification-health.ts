/**
 * A verdict on "is this product classified correctly?", computed for the whole
 * catalogue in one pass.
 *
 * A product's identity is asserted in three places that can disagree, and until
 * now nothing compared them:
 *
 *   1. `products.brand_name` / `character_name` — the registry classification
 *   2. its rows in `product_collections`        — the browse tree
 *   3. the words in its own title               — what a shopper actually reads
 *
 * Every failure this catalogue has shipped was a disagreement between two of
 * them that nobody could see: a Crayon Shin-chan case filed under Hello Kitty, a
 * Rilakkuma case whose title never says Rilakkuma, and fifty-two products whose
 * "brand" was the supplier's own shop name. None of that is visible from a list
 * of titles, so the admin could not act on it.
 *
 * This module turns those three sources into one of a small set of named
 * states, so the console can show a badge per row and an operator can work
 * through them. The states are ordered by how much they cost: a false claim
 * about who is on the case outranks a missed keyword.
 *
 * Pure and I/O-free, like `./listing-title`: the product console is a client
 * component and renders these states per row, so this must not drag a database
 * driver into the browser bundle. The query that feeds it lives in
 * `./classification-health-service`.
 */
import {
  classifyBrandContext,
  isNonIpBrandValue,
  isOperatorConfirmed,
  resolveBrandAssignment,
} from "@/lib/catalog/brands";
import {
  BRAND_COLLECTION_KINDS,
  ORIGINALS_SLUG,
  flattenTaxonomy,
  taxonomySlugChain,
} from "@/lib/catalog/collections-config";

/** How a product's stored classification stands up to scrutiny. */
export type ClassificationState =
  /** Column, title and browse tree all agree. */
  | "ok"
  /** The title names a different registry character than the column does. */
  | "conflict"
  /** The column holds the seller's own shop or factory name, not an IP. */
  | "supplier_name"
  /** A value that no longer resolves to anything in the registry. */
  | "unknown_brand"
  /** Nothing is classified at all, and the title offers no clue either. */
  | "unclassified"
  /** Classified, but filed in a brand collection nothing supports. */
  | "misfiled"
  /** Classified and filed correctly, but only a classifier ever said so. */
  | "unconfirmed";

export type ClassificationHealth = {
  state: ClassificationState;
  /** The stored classification as the registry resolves it, for display. */
  brandName: string | null;
  characterName: string | null;
  /** The raw column value when it resolves to nothing — shown so it can be fixed. */
  storedRaw: string | null;
  /** True when a human confirmed this, rather than a classifier guessing. */
  confirmed: boolean;
  /** Brand/character collections the product currently sits in. */
  brandSlugs: string[];
  /** Genre/feature collections, which are curated on a separate axis. */
  otherSlugs: string[];
  /** Brand collections that neither the column nor the title supports. */
  unsupportedSlugs: string[];
  /** What the title alone reads as, when that differs from the column. */
  titleReadsAs: string | null;
  /** One sentence an operator can act on. */
  detail: string;
};

/** States that mean "a shopper may be seeing something untrue". */
const NEEDS_ACTION: ReadonlySet<ClassificationState> = new Set<ClassificationState>(
  ["conflict", "supplier_name", "misfiled"],
);

export function classificationNeedsAction(state: ClassificationState): boolean {
  return NEEDS_ACTION.has(state);
}

/** The product fields a classification verdict is computed from. */
export type ClassificationInput = {
  title: string;
  brandName: string | null;
  characterName: string | null;
  brandEvidence: string[] | null;
};

/** Assess one product against its collection memberships. */
export function assessClassification(
  row: ClassificationInput,
  memberships: { slug: string; kind: string }[],
): ClassificationHealth {
  const brandSlugs = memberships
    .filter((m) => BRAND_COLLECTION_KINDS.has(m.kind))
    .map((m) => m.slug);
  const otherSlugs = memberships
    .filter((m) => !BRAND_COLLECTION_KINDS.has(m.kind))
    .map((m) => m.slug);

  const resolved = resolveBrandAssignment(row.brandName, row.characterName);
  const confirmed = isOperatorConfirmed(row.brandEvidence);
  const fromTitle = classifyBrandContext([row.title]);
  const titleReadsAs = fromTitle.character ?? fromTitle.brand;

  const base = {
    brandName: resolved.ok ? resolved.brand.brand : null,
    characterName: resolved.ok ? (resolved.character?.name ?? null) : null,
    storedRaw: resolved.ok
      ? null
      : ([row.brandName, row.characterName].filter(Boolean).join(" / ") || null),
    confirmed,
    brandSlugs: sortByTaxonomy(brandSlugs),
    otherSlugs: sortByTaxonomy(otherSlugs),
    titleReadsAs,
  };

  // Collections the classification legitimately implies: the stored chain plus
  // whatever the title itself names. Anything else is a leftover from an older
  // classification and is what makes a Shin-chan case show up under Hello Kitty.
  const supported = new Set<string>([
    ...(resolved.ok ? taxonomySlugChain(resolved.brand.id) : []),
    ...(resolved.ok && resolved.character
      ? taxonomySlugChain(resolved.character.id)
      : []),
    ...(fromTitle.brandId ? taxonomySlugChain(fromTitle.brandId) : []),
    ...(fromTitle.characterId ? taxonomySlugChain(fromTitle.characterId) : []),
  ]);
  const unsupportedSlugs = brandSlugs.filter((slug) => !supported.has(slug));

  if (!resolved.ok) {
    if (isNonIpBrandValue(row.brandName)) {
      return {
        ...base,
        unsupportedSlugs,
        state: "supplier_name",
        detail: `“${row.brandName}” is a shop or maker name, not a character. ${
          titleReadsAs
            ? `This title reads as ${titleReadsAs}.`
            : "Set the real IP, or clear the field."
        }`,
      };
    }
    if (row.brandName || row.characterName) {
      return {
        ...base,
        unsupportedSlugs,
        state: "unknown_brand",
        detail: `“${base.storedRaw}” is not in the brand registry, so this product can't be filed. ${
          titleReadsAs ? `The title reads as ${titleReadsAs}.` : ""
        }`.trim(),
      };
    }
    const inOriginals = otherSlugs.includes(ORIGINALS_SLUG);
    return {
      ...base,
      unsupportedSlugs,
      state: titleReadsAs ? "unknown_brand" : "unclassified",
      detail: titleReadsAs
        ? `Not classified, but the title reads as ${titleReadsAs}.`
        : inOriginals
          ? "No licensed IP. Shoppers find this under Originals and by theme."
          : "No brand set and nothing in the title suggests one.",
    };
  }

  const storedIp = resolved.character?.name ?? resolved.brand.brand;

  const disagrees =
    (fromTitle.brandId && fromTitle.brandId !== resolved.brand.id) ||
    (fromTitle.characterId &&
      fromTitle.characterId !== (resolved.character?.id ?? null));
  if (disagrees) {
    return {
      ...base,
      unsupportedSlugs,
      state: "conflict",
      detail: `Classified as ${storedIp}, but the title reads as ${titleReadsAs}. One of the two is wrong.`,
    };
  }

  if (unsupportedSlugs.length > 0) {
    return {
      ...base,
      unsupportedSlugs,
      state: "misfiled",
      detail: `Classified as ${storedIp} but still filed under ${unsupportedSlugs.join(", ")}, which nothing about this product supports.`,
    };
  }

  if (!confirmed) {
    return {
      ...base,
      unsupportedSlugs,
      state: "unconfirmed",
      detail: `Classified as ${storedIp} by the automatic classifier — nobody has confirmed it against the photos.`,
    };
  }

  return {
    ...base,
    unsupportedSlugs,
    state: "ok",
    detail: `Confirmed as ${storedIp}.`,
  };
}

/** Present collections in browse order rather than insertion order. */
function sortByTaxonomy(slugs: string[]): string[] {
  const order = flattenTaxonomy().map((node) => node.slug);
  const rank = (slug: string) => {
    const at = order.indexOf(slug);
    return at === -1 ? order.length : at;
  };
  return [...new Set(slugs)].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
}
