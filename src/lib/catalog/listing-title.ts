/**
 * The listing-title contract: what a title must say, in what order, and which
 * parts of it a model is allowed to write.
 *
 * ── Why this is code and not a prompt ───────────────────────────────────────
 * A title used to be one opaque string, produced once by a creative model call
 * at ingest and never revisited. But the two highest-intent terms in a title are
 * facts we already hold — and asking a model to restate a fact you own is asking
 * it to get the fact wrong. Both failure modes are in the live catalogue:
 *
 *   • The IP. The registry knows a product is Rilakkuma; the model looked at the
 *     photo and wrote "Mint Green Kawaii Bear". Shoppers search the character
 *     name, so the listing is unfindable by the one term that would sell it.
 *   • Device fit. The copy prompt hard-coded a model list every phone case was
 *     told to repeat, and the model embellished from there — a listing shipped
 *     reading "iPhone 13-19 Pro Max" for a product sold only for 15/16/17.
 *     Inventing a generation the product is not sold for is a false
 *     compatibility claim on a live storefront, and it is systematic rather
 *     than a one-off.
 *
 * So the composed segments come from data — the brand registry supplies the IP,
 * the product-type registry the noun, the product's own `iPhone Model` option
 * the coverage, and the independently verified MagSafe flag the suffix. A model
 * contributes only the descriptive phrase that tells this case apart from the
 * other forty Rilakkuma cases.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 *   <IP> <Descriptor> <Noun> for <Device coverage> — MagSafe
 *   Rilakkuma Mint Green Kawaii Bear Phone Case for iPhone 17 16 15 Pro Max
 *
 * Ordered by search intent, strongest first: the character is the query, the
 * descriptor is the qualifier, the device is the filter. Marketplace search and
 * Google both weight leading terms and both truncate, so whatever the budget
 * gives up has to be the least valuable thing in the string — which is only
 * knowable if the ordering is fixed.
 *
 * ── Repair is deterministic and free ────────────────────────────────────────
 * {@link repairListingTitle} does not rebuild a title from a bag of words; it
 * strips the segments we own off the ends, keeps the operator's/model's prose
 * spine verbatim, and re-emits the owned segments from current facts. Fixing a
 * wrong device range or a missing character therefore costs no model call at
 * all. The AI path exists for the narrower case of a title with no usable prose.
 *
 * Pure and I/O-free: every rule here is asserted in `npm run check:guards`.
 */
import { IPHONE_GENERATIONS, type IphoneGeneration } from "@/lib/pricing";
import { getProductType } from "@/lib/catalog/product-types";
import {
  MAGSAFE_TITLE_SUFFIX,
  removeMagSafeCopy,
} from "@/lib/catalog/magsafe";
import { findForbiddenScript } from "@/lib/catalog/copy-schema";
import {
  brandTerms,
  characterTerms,
  classifyBrandContext,
  resolveBrandAssignment,
} from "@/lib/catalog/brands";

/**
 * Hard cap, matching `coerceProductCopy`'s clamp so an AI-written title and a
 * composed one are held to the same length.
 */
export const LISTING_TITLE_MAX = 140;

/** Below this a title carries no useful search terms. */
export const LISTING_TITLE_MIN = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Device coverage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The generation numerals a set of models implies, newest first.
 *
 * Derived from {@link IPHONE_GENERATIONS} rather than written out, because one
 * mould can fit two phones: the 13/14 generation's base model is literally
 * `"iPhone 14 / 13"`, so a title covering it may legitimately name both.
 */
function generationNumerals(gen: IphoneGeneration): string[] {
  const seen = new Set<string>();
  for (const model of gen.models) {
    for (const numeral of model.match(/\d+/g) ?? []) seen.add(numeral);
  }
  return [...seen].sort((a, b) => Number(b) - Number(a));
}

function generationsCovering(models: readonly string[]): IphoneGeneration[] {
  const offered = new Set(models);
  return IPHONE_GENERATIONS.filter((gen) =>
    gen.models.some((model) => offered.has(model)),
  );
}

/** The generation numerals a set of offered models may truthfully claim. */
export function claimableGenerations(models: readonly string[]): string[] {
  return [
    ...new Set(generationsCovering(models).flatMap(generationNumerals)),
  ].sort((a, b) => Number(b) - Number(a));
}

/**
 * The device-fit phrase for a set of offered models — e.g.
 * `"iPhone 18 17 16 15 Pro Max"`. Null when the product is sold for no model.
 *
 * Newest generation first: demand for a generation peaks at launch and decays,
 * so the newest numeral is both the most valuable token in the segment and the
 * one most likely to survive a search engine's truncation.
 *
 * The `Pro` / `Pro Max` qualifier reads as a promise about every numeral listed
 * before it, so it is appended only when every covered generation really does
 * offer that tier. Claiming less than we sell costs a little reach; claiming
 * more sells someone a case that will not fit their phone.
 */
export function deviceCoveragePhrase(
  models: readonly string[],
): string | null {
  const covered = generationsCovering(models);
  if (covered.length === 0) return null;

  const offered = new Set(models);
  // `every` on an empty list is vacuously true, so a generation with no models
  // at this tier must be excluded explicitly — otherwise a future generation
  // shipped without a Pro Max would silently license the claim for all of them.
  const tierOfferedEverywhere = (tier: RegExp): boolean =>
    covered.every((gen) => {
      const atTier = gen.models.filter((model) => tier.test(model));
      return atTier.length > 0 && atTier.every((model) => offered.has(model));
    });

  const qualifier = tierOfferedEverywhere(/Pro Max$/)
    ? " Pro Max"
    : tierOfferedEverywhere(/Pro$/)
      ? " Pro"
      : "";

  const numerals = [...covered].reverse().flatMap(generationNumerals).join(" ");
  return `iPhone ${numerals}${qualifier}`;
}

/**
 * The product noun a title should use.
 *
 * Phone cases are the exception: the coverage segment already opens with
 * "iPhone", so the registry label would stutter — "iPhone Case for iPhone 17".
 * Every other type uses its registry label verbatim, so adding a product type
 * needs no change here.
 */
export function listingNoun(productTypeId: string): string {
  const type = getProductType(productTypeId);
  return type.id === "iphone_case" ? "Phone Case" : type.label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition
// ─────────────────────────────────────────────────────────────────────────────

/** Everything a title is composed from. Only the descriptor comes from a model. */
export type ListingTitleFacts = {
  /**
   * The intellectual property this product depicts, already resolved against
   * the brand registry. Prefer the character over the brand: a shopper searches
   * the face ("Korilakkuma"), not the rights holder ("San-X").
   */
  ip: string | null;
  /**
   * The product's OTHER text signals — its tags and its source folder.
   *
   * Used to decide whether {@link ip} is corroborated well enough to be written
   * into a title. The brand columns are not self-evidently right: the catalogue
   * contains Tamagotchi cases classified as Hello Kitty and a Stitch case
   * classified as Mickey Mouse, all at "high" confidence, from an older
   * classifier. Prefixing a title with an uncorroborated classification would
   * promote a quiet data error into a customer-visible one, so it is reported
   * instead. See {@link ipVerdict}.
   */
  ipEvidence?: readonly string[];
  /**
   * True when a human explicitly confirmed this classification, rather than a
   * classifier inferring it.
   *
   * An operator looking at the photographs is the strongest evidence the system
   * has, and it has to outrank the absence of a keyword: a Rilakkuma case whose
   * supplier titled it "Mint Green Kawaii Bear" carries the word nowhere in its
   * own text, so no amount of re-reading the tags will ever corroborate it.
   * Without this the contract would refuse forever to put the term shoppers
   * actually search for into the title.
   */
  ipConfirmed?: boolean;
  productTypeId: string;
  /** The product's offered device models — its `iPhone Model` option values. */
  models: readonly string[];
  /** The verified MagSafe classification. Never a model's provisional guess. */
  magsafe: boolean;
};

export type ComposedTitle = {
  title: string;
  /** Owned segments the length budget forced out, in the order dropped. */
  dropped: string[];
};

/**
 * The IP a product's stored brand columns amount to, for use as {@link
 * ListingTitleFacts.ip}.
 *
 * Resolving through the registry rather than reading `character_name` raw also
 * folds legacy rows that put a character in the brand column, and drops values
 * that no longer name anything we sell — a title should never lead with a brand
 * the browse tree has never heard of.
 */
export function listingIp(
  brandName: string | null | undefined,
  characterName: string | null | undefined,
): string | null {
  const resolved = resolveBrandAssignment(brandName, characterName);
  if (resolved.ok) return resolved.character?.name ?? resolved.brand.brand;
  // A character we cannot place should not hide a brand we can.
  const brandOnly = resolveBrandAssignment(brandName, null);
  return brandOnly.ok ? brandOnly.brand.brand : null;
}

type IpIdentity = {
  /** The display name: the character when one is named, else the brand. */
  ip: string | null;
  brandId: string | null;
  characterId: string | null;
};

/** Resolve an IP display name back onto registry ids. */
function identityOf(ip: string | null | undefined): IpIdentity {
  const resolved = resolveBrandAssignment(ip, null);
  return resolved.ok
    ? {
        ip: resolved.character?.name ?? resolved.brand.brand,
        brandId: resolved.brand.id,
        characterId: resolved.character?.id ?? null,
      }
    : { ip: null, brandId: null, characterId: null };
}

/** The IP a blob of text reads as — a character when named, else the brand. */
function identityOfText(
  values: readonly (string | null | undefined)[],
): IpIdentity {
  const found = classifyBrandContext([...values]);
  return {
    ip: found.character ?? found.brand,
    brandId: found.brandId,
    characterId: found.characterId,
  };
}

/**
 * How the stored classification stands in relation to the title.
 *
 * The distinction matters because each verdict wants a different action, and
 * lumping them together is how an automated repair ends up publishing a wrong
 * character:
 *
 *   present    — the title already names it. Nothing to do.
 *   conflict   — the title names a DIFFERENT registry brand, and nobody has
 *                confirmed the classification. The two disagree and only a
 *                human (or a fresh look at the photos) can say which is right,
 *                so the prose is left exactly as it is.
 *   replace    — the title names a different registry brand, but a human HAS
 *                confirmed the classification. That settles it: the title is
 *                the stale side, so the superseded name is lifted out of the
 *                prose and the confirmed one takes its place.
 *   unverified — the title names no brand, and neither the tags nor the source
 *                folder support the stored one either. Adding it would be a
 *                guess dressed up as a fact.
 *   addable    — the stored classification is corroborated by the product's own
 *                text and the title simply omits it. Safe to prepend.
 *
 * The `conflict`/`replace` split is the whole reason an operator can fix a
 * mislabelled listing at all. Reclassifying a case from Hello Kitty to Kuromi
 * used to leave the title reading "Hello Kitty" with no way forward: repair
 * refused to touch a disputed title, so the bulk fix skipped the row and the
 * storefront kept advertising the wrong character indefinitely.
 */
export type IpVerdict =
  | "none"
  | "present"
  | "conflict"
  | "replace"
  | "unverified"
  | "addable";

export function ipVerdict(title: string, facts: ListingTitleFacts): IpVerdict {
  if (!facts.ip) return "none";
  if (mentions(title, facts.ip)) return "present";

  const stored = identityOf(facts.ip);
  const fromTitle = identityOfText([title]);

  // Same brand but a different character — e.g. "My Melody" in the title on a
  // row classified "Hello Kitty" — is as much a disagreement as a different
  // brand. A title naming only the umbrella brand is not: it is less specific,
  // not wrong.
  const disagrees =
    (fromTitle.brandId !== null && fromTitle.brandId !== stored.brandId) ||
    (fromTitle.characterId !== null &&
      fromTitle.characterId !== stored.characterId);

  if (disagrees) return facts.ipConfirmed ? "replace" : "conflict";

  // A human's decision is corroboration in its own right — the one form of it
  // that need not appear in the product's own text.
  if (facts.ipConfirmed) return "addable";

  return identityOfText(facts.ipEvidence ?? []).ip === facts.ip
    ? "addable"
    : "unverified";
}

/**
 * Remove the IP a title currently names, when a confirmed classification has
 * superseded it.
 *
 * Only the terms that are actually wrong go: reclassifying Hello Kitty →
 * Kuromi drops the character spellings but keeps "Sanrio", which is still true
 * of the product. Reclassifying Hello Kitty → Miffy drops both, because the
 * whole identity changed. Anything else is prose the operator wrote and repair
 * has no business touching.
 */
function stripSupersededIp(text: string, facts: ListingTitleFacts): string {
  const stored = identityOf(facts.ip);
  const fromTitle = identityOfText([text]);

  const terms: string[] = [];
  if (fromTitle.characterId && fromTitle.characterId !== stored.characterId) {
    terms.push(...characterTerms(fromTitle.characterId));
  }
  if (fromTitle.brandId && fromTitle.brandId !== stored.brandId) {
    terms.push(...brandTerms(fromTitle.brandId));
  }

  let out = text;
  for (const term of terms) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi"), " ");
  }
  return tidy(out);
}

/** Collapse whitespace and shed dangling separators left by a removal. */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s,;:·|—–-]+/, "")
    .replace(/[\s,;:·|—–-]+$/, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Any spelling of a MagSafe mention. Mirrors the matcher in `./magsafe`. */
const MAGSAFE_MENTION = /mag\s?-?safe/i;

function mentions(text: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(text);
}

/**
 * Words that already do the noun's job.
 *
 * The noun exists so the title says what the thing *is*. A head reading "Chef
 * 360° Foldable Ring Case" already does, and appending the canonical noun to it
 * produces "Ring Case Phone Case" — so the test is for the category word, not
 * the exact label. Only "case" gets synonyms: a beaded strap is not a watch
 * band, so treating "strap" as one would mislabel half the charm catalogue.
 */
const NOUN_SYNONYMS: Record<string, string[]> = {
  case: ["case", "cover", "shell"],
};

/** True when the head already names the product category. */
function headNamesProduct(head: string, noun: string): boolean {
  const category = (noun.split(" ").pop() ?? noun).toLowerCase();
  const accepted = NOUN_SYNONYMS[category] ?? [category];
  return accepted.some((word) => mentions(head, word));
}

/** Truncate at a word boundary rather than mid-word. */
function clampWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * The prose spine of a title: the IP, the descriptive phrase and the product
 * noun, with no device claim and no MagSafe claim.
 *
 * Assembled rather than trusted — a head that has lost its IP or its noun is
 * repaired here, which is what lets {@link repairListingTitle} put a missing
 * character back onto an existing title without touching the rest of it.
 */
function normalizeHead(head: string, facts: ListingTitleFacts): string {
  let out = tidy(head);
  const noun = listingNoun(facts.productTypeId);
  if (!out) out = noun;
  else if (!headNamesProduct(out, noun)) out = `${out} ${noun}`;

  // A confirmed classification outranks a name the prose inherited from an
  // earlier one. Lift the superseded term out first, which turns the verdict
  // from `replace` into `addable` and lets the single prepend below serve both.
  if (ipVerdict(out, facts) === "replace") {
    out = stripSupersededIp(out, facts);
    // The strip can leave nothing but the descriptor, or nothing at all.
    if (!out) out = noun;
    else if (!headNamesProduct(out, noun)) out = `${out} ${noun}`;
  }

  // Only a corroborated classification is written into the prose — see
  // {@link ipVerdict} for why "the brand column says so" is not enough.
  if (facts.ip && ipVerdict(out, facts) === "addable") {
    out = `${facts.ip} ${out}`;
  }
  return tidy(out);
}

/**
 * Assemble a full title from a prose head plus the owned segments, inside the
 * length budget.
 *
 * Over budget, the owned segments are given up in a fixed order — the `Pro Max`
 * tier qualifier first, then the device claim entirely, and only then is the
 * head clamped at a word boundary. The IP, the noun and a verified MagSafe
 * suffix are never dropped: they are the terms the listing exists to be found
 * by, and the one claim we are obliged to make.
 */
export function composeListingTitle(
  head: string,
  facts: ListingTitleFacts,
): ComposedTitle {
  const spine = normalizeHead(head, facts);
  // A head that already works MagSafe into its prose ("with MagSafe Star
  // Stand") has made the claim; appending the suffix as well would say it
  // twice, and rewriting the phrase would cost the operator's own wording.
  const suffix =
    facts.magsafe && !MAGSAFE_MENTION.test(spine) ? MAGSAFE_TITLE_SUFFIX : "";
  const dropped: string[] = [];

  const build = (device: string | null): string =>
    `${spine}${device ? ` for ${device}` : ""}${suffix}`;

  let device = deviceCoveragePhrase(facts.models);

  if (device && build(device).length > LISTING_TITLE_MAX) {
    const bare = device.replace(/ Pro( Max)?$/, "");
    if (bare !== device) {
      dropped.push(device.slice(bare.length).trim());
      device = bare;
    }
  }
  if (device && build(device).length > LISTING_TITLE_MAX) {
    dropped.push(device);
    device = null;
  }

  const title = build(device);
  return {
    title:
      title.length > LISTING_TITLE_MAX
        ? clampWords(title, LISTING_TITLE_MAX)
        : title,
    dropped,
  };
}

/** Build a head from a model-authored descriptor: `<IP> <Descriptor> <Noun>`. */
export function headFromDescriptor(
  descriptor: string,
  facts: ListingTitleFacts,
): string {
  return normalizeHead(
    [facts.ip, sanitizeDescriptor(descriptor, facts)].filter(Boolean).join(" "),
    facts,
  );
}

/**
 * Clean a model-authored descriptor down to only what it is allowed to say.
 *
 * Every other segment is composed from data, so a descriptor that also names
 * the character, the device or MagSafe adds no information — it duplicates it
 * from a less reliable source. Stripping here rather than trusting the prompt
 * means a chatty model degrades to a shorter title instead of a wrong one.
 */
export function sanitizeDescriptor(
  raw: string | null | undefined,
  facts: Pick<ListingTitleFacts, "ip" | "productTypeId">,
): string {
  if (!raw) return "";
  let out = ` ${raw} `;
  if (facts.ip) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(facts.ip)}\\b`, "gi"), " ");
  }
  out = stripDeviceClaims(out)
    // Stricter than the title strip: a descriptor has no legitimate reason to
    // carry a bare model number or the word "case" either.
    .replace(/\bpro\s*max\b/gi, " ")
    .replace(/\bmag\s?-?safe\b/gi, " ")
    .replace(/\b(1[0-9]|2[0-5])\b/g, " ")
    .replace(/\b(phone\s+)?(cases?|covers?)\b/gi, " ")
    // Mood words the model loves and that make every title sound the same.
    .replace(
      /\b(cute|kawaii|y2k|aesthetic|trendy|lovely|adorable|sweet|stylish|unique|premium)\b/gi,
      " ",
    );
  return tidy(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic repair
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One device claim, wherever it sits: "for iPhone 15/16/17 Series", "Compatible
 * with iPhone 13-19 Pro Max", or a bare "iPhone 18 17 16 15 Pro Max" wedged into
 * the middle of a sentence — which the old copy prompt produced routinely.
 *
 * Bounded rather than "everything from here to the end" on purpose. Cutting to
 * the end is simpler and was wrong: on "Miffy Sparkle Bunny iPhone 17 16 15 14
 * 13 Pro Max Case | Y2K Cute Kawaii Star Phone Case" it threw away every
 * keyword after the claim. Repair exists to keep the prose.
 */
const DEVICE_CLAIM =
  /\s*(?:[-—–|,]\s*)?(?:\b(?:compatible\s+with|fits|for)\s+)?(?:the\s+)?\biphone\b[\s\d/,&+–—-]*(?:\b(?:pro\s*max|pro|plus|mini|max|series)\b[\s/,&+-]*)*/gi;

/**
 * A trailing model list whose "iPhone" was consumed by an earlier match — e.g.
 * "…iPhone Case for 17 16 15 14 13 Pro Max", where the first strip takes the
 * word and leaves the numbers behind still making the claim.
 */
const ORPHAN_DEVICE_TAIL =
  /\s*(?:[-—–|,]\s*)?\b(?:compatible\s+with|fits|for)\s+(?:the\s+)?\d{2}[\s\d/,&+–—-]*(?:\b(?:pro\s*max|pro|plus|mini|max|series)\b[\s/,&+-]*)*$/i;

/** Remove every device claim from a title, leaving the rest of the prose. */
function stripDeviceClaims(text: string): string {
  return text.replace(DEVICE_CLAIM, " ").replace(ORPHAN_DEVICE_TAIL, " ");
}

/** The MagSafe suffix this contract appends, in any punctuation it has used. */
const TRAILING_MAGSAFE = /\s*[—–|-]\s*mag\s?-?safe\s*$/i;

/**
 * Re-emit an existing title against current facts, preserving its prose.
 *
 * Strips the segments the contract owns — the device claim, and the MagSafe
 * suffix we appended — keeps what is left verbatim, then re-composes. A title
 * whose only defect is a wrong device range comes back with the same voice and
 * the right models: no model call, no cost, no risk of a rewrite losing the
 * good parts.
 *
 * `changed` is false when the stored title already satisfies the contract, so
 * callers can skip a no-op write.
 */
export function repairListingTitle(
  currentTitle: string,
  facts: ListingTitleFacts,
): ComposedTitle & { changed: boolean; head: string } {
  // A product that IS MagSafe keeps whatever MagSafe wording it already has —
  // only our own trailing suffix is lifted, so the device claim can go back in
  // front of it. A product that is NOT gets every claim stripped, by the tested
  // inverse of the wording we append, so it can never be removed one way here
  // and another there.
  const head = tidy(
    stripDeviceClaims(
      facts.magsafe
        ? currentTitle.replace(TRAILING_MAGSAFE, "")
        : removeMagSafeCopy({ title: currentTitle, description: null, tags: [] })
            .title,
    ),
  );

  const composed = composeListingTitle(head, facts);
  return {
    ...composed,
    head,
    changed: composed.title !== tidy(currentTitle),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

export type TitleIssueCode =
  /** The title never names the character or brand the product is classified as. */
  | "missing_ip"
  /** The title names one registry brand and the brand columns say another. */
  | "brand_conflict"
  /** The title still names the IP a confirmed reclassification replaced. */
  | "brand_stale"
  /** Nothing about the product corroborates the brand it is classified as. */
  | "brand_unverified"
  /** The title advertises a device generation the product is not sold for. */
  | "device_overclaim"
  /** A generation we do sell for goes unmentioned — reach left on the table. */
  | "device_underclaim"
  /** MagSafe claimed on a product that was not verified as MagSafe. */
  | "magsafe_overclaim"
  /** A verified MagSafe product that does not say so. */
  | "magsafe_missing"
  | "too_long"
  | "too_short"
  | "non_english";

export type TitleIssue = {
  code: TitleIssueCode;
  /** Human sentence for the admin badge and the audit script. */
  detail: string;
  /**
   * `error`   — the title makes a claim that is false, or is unpublishable.
   * `warning` — the title is true but leaves search value unclaimed.
   */
  severity: "error" | "warning";
};

/** The generation numerals a title claims, or `null` when it claims none. */
function claimedGenerations(title: string): string[] | null {
  const at = title.search(/\biphone\b/i);
  if (at === -1) return null;
  // Only the compatibility tail is parsed for numerals. A "360" ring or a "3D"
  // finish earlier in the prose is not a device claim, and reading it as one
  // would put a false error badge on a correct title.
  return [...new Set(title.slice(at).match(/\b(1[0-9]|2[0-5])\b/g) ?? [])];
}

/**
 * Score a stored title against the facts.
 *
 * This is what turns "some of our titles are wrong" into a list. Every check
 * here is a defect the catalogue has actually shipped, and each is invisible
 * unless someone opens that product and compares its title against its variant
 * matrix by eye.
 */
export function auditListingTitle(
  title: string,
  facts: ListingTitleFacts,
): TitleIssue[] {
  const issues: TitleIssue[] = [];
  const trimmed = tidy(title);

  const script = findForbiddenScript(trimmed);
  if (script) {
    issues.push({
      code: "non_english",
      detail: `Contains ${script} characters — storefront copy is English-only.`,
      severity: "error",
    });
  }
  if (trimmed.length > LISTING_TITLE_MAX) {
    issues.push({
      code: "too_long",
      detail: `${trimmed.length} characters — the cap is ${LISTING_TITLE_MAX}.`,
      severity: "error",
    });
  }
  if (trimmed.length < LISTING_TITLE_MIN) {
    issues.push({
      code: "too_short",
      detail: "Too short to carry any search terms.",
      severity: "error",
    });
  }

  switch (ipVerdict(trimmed, facts)) {
    case "conflict":
      issues.push({
        code: "brand_conflict",
        detail: `The title reads as ${identityOfText([trimmed]).ip}, but this product is classified as ${facts.ip}. One of the two is wrong — re-read the photos or reassign the brand.`,
        severity: "error",
      });
      break;
    case "replace":
      issues.push({
        code: "brand_stale",
        detail: `The title still says ${identityOfText([trimmed]).ip}, but this product was confirmed as ${facts.ip}. Regenerating the title will swap the name and keep the rest.`,
        severity: "error",
      });
      break;
    case "unverified":
      issues.push({
        code: "brand_unverified",
        detail: `Classified as ${facts.ip}, but nothing in this product's own title, tags or source folder supports that. Re-read the photos before putting it in the title.`,
        severity: "warning",
      });
      break;
    case "addable":
      issues.push({
        code: "missing_ip",
        detail: `Classified as ${facts.ip}, but the title never says so — that is the term shoppers search for.`,
        severity: "warning",
      });
      break;
  }

  if (facts.models.length > 0) {
    const claimable = claimableGenerations(facts.models);
    const claimed = claimedGenerations(trimmed);

    const overclaimed = (claimed ?? []).filter((n) => !claimable.includes(n));
    if (overclaimed.length > 0) {
      issues.push({
        code: "device_overclaim",
        detail: `Advertises iPhone ${overclaimed.join(", ")}, which this product is not sold for.`,
        severity: "error",
      });
    }
    const missing = claimable.filter((n) => !(claimed ?? []).includes(n));
    if (overclaimed.length === 0 && missing.length > 0) {
      issues.push({
        code: "device_underclaim",
        detail: claimed
          ? `Sold for iPhone ${claimable.join(" ")} but the title omits ${missing.join(", ")}.`
          : `Sold for iPhone ${claimable.join(" ")} but the title names no device at all.`,
        severity: "warning",
      });
    }
  }

  const saysMagSafe = MAGSAFE_MENTION.test(trimmed);
  if (saysMagSafe && !facts.magsafe) {
    issues.push({
      code: "magsafe_overclaim",
      detail: "Claims MagSafe, but the product is not classified MagSafe.",
      severity: "error",
    });
  }
  if (!saysMagSafe && facts.magsafe) {
    issues.push({
      code: "magsafe_missing",
      detail: "Verified MagSafe, but the title does not mention it.",
      severity: "warning",
    });
  }

  return issues;
}
