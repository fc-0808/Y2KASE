/**
 * The canonical brand / character registry.
 *
 * This is the single vocabulary the whole catalogue speaks: ingest classifies
 * into it, the vision classifier's answer is validated against it, the admin
 * reassignment picker is rendered from it, and every brand/character node in
 * the browse taxonomy must have an entry here (asserted by `check:guards`).
 *
 * ── Modelling ───────────────────────────────────────────────────────────────
 * A *brand* is the rights holder / product line we merchandise (Sanrio, San-X's
 * Rilakkuma, Miffy). A *character* is a face within it (Hello Kitty, Kuromi,
 * Korilakkuma). Characters are never brands: an earlier version listed "Hello
 * Kitty" as a top-level brand *and* as a Sanrio character, which meant the same
 * product could be classified two incompatible ways depending on which entry
 * matched first. `resolveBrandAssignment` still accepts those legacy values and
 * folds them back onto (brand, character).
 *
 * ── Matching ────────────────────────────────────────────────────────────────
 * Text matching is whole-word and longest-alias-wins, never substring and never
 * "first entry in the array wins". Both of those produced real mislabels:
 * "miffy" was an alias of Sanrio, so every Miffy case was filed under Sanrio and
 * — because the character fell back to `characters[0]` — labelled Hello Kitty.
 * A character is only ever reported when a character term actually appears.
 */

export type CharacterKnowledge = {
  /** Stable id. Doubles as the collection slug when the character is browsable. */
  id: string;
  /** Canonical display name — this is what lands in `products.character_name`. */
  name: string;
  /** Extra spellings that should match this character. The name always matches. */
  aliases?: string[];
};

export type BrandKnowledge = {
  /** Stable id. Doubles as the collection slug when the brand is browsable. */
  id: string;
  /** Canonical display name — this is what lands in `products.brand_name`. */
  brand: string;
  /** Extra spellings that should match this brand. The name always matches. */
  aliases?: string[];
  characters?: CharacterKnowledge[];
  /**
   * Visual cues, for prompts and human review only. Deliberately excluded from
   * text matching: "bear" would put every bear case in the first bear brand.
   */
  colorMarkers?: string[];
};

export type BrandConfidence = "high" | "medium" | "low" | "none";

/**
 * Marker written into `products.brand_evidence` when a human made the call.
 *
 * Provenance, not prose: the listing-title contract refuses to write an
 * uncorroborated classification into a title, and an operator's confirmation is
 * the one form of corroboration that need not appear in the product's own text.
 * Reading it back therefore has to be an exact prefix test against a shared
 * constant, never a guess at how the sentence was phrased.
 */
export const OPERATOR_EVIDENCE_PREFIX = "operator override";

/** True when this evidence trail records a human decision. */
export function isOperatorConfirmed(
  evidence: readonly string[] | null | undefined,
): boolean {
  return (evidence ?? []).some((entry) =>
    entry.startsWith(OPERATOR_EVIDENCE_PREFIX),
  );
}

export type BrandClassification = {
  /** Canonical brand display name, or null when nothing matched. */
  brand: string | null;
  /** Canonical character display name, or null when no character was evidenced. */
  character: string | null;
  /** Registry id of the brand — stable across renames, safe to persist/compare. */
  brandId: string | null;
  /** Registry id of the character. */
  characterId: string | null;
  confidence: BrandConfidence;
  /** The terms that actually matched, for the audit trail shown in the admin. */
  evidence: string[];
};

export const EMPTY_BRAND_CLASSIFICATION: BrandClassification = {
  brand: null,
  character: null,
  brandId: null,
  characterId: null,
  confidence: "none",
  evidence: [],
};

export const BRAND_KNOWLEDGE: BrandKnowledge[] = [
  {
    id: "sanrio",
    brand: "Sanrio",
    aliases: ["sanrio"],
    characters: [
      {
        id: "hello-kitty",
        name: "Hello Kitty",
        aliases: ["hellokitty", "kitty white"],
      },
      { id: "kuromi", name: "Kuromi" },
      { id: "my-melody", name: "My Melody", aliases: ["mymelody", "melody"] },
      { id: "cinnamoroll", name: "Cinnamoroll", aliases: ["cinnamon roll"] },
      {
        id: "pompompurin",
        name: "Pompompurin",
        aliases: ["pom pom purin", "purin"],
      },
      { id: "keroppi", name: "Keroppi" },
      { id: "pochacco", name: "Pochacco" },
      { id: "badtz-maru", name: "Badtz-Maru", aliases: ["badtzmaru"] },
      {
        id: "little-twin-stars",
        name: "Little Twin Stars",
        aliases: ["littletwinstars", "kiki lala"],
      },
    ],
    colorMarkers: ["white cat", "pink bunny", "white puppy"],
  },
  {
    id: "rilakkuma",
    brand: "Rilakkuma",
    aliases: ["rilakkuma", "san-x", "sanx", "relax bear", "relaxed bear"],
    characters: [
      { id: "rilakkuma", name: "Rilakkuma", aliases: ["rilakuma"] },
      { id: "korilakkuma", name: "Korilakkuma", aliases: ["kori rilakkuma"] },
      { id: "kiiroitori", name: "Kiiroitori", aliases: ["kiiroi tori"] },
    ],
    colorMarkers: ["brown bear", "lazy bear", "cream bear"],
  },
  {
    id: "miffy",
    brand: "Miffy",
    aliases: ["miffy", "nijntje"],
    characters: [{ id: "miffy", name: "Miffy", aliases: ["nijntje"] }],
    colorMarkers: ["white rabbit", "line-art bunny"],
  },
  {
    id: "tamagotchi",
    brand: "Tamagotchi",
    aliases: ["tamagotchi"],
    characters: [{ id: "tamagotchi", name: "Tamagotchi" }],
    colorMarkers: ["digital pet", "vintage toy"],
  },
  {
    id: "chiikawa",
    brand: "Chiikawa",
    aliases: ["chiikawa", "chikawa"],
    characters: [
      { id: "chiikawa", name: "Chiikawa" },
      { id: "hachiware", name: "Hachiware" },
      { id: "usagi", name: "Usagi" },
    ],
    colorMarkers: ["tiny white creature"],
  },
  {
    id: "peanuts",
    brand: "Peanuts",
    aliases: ["peanuts"],
    characters: [
      { id: "snoopy", name: "Snoopy" },
      { id: "woodstock", name: "Woodstock" },
    ],
    colorMarkers: ["white beagle"],
  },
  {
    id: "disney",
    brand: "Disney",
    aliases: ["disney"],
    characters: [
      { id: "mickey-mouse", name: "Mickey Mouse", aliases: ["mickey"] },
      { id: "minnie-mouse", name: "Minnie Mouse", aliases: ["minnie"] },
      { id: "stitch", name: "Stitch", aliases: ["lilo and stitch"] },
      { id: "winnie-the-pooh", name: "Winnie the Pooh", aliases: ["pooh"] },
    ],
    colorMarkers: ["mouse ears", "blue alien"],
  },
  {
    id: "pokemon",
    brand: "Pokémon",
    aliases: ["pokemon"],
    characters: [
      { id: "pikachu", name: "Pikachu" },
      { id: "eevee", name: "Eevee" },
      { id: "snorlax", name: "Snorlax" },
    ],
    colorMarkers: ["yellow mouse", "sleepy blue creature"],
  },
  {
    id: "care-bears",
    brand: "Care Bears",
    aliases: ["care bears", "carebear", "carebears"],
    characters: [{ id: "care-bears", name: "Care Bears" }],
    colorMarkers: ["pastel bear", "belly badge"],
  },
  {
    id: "crayon-shin-chan",
    brand: "Crayon Shin-chan",
    aliases: ["crayon shin chan", "shin chan", "shinchan"],
    characters: [{ id: "shin-chan", name: "Shin-chan", aliases: ["shin chan"] }],
    colorMarkers: ["cartoon boy"],
  },
  {
    id: "toy-story",
    brand: "Toy Story",
    aliases: ["toy story"],
    characters: [
      { id: "woody", name: "Woody" },
      { id: "buzz-lightyear", name: "Buzz Lightyear" },
      { id: "jessie", name: "Jessie" },
    ],
    colorMarkers: ["cowboy", "space ranger"],
  },
  {
    id: "spongebob-squarepants",
    brand: "SpongeBob SquarePants",
    aliases: ["spongebob squarepants", "spongebob", "sponge bob"],
    characters: [
      { id: "spongebob", name: "SpongeBob", aliases: ["sponge bob"] },
      { id: "patrick-star", name: "Patrick Star" },
    ],
    colorMarkers: ["yellow sponge"],
  },
  {
    id: "monchhichi",
    brand: "Monchhichi",
    aliases: ["monchhichi", "monchichi"],
    characters: [{ id: "monchhichi", name: "Monchhichi" }],
    colorMarkers: ["monkey doll"],
  },
];

/**
 * Values that occupy the brand column but are not an IP at all.
 *
 * Scraped listings carry the seller's own store or factory name where a
 * character belongs, and an early importer wrote it straight through: more than
 * half this catalogue's brand column held "Y2CASE", "JOYNOVA" or similar. They
 * are worth naming rather than merely failing to resolve, because the two mean
 * different things to an operator. "Not in the registry" invites you to add it;
 * "that's your own shop name" tells you to clear the field.
 *
 * Matching is on the normalised form, so spacing and case do not matter.
 */
const NON_IP_TERMS: readonly string[] = [
  "y2case",
  "y2kase",
  "joynova",
  "joy nova",
  "zoozoo",
  "zoo zoo",
  "hield",
  "twinkle twinkle",
  // Toy conglomerates that publish under many IPs. Accurate as a manufacturer,
  // useless as a classification: nothing browses by "Bandai".
  "bandai",
  "takara tomy",
  "no brand",
  "generic",
  "oem",
  "custom",
];

const NON_IP_KEYS = new Set(NON_IP_TERMS.map((t) => ` ${t} `));

/**
 * True when a stored brand value is a seller/manufacturer label rather than a
 * character or franchise. Used by the admin to explain an unresolvable value.
 */
export function isNonIpBrandValue(value: string | null | undefined): boolean {
  const key = value ? normalizeText(value) : "";
  if (key === "" || !NON_IP_KEYS.has(key)) return false;
  // A term that also resolves to a real registry entry is an alias, not noise.
  // Belt and braces: the registry is the authority on what counts as an IP.
  return !resolveBrandAssignment(value, null).ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalisation
//
// Everything — haystacks and aliases alike — is folded to lowercase ASCII words
// wrapped in a single leading/trailing space. `hay.includes(needle)` is then a
// whole-word test with no regex construction per lookup, and supplier folder
// names written in Chinese collapse to nothing rather than matching by accident.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeText(value: string): string {
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ascii ? ` ${ascii} ` : "";
}

/** The lookup key for an exact (non-fuzzy) name/id/alias match. */
function exactKey(value: string | null | undefined): string {
  return value ? normalizeText(value) : "";
}

type RegistryTerm = {
  /** Space-padded, normalised matcher. */
  needle: string;
  /** The term as written in the registry — surfaced as classification evidence. */
  label: string;
  brand: BrandKnowledge;
  /** Null for brand-level terms. */
  character: CharacterKnowledge | null;
};

function termsFor(brand: BrandKnowledge): RegistryTerm[] {
  const out: RegistryTerm[] = [];
  const push = (
    label: string,
    character: CharacterKnowledge | null,
  ): void => {
    const needle = normalizeText(label);
    if (needle) out.push({ needle, label, brand, character });
  };

  push(brand.brand, null);
  for (const alias of brand.aliases ?? []) push(alias, null);
  for (const character of brand.characters ?? []) {
    push(character.name, character);
    for (const alias of character.aliases ?? []) push(alias, character);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The active registry
//
// {@link BRAND_KNOWLEDGE} is the canon: version-controlled, reviewable, and the
// vocabulary the guard suite runs against without a database. But a catalogue
// meets new IP faster than it ships releases — a Sumikko Gurashi case cannot
// wait for a deploy to become classifiable — so operators can define brands and
// characters at runtime too.
//
// Those live in the `collections` table (a brand IS a browse node; see
// `./brand-registry`) and are merged over the canon here. The merge is additive:
// a runtime entry can extend a built-in with new characters or spellings, and
// can introduce entirely new brands, but it can never delete canon. Nothing is
// loaded means nothing is lost — the registry simply falls back to the canon,
// which is the behaviour that shipped before any of this existed.
//
// Every lookup below reads `active`, so all of them stay synchronous. That is
// deliberate: `./listing-title` is pure and I/O-free by contract, and turning
// this async would make composing a title an awaitable operation everywhere.
// ─────────────────────────────────────────────────────────────────────────────

type CompiledRegistry = {
  entries: BrandKnowledge[];
  terms: RegistryTerm[];
  brandByKey: Map<string, BrandKnowledge>;
  characterByKey: Map<
    string,
    { brand: BrandKnowledge; character: CharacterKnowledge }
  >;
};

function compileRegistry(entries: BrandKnowledge[]): CompiledRegistry {
  const brandByKey = new Map<string, BrandKnowledge>();
  const characterByKey = new Map<
    string,
    { brand: BrandKnowledge; character: CharacterKnowledge }
  >();

  for (const brand of entries) {
    for (const key of [brand.id, brand.brand, ...(brand.aliases ?? [])]) {
      const k = exactKey(key);
      if (k && !brandByKey.has(k)) brandByKey.set(k, brand);
    }
    for (const character of brand.characters ?? []) {
      for (const key of [
        character.id,
        character.name,
        ...(character.aliases ?? []),
      ]) {
        const k = exactKey(key);
        if (k && !characterByKey.has(k)) {
          characterByKey.set(k, { brand, character });
        }
      }
    }
  }

  return {
    entries,
    terms: entries.flatMap(termsFor),
    brandByKey,
    characterByKey,
  };
}

/**
 * Fold runtime entries onto the canon.
 *
 * Same brand id ⇒ the two are the same brand: aliases and characters are
 * unioned rather than replaced, so extending Sanrio with a new character cannot
 * cost it the ones already in code. A renamed brand keeps its canon name as an
 * alias, because `products.brand_name` rows written under the old name have to
 * keep resolving.
 */
export function mergeBrandRegistries(
  canon: readonly BrandKnowledge[],
  overlay: readonly BrandKnowledge[],
): BrandKnowledge[] {
  const byId = new Map<string, BrandKnowledge>(
    canon.map((brand) => [brand.id, brand]),
  );

  for (const incoming of overlay) {
    const base = byId.get(incoming.id);
    if (!base) {
      byId.set(incoming.id, incoming);
      continue;
    }

    const renamed = incoming.brand !== base.brand;
    byId.set(incoming.id, {
      ...base,
      brand: incoming.brand,
      aliases: union([
        ...(base.aliases ?? []),
        ...(incoming.aliases ?? []),
        // A rename must not orphan rows stored under the previous name.
        ...(renamed ? [base.brand] : []),
      ]),
      characters: mergeCharacters(
        base.characters ?? [],
        incoming.characters ?? [],
      ),
    });
  }

  return [...byId.values()];
}

function mergeCharacters(
  canon: readonly CharacterKnowledge[],
  overlay: readonly CharacterKnowledge[],
): CharacterKnowledge[] {
  const byId = new Map<string, CharacterKnowledge>(
    canon.map((character) => [character.id, character]),
  );
  for (const incoming of overlay) {
    const base = byId.get(incoming.id);
    if (!base) {
      byId.set(incoming.id, incoming);
      continue;
    }
    const renamed = incoming.name !== base.name;
    byId.set(incoming.id, {
      ...base,
      name: incoming.name,
      aliases: union([
        ...(base.aliases ?? []),
        ...(incoming.aliases ?? []),
        ...(renamed ? [base.name] : []),
      ]),
    });
  }
  return [...byId.values()];
}

/** De-duplicate case-insensitively, keeping first-seen spelling and order. */
function union(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = exactKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const CANON = compileRegistry(BRAND_KNOWLEDGE);
let active: CompiledRegistry = CANON;

/**
 * Replace the active registry with the canon plus these runtime entries.
 *
 * Idempotent and cheap — the vocabulary is a few dozen terms — so callers may
 * run it once per request without a second thought.
 */
export function installBrandRegistry(overlay: readonly BrandKnowledge[]): void {
  active =
    overlay.length === 0
      ? CANON
      : compileRegistry(mergeBrandRegistries(BRAND_KNOWLEDGE, overlay));
}

/** Drop back to the built-in canon. Used by tests and by the guard suite. */
export function resetBrandRegistry(): void {
  active = CANON;
}

/** Every brand currently classifiable — canon plus whatever was installed. */
export function activeBrandKnowledge(): readonly BrandKnowledge[] {
  return active.entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────

/** The registry entry for a brand id, or null. */
export function brandById(id: string): BrandKnowledge | null {
  return active.entries.find((b) => b.id === id) ?? null;
}

/** The registry entry for a character id, with its owning brand. */
export function characterById(
  id: string,
): { brand: BrandKnowledge; character: CharacterKnowledge } | null {
  for (const brand of active.entries) {
    const character = brand.characters?.find((c) => c.id === id);
    if (character) return { brand, character };
  }
  return null;
}

/**
 * Every spelling that identifies a brand, longest first.
 *
 * Exposed so a superseded IP can be found and lifted out of existing prose:
 * when an operator reclassifies a case from Hello Kitty to Kuromi, the title
 * still says "Hello Kitty", and removing it means knowing that "hellokitty" and
 * "kitty white" name the same thing. Longest first so a caller replacing terms
 * one at a time consumes "Hello Kitty" before the shorter aliases can bite into
 * it and leave a fragment behind.
 */
export function brandTerms(id: string): string[] {
  const brand = brandById(id);
  if (!brand) return [];
  return byLengthDesc([brand.brand, ...(brand.aliases ?? [])]);
}

/** Every spelling that identifies a character, longest first. */
export function characterTerms(id: string): string[] {
  const owner = characterById(id);
  if (!owner) return [];
  return byLengthDesc([owner.character.name, ...(owner.character.aliases ?? [])]);
}

function byLengthDesc(terms: string[]): string[] {
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

export type BrandResolution =
  | { ok: true; brand: BrandKnowledge; character: CharacterKnowledge | null }
  | { ok: false; reason: string };

/**
 * Resolve a (brand, character) pair — however it was written — onto canonical
 * registry entries. This is the validation boundary for everything that can
 * name a brand: the operator's dropdown, the vision model's answer, and rows
 * written by older versions of the classifier.
 *
 * Accepts ids, display names and aliases, and folds a legacy character-as-brand
 * value (`brand: "Hello Kitty"`) back onto `Sanrio` + `Hello Kitty`.
 */
export function resolveBrandAssignment(
  brandInput: string | null | undefined,
  characterInput?: string | null,
): BrandResolution {
  const brandKey = exactKey(brandInput);
  const characterKey = exactKey(characterInput);
  if (!brandKey && !characterKey) {
    return { ok: false, reason: "No brand or character provided." };
  }

  let brand = brandKey ? (active.brandByKey.get(brandKey) ?? null) : null;
  let character: CharacterKnowledge | null = null;

  // A character name in the brand slot is legacy data, not an error.
  if (!brand && brandKey) {
    const viaCharacter = active.characterByKey.get(brandKey);
    if (viaCharacter) {
      brand = viaCharacter.brand;
      character = viaCharacter.character;
    }
  }
  // Brand omitted entirely: the character implies it.
  if (!brand && characterKey) {
    const viaCharacter = active.characterByKey.get(characterKey);
    if (viaCharacter) {
      brand = viaCharacter.brand;
      character = viaCharacter.character;
    }
  }
  if (!brand) {
    return {
      ok: false,
      reason: `"${brandInput ?? characterInput}" is not in the brand registry.`,
    };
  }

  if (characterKey) {
    const owner = active.characterByKey.get(characterKey);
    if (!owner) {
      return {
        ok: false,
        reason: `"${characterInput}" is not a known character.`,
      };
    }
    if (owner.brand !== brand) {
      return {
        ok: false,
        reason: `${owner.character.name} belongs to ${owner.brand.brand}, not ${brand.brand}.`,
      };
    }
    character = owner.character;
  }

  return { ok: true, brand, character };
}

/**
 * The brand a free-text blob is about, or null. Kept for callers that only need
 * the entry (e.g. prompt building); prefer {@link classifyBrandContext} when
 * the character and the confidence matter too.
 */
export function findBrandKnowledge(
  text: string | null | undefined,
): BrandKnowledge | null {
  if (!text) return null;
  const hay = normalizeText(text);
  if (!hay) return null;
  const hits = active.terms.filter((t) => hay.includes(t.needle));
  return bestTerm(hits)?.brand ?? null;
}

/** Longest match wins; a character term beats a brand term of the same length. */
function bestTerm(hits: RegistryTerm[]): RegistryTerm | null {
  let best: RegistryTerm | null = null;
  for (const hit of hits) {
    if (
      !best ||
      hit.needle.length > best.needle.length ||
      (hit.needle.length === best.needle.length && hit.character && !best.character)
    ) {
      best = hit;
    }
  }
  return best;
}

/**
 * Classify free-text signals (title, supplier folder, tags…) into the registry.
 *
 * The verdict is only as strong as the evidence: a matched character term is
 * "high", a distinctive brand term alone is "medium", a short brand term alone
 * is "low". A character is *never* invented to fill the field.
 */
export function classifyBrandContext(
  textParts: Array<string | null | undefined>,
): BrandClassification {
  const hay = normalizeText(textParts.filter(Boolean).join(" "));
  if (!hay) return EMPTY_BRAND_CLASSIFICATION;

  const hits = active.terms.filter((t) => hay.includes(t.needle));
  const best = bestTerm(hits);
  if (!best) return EMPTY_BRAND_CLASSIFICATION;

  const brand = best.brand;
  const ownHits = hits.filter((t) => t.brand === brand);
  const character = bestTerm(ownHits.filter((t) => t.character))?.character ?? null;

  // `needle` carries the two padding spaces; the term itself is what we score.
  const longestTerm = Math.max(...ownHits.map((t) => t.needle.length - 2));
  const confidence: BrandConfidence = character
    ? "high"
    : longestTerm >= 6
      ? "medium"
      : "low";

  return {
    brand: brand.brand,
    character: character?.name ?? null,
    brandId: brand.id,
    characterId: character?.id ?? null,
    confidence,
    evidence: [...new Set(ownHits.map((t) => t.label))].slice(0, 6),
  };
}

export function inferBrandName(
  textParts: Array<string | null | undefined>,
): string | null {
  return classifyBrandContext(textParts).brand;
}

export function inferCharacterName(
  textParts: Array<string | null | undefined>,
): string | null {
  return classifyBrandContext(textParts).character;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-facing projection
// ─────────────────────────────────────────────────────────────────────────────

/** One selectable brand, with its characters, for the admin picker. */
export type BrandOption = {
  id: string;
  name: string;
  characters: { id: string; name: string }[];
  /** Extra spellings that classify into this brand, for the manager UI. */
  aliases: string[];
  /**
   * True when this entry came from `collections-config.ts` rather than an
   * operator. Canon is editable but never deletable — the guard suite and the
   * pure title contract both run against it without a database.
   */
  builtIn: boolean;
};

/**
 * The registry as a plain, serialisable list for client components.
 *
 * The reassignment card used to carry a hand-maintained copy of this data so it
 * could render without a round-trip; it had already drifted from the server.
 * Passing this down from the server component keeps exactly one source.
 */
export function listBrandOptions(): BrandOption[] {
  const canonIds = new Set(BRAND_KNOWLEDGE.map((brand) => brand.id));
  return active.entries
    .map((brand) => ({
      id: brand.id,
      name: brand.brand,
      characters: (brand.characters ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      })),
      aliases: [...(brand.aliases ?? [])],
      builtIn: canonIds.has(brand.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** True when this brand id is defined in source control rather than by an operator. */
export function isBuiltInBrand(id: string): boolean {
  return BRAND_KNOWLEDGE.some((brand) => brand.id === id);
}

/** True when this character id is defined in source control. */
export function isBuiltInCharacter(id: string): boolean {
  return BRAND_KNOWLEDGE.some((brand) =>
    (brand.characters ?? []).some((character) => character.id === id),
  );
}
