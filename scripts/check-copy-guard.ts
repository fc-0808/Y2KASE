/**
 * Self-check for the AI copy contract, the MagSafe decision table and the
 * per-image style-tag invariant.
 *
 *   npm run check:guards
 *
 * These modules are pure, have no I/O, and encode the invariants that
 * production incidents came down to — Chinese titles reaching the storefront,
 * 80% of the catalogue being auto-labelled MagSafe because the model's own
 * title was counted as independent corroboration, and one photo representing
 * several variations at once. They are the cheapest thing in the codebase to
 * get wrong silently, so they get an assertion harness.
 *
 * Written against `node:assert` and run with tsx: no test framework, no new
 * dependencies, and it slots straight into the existing lint/typecheck CI job.
 */
import assert from "node:assert/strict";

import {
  coerceProductCopy,
  findForbiddenScript,
  sanitizeTag,
  sanitizeTags,
  stripForbiddenScripts,
  toEnglishContextHint,
} from "../src/lib/catalog/copy-schema";
import {
  decideMagSafe,
  applyMagSafeCopy,
  removeMagSafeCopy,
  type MagSafeVerdict,
} from "../src/lib/catalog/magsafe";
import {
  normalizeImageStyleTags,
  imageStyleTag,
  imageStyleTagsAreCanonical,
  styleTagsFor,
  stylesForAddons,
  IPHONE_MODELS,
} from "../src/lib/pricing";
import {
  auditListingTitle,
  composeListingTitle,
  deviceCoveragePhrase,
  headFromDescriptor,
  ipVerdict,
  listingIp,
  repairListingTitle,
  LISTING_TITLE_MAX,
  type ListingTitleFacts,
} from "../src/lib/catalog/listing-title";
import {
  BRAND_KNOWLEDGE,
  brandById,
  characterById,
  brandTerms,
  classifyBrandContext,
  installBrandRegistry,
  isBuiltInBrand,
  isBuiltInCharacter,
  isNonIpBrandValue,
  isOperatorConfirmed,
  listBrandOptions,
  mergeBrandRegistries,
  resetBrandRegistry,
  resolveBrandAssignment,
  OPERATOR_EVIDENCE_PREFIX,
} from "../src/lib/catalog/brands";
import { parseAliases, slugifyBrand } from "../src/lib/catalog/brand-admin";
import {
  BRAND_COLLECTION_KINDS,
  flattenTaxonomy,
  taxonomySlugChain,
} from "../src/lib/catalog/collections-config";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err instanceof Error ? err.message : err}`);
  }
}

// ── Language guard ──────────────────────────────────────────────────────────

test("passes plain English", () => {
  assert.equal(findForbiddenScript("Hello Kitty Kawaii Phone Case"), null);
});

test("passes emoji — the brand voice depends on them", () => {
  assert.equal(findForbiddenScript("Kuromi Y2K Case 💕✨🎀 — so cute!"), null);
});

test("passes accented Latin and typographic punctuation", () => {
  assert.equal(findForbiddenScript("Café Naïve — Résumé… “quoted”"), null);
});

test("catches the exact titles that shipped to production", () => {
  assert.equal(
    findForbiddenScript("波点爱心美乐蒂手机壳 8/5"),
    "Chinese/Japanese (CJK)",
  );
  assert.equal(
    findForbiddenScript("樱花美乐蒂小羊手机壳 8/7/6s 透明软壳带链条 — MagSafe"),
    "Chinese/Japanese (CJK)",
  );
});

test("catches kana, hangul, cyrillic and fullwidth forms", () => {
  assert.equal(findForbiddenScript("かわいい ケース"), "Japanese kana");
  assert.equal(findForbiddenScript("안녕하세요"), "Korean (Hangul)");
  assert.equal(findForbiddenScript("Привет"), "Cyrillic");
  assert.equal(
    findForbiddenScript("Case（15-17）"),
    "CJK punctuation/fullwidth forms",
  );
});

test("strips forbidden scripts without mangling the Latin remainder", () => {
  assert.equal(stripForbiddenScripts("Melody 美乐蒂 Case"), "Melody Case");
});

// ── Tag sanitisation ────────────────────────────────────────────────────────

test("normalises a well-formed tag", () => {
  assert.equal(sanitizeTag("Hello Kitty"), "hello_kitty");
  assert.equal(sanitizeTag("#y2k"), "y2k");
  assert.equal(sanitizeTag("  Beaded-Strap  "), "beaded_strap");
});

test("rejects the supplier folder names that leaked into products.tags", () => {
  assert.equal(sanitizeTag("hot-360一体支架圆边气囊 夏日海滩kitty  23"), null);
  assert.equal(sanitizeTag("【挂绳双层】波点像素黑皮kt+珠链挂牌（15-17pm）"), null);
});

test("rejects device-model dumps", () => {
  assert.equal(
    sanitizeTag("13-14-14pro-14promax-15-15pro-15promax-16-16pro"),
    null,
  );
  assert.equal(sanitizeTag("2024"), null);
});

test("reserves the magsafe tag for a verified decision", () => {
  assert.equal(sanitizeTag("magsafe"), null);
  assert.equal(sanitizeTag("MagSafe"), null);
  assert.equal(sanitizeTag("mag-safe"), null);
});

test("de-duplicates and caps a tag list", () => {
  const tags = sanitizeTags(["Kitty", "kitty", "KITTY", "magsafe", "pink"]);
  assert.deepEqual(tags, ["kitty", "pink"]);
});

// ── Prompt context hint ─────────────────────────────────────────────────────

test("keeps a usable English folder hint", () => {
  assert.equal(toEnglishContextHint("Sanrio"), "Sanrio");
  assert.equal(toEnglishContextHint("Sanrio / Hello Kitty"), "Sanrio Hello Kitty");
});

test("drops a Chinese folder name rather than telling the model to use it", () => {
  assert.equal(
    toEnglishContextHint("hot-圆边双面imd 磨砂蜜瓜薄荷绿轻松熊 10 13-14-14pro_variants"),
    null,
  );
});

test("drops meaningless folder names", () => {
  assert.equal(toEnglishContextHint("Others"), null);
  assert.equal(toEnglishContextHint("12"), null);
  assert.equal(toEnglishContextHint(""), null);
});

// ── Copy coercion ───────────────────────────────────────────────────────────

const GOOD_COPY = {
  title: "Kuromi Y2K Glitter Phone Case for iPhone 17 16 15 14 13 Pro Max",
  description:
    "Serving main-character energy in the cutest way. This Kuromi case pairs a glitter-flecked shell with soft pastel accents, so your phone matches every fit. Slim, grippy and built to take a tumble.",
  tags: ["kuromi", "sanrio", "y2k", "glitter"],
  category: "iphone_case",
  suggestedPriceUsd: 24.5,
  altText: "Kuromi glitter phone case on a pink background",
  materials: "soft TPU",
  magsafe: false,
  magsafeConfidence: "none",
  magsafeEvidence: "none",
};

test("accepts well-formed English copy unchanged", () => {
  const { copy, blocking, repaired } = coerceProductCopy({ ...GOOD_COPY });
  assert.deepEqual(blocking, []);
  assert.deepEqual(repaired, []);
  assert.equal(copy.title, GOOD_COPY.title);
  assert.equal(copy.suggestedPriceUsd, 24.5);
});

test("blocks a Chinese title instead of persisting it", () => {
  const { blocking } = coerceProductCopy({
    ...GOOD_COPY,
    title: "波点爱心美乐蒂手机壳 8/5",
  });
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].field, "title");
});

test("blocks a missing or stub title", () => {
  assert.equal(coerceProductCopy({ ...GOOD_COPY, title: "" }).blocking.length, 1);
  assert.equal(coerceProductCopy({ ...GOOD_COPY, title: "Case" }).blocking.length, 1);
});

test("repairs — not blocks — non-English tags and materials", () => {
  const { copy, blocking, repaired } = coerceProductCopy({
    ...GOOD_COPY,
    tags: ["kuromi", "磨砂蜜瓜薄荷绿", "y2k"],
    materials: "软胶",
  });
  assert.deepEqual(blocking, []);
  assert.deepEqual(copy.tags, ["kuromi", "y2k"]);
  assert.equal(copy.materials, "");
  assert.ok(repaired.length >= 2);
});

test("drops a magsafe claim the model cannot back with evidence", () => {
  const { copy } = coerceProductCopy({
    ...GOOD_COPY,
    magsafe: true,
    magsafeConfidence: "high",
    magsafeEvidence: "none",
  });
  assert.equal(copy.magsafe, false);
  assert.equal(copy.magsafeConfidence, "none");
});

test("keeps a magsafe claim backed by admissible evidence", () => {
  const { copy } = coerceProductCopy({
    ...GOOD_COPY,
    magsafe: true,
    magsafeConfidence: "high",
    magsafeEvidence: "magnet_ring_visible",
  });
  assert.equal(copy.magsafe, true);
  assert.equal(copy.magsafeConfidence, "high");
});

test("strips a model-authored magsafe tag", () => {
  const { copy } = coerceProductCopy({
    ...GOOD_COPY,
    tags: ["kuromi", "magsafe", "y2k"],
  });
  assert.deepEqual(copy.tags, ["kuromi", "y2k"]);
});

test("clamps an absurd suggested price", () => {
  assert.equal(
    coerceProductCopy({ ...GOOD_COPY, suggestedPriceUsd: 99999 }).copy
      .suggestedPriceUsd,
    500,
  );
  assert.equal(
    coerceProductCopy({ ...GOOD_COPY, suggestedPriceUsd: -5 }).copy
      .suggestedPriceUsd,
    1,
  );
});

// ── MagSafe decision table ──────────────────────────────────────────────────

const strong: MagSafeVerdict = {
  magsafe: true,
  confidence: "high",
  evidence: "magnet_ring_visible",
};
const weak: MagSafeVerdict = {
  magsafe: true,
  confidence: "low",
  evidence: "magnet_ring_visible",
};
const negative: MagSafeVerdict = {
  magsafe: false,
  confidence: "none",
  evidence: "none",
};

test("a human assertion is authoritative", () => {
  assert.equal(decideMagSafe({ human: true }), "confirmed");
  assert.equal(decideMagSafe({ human: true, verifier: negative }), "confirmed");
});

test("the verifier confirms only at high confidence", () => {
  assert.equal(decideMagSafe({ human: false, verifier: strong }), "confirmed");
  assert.equal(decideMagSafe({ human: false, verifier: weak }), "review");
});

test("the verifier can veto a provisional flag outright", () => {
  assert.equal(
    decideMagSafe({ human: false, verifier: negative, provisional: true }),
    "none",
  );
});

test("REGRESSION: model output alone can never reach confirmed", () => {
  // This is the bug. The copy pass used to write "MagSafe" into its own title,
  // that title was read back as an independent textual signal, and the pair
  // auto-confirmed. Without a verifier verdict, `review` is the ceiling.
  assert.equal(decideMagSafe({ human: false, provisional: true }), "review");
});

test("no signals at all means not MagSafe", () => {
  assert.equal(decideMagSafe({ human: false }), "none");
  assert.equal(decideMagSafe({ human: false, provisional: false }), "none");
});

test("a verdict with inadmissible evidence never confirms", () => {
  assert.equal(
    decideMagSafe({
      human: false,
      verifier: { magsafe: true, confidence: "high", evidence: "none" },
    }),
    "review",
  );
});

// ── MagSafe copy application ────────────────────────────────────────────────

test("applying then removing MagSafe copy round-trips", () => {
  const original = {
    title: "Kuromi Y2K Glitter Phone Case",
    description: "Serving main-character energy.",
    tags: ["kuromi", "y2k"],
  };
  const applied = applyMagSafeCopy(original);
  assert.ok(applied.changed);
  assert.ok(applied.title.endsWith(" — MagSafe"));
  assert.ok(applied.tags.includes("magsafe"));

  const removed = removeMagSafeCopy(applied);
  assert.equal(removed.title, original.title);
  assert.equal(removed.description, original.description);
  assert.deepEqual(removed.tags, original.tags);
});

test("REGRESSION: demoting strips MagSafe claims the prompt wrote itself", () => {
  // The old copy prompt put "MagSafe" into titles and descriptions directly, so
  // a demoted product used to keep advertising it after losing the tag.
  const a = removeMagSafeCopy({
    title: "My Melody Kawaii Phone Case with MagSafe",
    description: "So cute. With built-in MagSafe compatibility, it snaps right on. Slim and grippy.",
    tags: ["my_melody", "magsafe"],
  });
  assert.equal(a.title, "My Melody Kawaii Phone Case");
  assert.equal(a.description, "So cute. Slim and grippy.");
  assert.deepEqual(a.tags, ["my_melody"]);
  assert.ok(a.changed);

  // Adjectival use in the middle of a title.
  assert.equal(
    removeMagSafeCopy({
      title: "Hello Kitty Sanrio Clear MagSafe iPhone 17 Case",
      description: "",
      tags: [],
    }).title,
    "Hello Kitty Sanrio Clear iPhone 17 Case",
  );

  // Parenthesised, and the "MagSafe compatible" phrasing.
  assert.equal(
    removeMagSafeCopy({ title: "Kuromi Case (MagSafe)", description: "", tags: [] }).title,
    "Kuromi Case",
  );
  assert.equal(
    removeMagSafeCopy({
      title: "Miffy MagSafe-compatible Clear Case",
      description: "",
      tags: [],
    }).title,
    "Miffy Clear Case",
  );
});

test("demoting keeps a hashtag line intact, dropping only #magsafe", () => {
  const { description } = removeMagSafeCopy({
    title: "Kuromi Case",
    description: "Serving looks.\n\n#kawaii #y2k #magsafe",
    tags: [],
  });
  assert.equal(description, "Serving looks.\n\n#kawaii #y2k");
});

test("demoting a product with no MagSafe claim changes nothing", () => {
  const input = {
    title: "Kuromi Y2K Glitter Phone Case",
    description: "Serving main-character energy.",
    tags: ["kuromi", "y2k"],
  };
  const out = removeMagSafeCopy(input);
  assert.equal(out.changed, false);
  assert.equal(out.title, input.title);
  assert.equal(out.description, input.description);
});

test("applying MagSafe copy is idempotent", () => {
  const once = applyMagSafeCopy({
    title: "Kuromi Case",
    description: "Cute.",
    tags: [],
  });
  const twice = applyMagSafeCopy(once);
  assert.equal(twice.changed, false);
  assert.equal(twice.title, once.title);
});

// ── Per-image style tags: one photo, one variation ──────────────────────────

test("a single tag and the universal empty set pass through untouched", () => {
  assert.deepEqual(normalizeImageStyleTags(["Case + Grip"]), ["Case + Grip"]);
  assert.deepEqual(normalizeImageStyleTags([]), []);
  assert.deepEqual(normalizeImageStyleTags(null), []);
  assert.deepEqual(normalizeImageStyleTags(undefined), []);
});

test("REGRESSION: a photo can never represent more than one variation", () => {
  // The admin pills were independent toggles and the vision classifier was
  // prompted to tag inclusively, so one photo became the storefront's
  // representative shot for several styles at once.
  assert.deepEqual(
    normalizeImageStyleTags([
      "Case + Grip + Charm",
      "Case + Grip",
      "Case Only",
    ]),
    ["Case + Grip + Charm"],
  );
  for (const tags of [
    ["Case Only", "Grip Only"],
    ["Charm Only", "Case + Charm"],
    ["Case + Grip", "Case + Charm", "Case Only", "Grip Only", "Charm Only"],
  ]) {
    assert.equal(normalizeImageStyleTags(tags).length, 1, tags.join(" + "));
  }
});

test("the most complete configuration wins, whatever order it arrives in", () => {
  // The subsets a bundle photo also illustrates must lose to the bundle.
  assert.deepEqual(normalizeImageStyleTags(["Case Only", "Case + Grip"]), [
    "Case + Grip",
  ]);
  assert.deepEqual(normalizeImageStyleTags(["Case + Grip", "Case Only"]), [
    "Case + Grip",
  ]);
});

test("unknown values are dropped rather than persisted", () => {
  assert.deepEqual(normalizeImageStyleTags(["Case + Strap"]), []);
  assert.deepEqual(normalizeImageStyleTags(["", "case only"]), []);
  assert.deepEqual(normalizeImageStyleTags(["nonsense", "Case Only"]), [
    "Case Only",
  ]);
});

test("a style the product stopped offering falls back to universal", () => {
  const gripOnly = stylesForAddons({ hasGrip: true, hasCharm: false });
  assert.deepEqual(normalizeImageStyleTags(["Case + Charm"], gripOnly), []);
  assert.deepEqual(normalizeImageStyleTags(["Case + Grip"], gripOnly), [
    "Case + Grip",
  ]);
});

test("the offered set is applied before the most-complete tie-break", () => {
  // Dropping the charm must promote the photo to the best style still sold,
  // not strand it on a bundle the product no longer offers.
  assert.deepEqual(
    normalizeImageStyleTags(
      ["Case + Grip + Charm", "Case + Grip"],
      stylesForAddons({ hasGrip: true, hasCharm: false }),
    ),
    ["Case + Grip"],
  );
});

test("normalization is idempotent", () => {
  const once = normalizeImageStyleTags(["Case + Grip + Charm", "Case Only"]);
  assert.deepEqual(normalizeImageStyleTags(once), once);
});

test("imageStyleTag reads the single assignment, null when universal", () => {
  assert.equal(imageStyleTag(["Case + Grip", "Case Only"]), "Case + Grip");
  assert.equal(imageStyleTag([]), null);
  assert.equal(imageStyleTag(["Case Only"], ["Case + Grip"]), null);
});

test("styleTagsFor turns a single-select choice into the stored form", () => {
  assert.deepEqual(styleTagsFor("Case Only"), ["Case Only"]);
  assert.deepEqual(styleTagsFor(null), []);
  assert.deepEqual(styleTagsFor("Not A Style"), []);
});

test("the canonical check spots exactly the rows that need a write", () => {
  assert.equal(imageStyleTagsAreCanonical(["Case Only"]), true);
  assert.equal(imageStyleTagsAreCanonical([]), true);
  assert.equal(imageStyleTagsAreCanonical(null), true);
  // Too many tags.
  assert.equal(imageStyleTagsAreCanonical(["Case + Grip", "Case Only"]), false);
  // Right count, wrong value — no longer offered.
  assert.equal(
    imageStyleTagsAreCanonical(["Case + Charm"], ["Case Only", "Case + Grip"]),
    false,
  );
  // Right count, unknown value.
  assert.equal(imageStyleTagsAreCanonical(["Case + Strap"]), false);
});

// ── Brand registry: the vocabulary the catalogue is classified into ─────────

test("the registry itself is internally consistent", () => {
  const brandIds = new Set<string>();
  const characterKeys = new Set<string>();
  for (const brand of BRAND_KNOWLEDGE) {
    assert.equal(brandIds.has(brand.id), false, `duplicate brand id ${brand.id}`);
    brandIds.add(brand.id);
    for (const character of brand.characters ?? []) {
      // Character ids must be globally unique: they are resolved without a
      // brand (legacy rows store a character in the brand column) and they
      // double as collection slugs.
      assert.equal(
        characterKeys.has(character.id),
        false,
        `duplicate character id ${character.id}`,
      );
      characterKeys.add(character.id);
    }
  }
});

test("every browsable collection maps to a registry entry", () => {
  // If a brand or character is browsable it must also be classifiable —
  // otherwise products can never be filed into it.
  for (const node of flattenTaxonomy()) {
    if (!BRAND_COLLECTION_KINDS.has(node.kind)) continue;
    const known =
      node.kind === "brand" ? brandById(node.slug) : characterById(node.slug);
    assert.ok(known, `taxonomy node "${node.slug}" has no brand registry entry`);
  }
});

test("REGRESSION: a Miffy case is Miffy, not Sanrio / Hello Kitty", () => {
  // "miffy" was listed as a Sanrio *alias*, and the character fell back to
  // `characters[0]`, so every Miffy product was filed under Sanrio and
  // labelled with a character that appears nowhere on it.
  const verdict = classifyBrandContext([
    "Miffy Chef 360° Foldable Ring Case with Beaded Strap — MagSafe",
  ]);
  assert.equal(verdict.brand, "Miffy");
  assert.equal(verdict.character, "Miffy");
});

test("REGRESSION: a character is never invented to fill the field", () => {
  const verdict = classifyBrandContext(["Sanrio Friends Clear Phone Case"]);
  assert.equal(verdict.brand, "Sanrio");
  assert.equal(verdict.character, null);
  assert.equal(verdict.confidence, "medium");
});

test("Rilakkuma is classified as Rilakkuma", () => {
  const verdict = classifyBrandContext([
    "Rilakkuma Clear Phone Case with Card Slot & Beaded Strap",
  ]);
  assert.equal(verdict.brand, "Rilakkuma");
  assert.equal(verdict.character, "Rilakkuma");
  assert.equal(verdict.confidence, "high");
});

test("Korilakkuma does not collapse into Rilakkuma", () => {
  // Substring matching made the little white bear indistinguishable from the
  // brown one, because "korilakkuma" contains "rilakkuma".
  const verdict = classifyBrandContext(["Korilakkuma Soft Silicone Case"]);
  assert.equal(verdict.brand, "Rilakkuma");
  assert.equal(verdict.character, "Korilakkuma");
});

test("matching is whole-word, and the most specific term wins", () => {
  assert.equal(classifyBrandContext(["Kittycore Pastel Case"]).brand, null);
  assert.equal(
    classifyBrandContext(["Hello Kitty x Kuromi Duo Case"]).character,
    "Hello Kitty",
  );
});

test("classification order does not depend on registry order", () => {
  const kuromi = classifyBrandContext(["Kuromi Glitter Galaxy Phone Case"]);
  assert.equal(kuromi.brand, "Sanrio");
  assert.equal(kuromi.character, "Kuromi");
  const tamagotchi = classifyBrandContext(["Tamagotchi Y2K Case"]);
  assert.equal(tamagotchi.brand, "Tamagotchi");
});

test("supplier folder names in Chinese never match a brand", () => {
  assert.equal(
    classifyBrandContext(["hot-圆边双面imd 磨砂蜜瓜薄荷绿轻松熊 10 13-14"]).brand,
    null,
  );
});

test("legacy rows that stored a character as the brand still resolve", () => {
  const resolved = resolveBrandAssignment("Hello Kitty", "hello kitty");
  assert.ok(resolved.ok);
  assert.equal(resolved.brand.brand, "Sanrio");
  assert.equal(resolved.character?.name, "Hello Kitty");
});

test("a character from another brand is rejected, not silently accepted", () => {
  const resolved = resolveBrandAssignment("Sanrio", "Korilakkuma");
  assert.equal(resolved.ok, false);
});

test("an unknown brand is rejected", () => {
  assert.equal(resolveBrandAssignment("Totoro", null).ok, false);
  assert.equal(resolveBrandAssignment(null, null).ok, false);
});

test("assigning a character also files the product under its brand", () => {
  assert.deepEqual(taxonomySlugChain("hello-kitty"), ["hello-kitty", "sanrio"]);
  // A brand that is also its own only character resolves to the single node.
  assert.deepEqual(taxonomySlugChain("rilakkuma"), ["rilakkuma"]);
  assert.deepEqual(taxonomySlugChain("pikachu"), ["pikachu", "pokemon"]);
  assert.deepEqual(taxonomySlugChain("shin-chan"), [
    "shin-chan",
    "crayon-shin-chan",
  ]);
});

test("every registry entry has somewhere to be filed", () => {
  // The converse of the check above, and the one that was missing. A
  // classification with no browse node behind it is worse than none at all:
  // `taxonomySlugChain` returns [], filing links the product to nothing, and
  // the product silently leaves the browse tree. Nine brands — Disney, Toy
  // Story, Monchhichi, Crayon Shin-chan among them — were in exactly that
  // state, which is why their products were found sitting under Hello Kitty.
  for (const brand of BRAND_KNOWLEDGE) {
    assert.ok(
      taxonomySlugChain(brand.id).length > 0,
      `brand "${brand.id}" is classifiable but has no browse collection`,
    );
    for (const character of brand.characters ?? []) {
      assert.ok(
        taxonomySlugChain(character.id).length > 0,
        `character "${character.id}" is classifiable but has no browse collection`,
      );
    }
  }
});

test("the client-facing options expose every brand and character", () => {
  const options = listBrandOptions();
  assert.equal(options.length, BRAND_KNOWLEDGE.length);
  const rilakkuma = options.find((o) => o.id === "rilakkuma");
  assert.ok(rilakkuma, "Rilakkuma must be selectable");
  assert.deepEqual(
    rilakkuma.characters.map((c) => c.name),
    ["Rilakkuma", "Korilakkuma", "Kiiroitori"],
  );
});

// ── Runtime brand vocabulary ────────────────────────────────────────────────
//
// Operators can define brands without a deploy. The canon in `brands.ts` stays
// the floor: a runtime entry may extend it, never erase it. These lock down the
// merge, because a bad fold here silently changes how the whole catalogue is
// classified.

test("a runtime brand becomes classifiable", () => {
  try {
    assert.equal(resolveBrandAssignment("Sumikko Gurashi", null).ok, false);
    installBrandRegistry([
      {
        id: "sumikko-gurashi",
        brand: "Sumikko Gurashi",
        aliases: ["sumikko", "sumikkogurashi"],
        characters: [{ id: "shirokuma", name: "Shirokuma" }],
      },
    ]);

    const resolved = resolveBrandAssignment("sumikko", null);
    assert.equal(resolved.ok && resolved.brand.brand, "Sumikko Gurashi");
    assert.equal(
      classifyBrandContext(["Kawaii Sumikko Friends Clear Phone Case"]).brand,
      "Sumikko Gurashi",
    );
    // Longest first, so a caller stripping terms consumes the full name before
    // a shorter alias can bite a fragment out of it.
    assert.deepEqual(brandTerms("sumikko-gurashi"), [
      "Sumikko Gurashi",
      "sumikkogurashi",
      "sumikko",
    ]);
  } finally {
    resetBrandRegistry();
  }
});

test("the registry falls back to canon when nothing is installed", () => {
  resetBrandRegistry();
  assert.equal(resolveBrandAssignment("Sumikko Gurashi", null).ok, false);
  assert.equal(resolveBrandAssignment("Hello Kitty", null).ok, true);
});

test("a runtime entry extends a built-in brand instead of replacing it", () => {
  const merged = mergeBrandRegistries(BRAND_KNOWLEDGE, [
    {
      id: "sanrio",
      brand: "Sanrio",
      aliases: ["sanrio japan"],
      characters: [{ id: "chococat", name: "Chococat" }],
    },
  ]);
  const sanrio = merged.find((b) => b.id === "sanrio");
  assert.ok(sanrio);
  const names = (sanrio.characters ?? []).map((c) => c.name);
  // The canon characters survive, and the new one is appended.
  assert.equal(names.includes("Hello Kitty"), true);
  assert.equal(names.includes("Kuromi"), true);
  assert.equal(names.includes("Chococat"), true);
  assert.equal((sanrio.aliases ?? []).includes("sanrio japan"), true);
});

test("renaming a brand keeps rows written under the old name resolvable", () => {
  try {
    installBrandRegistry([
      { id: "pokemon", brand: "Pokemon TCG", aliases: [] },
      // A brand whose canon name is not already spelled out in its aliases, so
      // the rename genuinely depends on the old name being carried over.
      { id: "monchhichi", brand: "Monchhichi Classic", aliases: [] },
    ]);

    const renamed = resolveBrandAssignment("Pokemon TCG", null);
    assert.equal(renamed.ok && renamed.brand.id, "pokemon");

    const legacy = resolveBrandAssignment("Pokémon", null);
    assert.equal(legacy.ok && legacy.brand.id, "pokemon");

    const legacyMonchhichi = resolveBrandAssignment("Monchhichi", null);
    assert.equal(legacyMonchhichi.ok && legacyMonchhichi.brand.id, "monchhichi");
    assert.equal(
      legacyMonchhichi.ok && legacyMonchhichi.brand.brand,
      "Monchhichi Classic",
    );
  } finally {
    resetBrandRegistry();
  }
});

test("the merge never drops a canon brand", () => {
  const merged = mergeBrandRegistries(BRAND_KNOWLEDGE, []);
  assert.equal(merged.length, BRAND_KNOWLEDGE.length);
  for (const brand of BRAND_KNOWLEDGE) {
    assert.ok(
      merged.some((m) => m.id === brand.id),
      `${brand.id} was lost in the merge`,
    );
  }
});

test("canon entries are never deletable from the admin", () => {
  assert.equal(isBuiltInBrand("sanrio"), true);
  assert.equal(isBuiltInCharacter("hello-kitty"), true);
  assert.equal(isBuiltInBrand("sumikko-gurashi"), false);
  assert.equal(isBuiltInCharacter("shirokuma"), false);
});

test("a brand name becomes a URL-safe slug, or is rejected", () => {
  assert.equal(slugifyBrand("Sumikko Gurashi"), "sumikko-gurashi");
  assert.equal(slugifyBrand("Pokémon"), "pokemon");
  assert.equal(slugifyBrand("  Care   Bears  "), "care-bears");
  // Nothing latin to slug: the caller refuses rather than inventing an id.
  assert.equal(slugifyBrand("すみっコぐらし"), "");
});

test("alias input is split, trimmed and de-duplicated", () => {
  assert.deepEqual(parseAliases("sumikko, sumikkogurashi\n Sumikko , "), [
    "sumikko",
    "sumikkogurashi",
  ]);
  assert.deepEqual(parseAliases("   "), []);
});

// ── Listing-title contract ──────────────────────────────────────────────────
//
// The two defects these lock down both shipped to the live storefront: a title
// advertising an iPhone generation the product is not sold for, and a title
// that never names the character the product is classified as.

const CASE_15_TO_17 = IPHONE_MODELS.filter((m) => !m.includes("14"));

/**
 * A product whose classification is corroborated by its own source folder —
 * the case in which the contract is allowed to write the IP into the title.
 */
function phoneCase(
  over: Partial<ListingTitleFacts> = {},
): ListingTitleFacts {
  const ip = "ip" in over ? over.ip : "Rilakkuma";
  return {
    ip: ip ?? null,
    ipEvidence: ip ? [ip.toLowerCase()] : [],
    productTypeId: "iphone_case",
    models: CASE_15_TO_17,
    magsafe: false,
    ...over,
  };
}

test("device coverage is derived from the models actually sold", () => {
  assert.equal(deviceCoveragePhrase(CASE_15_TO_17), "iPhone 17 16 15 Pro Max");
  assert.equal(
    deviceCoveragePhrase([...IPHONE_MODELS]),
    // The 13/14 mould fits both phones, so both numerals may be claimed.
    "iPhone 17 16 15 14 13 Pro Max",
  );
  assert.equal(deviceCoveragePhrase([]), null);
});

test("the Pro / Pro Max qualifier is only claimed when every generation has it", () => {
  assert.equal(deviceCoveragePhrase(["iPhone 15", "iPhone 16"]), "iPhone 16 15");
  assert.equal(
    deviceCoveragePhrase(["iPhone 15", "iPhone 15 Pro", "iPhone 16", "iPhone 16 Pro"]),
    "iPhone 16 15 Pro",
  );
  // Pro Max on one generation only must not license the claim for both.
  assert.equal(
    deviceCoveragePhrase([
      "iPhone 15",
      "iPhone 15 Pro",
      "iPhone 15 Pro Max",
      "iPhone 16",
    ]),
    "iPhone 16 15",
  );
});

test("a false device claim is reported as an error", () => {
  const issues = auditListingTitle(
    "Mint Green Kawaii Bear Phone Case for iPhone 13-18 Pro Max",
    phoneCase(),
  );
  const overclaim = issues.find((i) => i.code === "device_overclaim");
  assert.ok(overclaim, "iPhone 18 does not exist and 13 is not sold");
  assert.equal(overclaim.severity, "error");
});

test("device numerals are only read from the compatibility tail", () => {
  // "360" and "3D" are product features, not device generations. Reading them
  // as claims would put a false error badge on a correct title.
  assert.deepEqual(
    auditListingTitle(
      "Hello Kitty Summer Beach 360 Stand Phone Case for iPhone 17 16 15 Pro Max",
      phoneCase({ ip: "Hello Kitty" }),
    ),
    [],
  );
});

test("a title that omits its classified character is flagged", () => {
  const issues = auditListingTitle(
    "Mint Green Kawaii Bear Phone Case for iPhone 17 16 15 Pro Max",
    phoneCase(),
  );
  assert.deepEqual(
    issues.map((i) => i.code),
    ["missing_ip"],
  );
});

test("MagSafe claims are audited in both directions", () => {
  const claimsIt = auditListingTitle(
    "Rilakkuma Phone Case for iPhone 17 16 15 Pro Max — MagSafe",
    phoneCase({ magsafe: false }),
  );
  assert.ok(claimsIt.some((i) => i.code === "magsafe_overclaim"));
  const omitsIt = auditListingTitle(
    "Rilakkuma Phone Case for iPhone 17 16 15 Pro Max",
    phoneCase({ magsafe: true }),
  );
  assert.ok(omitsIt.some((i) => i.code === "magsafe_missing"));
});

test("repair keeps the prose and re-emits only the owned segments", () => {
  const repaired = repairListingTitle(
    "Mint Green Kawaii Bear Phone Case for iPhone 13-18 Pro Max",
    phoneCase(),
  );
  assert.equal(
    repaired.title,
    "Rilakkuma Mint Green Kawaii Bear Phone Case for iPhone 17 16 15 Pro Max",
  );
  assert.deepEqual(auditListingTitle(repaired.title, phoneCase()), []);
});

test("repair does not duplicate a noun the title already has", () => {
  const repaired = repairListingTitle(
    "Miffy Chef Foldable Ring Case with Beaded Strap — MagSafe",
    phoneCase({ ip: "Miffy", magsafe: true }),
  );
  assert.equal(
    repaired.title,
    "Miffy Chef Foldable Ring Case with Beaded Strap for iPhone 17 16 15 Pro Max — MagSafe",
  );
});

test("a device claim mid-sentence is cut out, not cut from", () => {
  // The old copy prompt wedged the model list into the middle of the title.
  // Truncating at it threw away every keyword that followed.
  const repaired = repairListingTitle(
    "Miffy Sparkle Bunny iPhone 17 16 15 14 13 Pro Max Case | Y2K Cute Kawaii Star Phone Case",
    phoneCase({ ip: "Miffy" }),
  );
  assert.match(repaired.title, /Y2K Cute Kawaii Star/);
  assert.equal(repaired.title.match(/iPhone/gi)?.length, 1);
});

test("a model list orphaned by its own strip is removed too", () => {
  const repaired = repairListingTitle(
    "Hello Kitty Summer Vibes iPhone Case for 17 16 15 14 13 Pro Max",
    phoneCase({ ip: "Hello Kitty" }),
  );
  assert.equal(
    repaired.title,
    "Hello Kitty Summer Vibes Case for iPhone 17 16 15 Pro Max",
  );
  assert.deepEqual(
    auditListingTitle(repaired.title, phoneCase({ ip: "Hello Kitty" })),
    [],
  );
});

test("an operator's confirmation is corroboration the tags cannot supply", () => {
  // The real listing: a Rilakkuma case a supplier titled "Mint Green Kawaii
  // Bear". The word appears in no tag, no folder and no part of the title, so
  // text evidence can never verify it — and the contract would otherwise keep
  // the term shoppers search for out of the title forever.
  const unconfirmed = phoneCase({ ip: "Rilakkuma", ipEvidence: [] });
  const title = "Mint Green Kawaii Bear Phone Case";
  assert.equal(ipVerdict(title, unconfirmed), "unverified");

  const confirmed = { ...unconfirmed, ipConfirmed: true };
  assert.equal(ipVerdict(title, confirmed), "addable");
  assert.equal(
    repairListingTitle(title, confirmed).title,
    "Rilakkuma Mint Green Kawaii Bear Phone Case for iPhone 17 16 15 Pro Max",
  );
});

test("an unconfirmed disagreement is left for a human to settle", () => {
  // Two machine guesses contradicting each other is not grounds to rewrite a
  // live title: the classifier may be the wrong one. The prose stays put.
  const facts = phoneCase({ ip: "Hello Kitty", ipEvidence: [] });
  const title = "Sanrio Cinnamoroll 3D Charm Clear Phone Case";
  assert.equal(ipVerdict(title, facts), "conflict");
  assert.equal(repairListingTitle(title, facts).title.includes("Cinnamoroll"), true);
});

test("REGRESSION: reclassifying Hello Kitty → Kuromi rewrites the title", () => {
  // The listing from the admin screenshot. Correcting the character used to
  // leave the title advertising Hello Kitty forever: repair refused to touch a
  // disputed title, so the bulk fix skipped the row.
  const facts = phoneCase({
    ip: "Kuromi",
    ipEvidence: [],
    ipConfirmed: true,
    models: CASE_15_TO_17,
  });
  const title = "Hello Kitty Kawaii Glitter & Sticker Phone Case for iPhone 17 16 15 Pro Max";

  assert.equal(ipVerdict(title, facts), "replace");
  const repaired = repairListingTitle(title, facts);
  assert.equal(
    repaired.title,
    "Kuromi Kawaii Glitter & Sticker Phone Case for iPhone 17 16 15 Pro Max",
  );
  assert.equal(repaired.changed, true);

  // And the audit has to call it repairable, or the bulk action skips it again.
  const codes = auditListingTitle(title, facts).map((i) => i.code);
  assert.equal(codes.includes("brand_stale"), true);
  assert.equal(codes.includes("brand_conflict"), false);
});

test("a swap keeps the umbrella brand when it is still true", () => {
  // Hello Kitty → Kuromi is still Sanrio, so "Sanrio" is not a stale term and
  // stripping it would cost a real search keyword.
  const facts = phoneCase({ ip: "Kuromi", ipConfirmed: true });
  const repaired = repairListingTitle(
    "Sanrio Hello Kitty Pink Bow Clear Phone Case",
    facts,
  );
  assert.equal(repaired.title.includes("Hello Kitty"), false);
  assert.equal(repaired.title.includes("Sanrio"), true);
  assert.equal(repaired.title.startsWith("Kuromi "), true);
});

test("a swap across brands drops the whole superseded identity", () => {
  // Hello Kitty → Miffy changes the rights holder too, so "Sanrio" goes with it.
  const facts = phoneCase({ ip: "Miffy", ipConfirmed: true });
  const repaired = repairListingTitle(
    "Sanrio Hello Kitty Strawberry Clear Phone Case",
    facts,
  );
  assert.equal(repaired.title.includes("Sanrio"), false);
  assert.equal(repaired.title.includes("Hello Kitty"), false);
  assert.equal(
    repaired.title,
    "Miffy Strawberry Clear Phone Case for iPhone 17 16 15 Pro Max",
  );
});

test("aliases of the superseded name go too", () => {
  // "hellokitty" and "kitty white" are the same character to the registry, so
  // leaving one behind would keep the wrong term working in search.
  const facts = phoneCase({ ip: "Kuromi", ipConfirmed: true });
  assert.equal(
    repairListingTitle("HelloKitty Glitter Phone Case", facts).title.toLowerCase().includes("kitty"),
    false,
  );
});

test("a swap that consumes the entire prose still yields a legal title", () => {
  const facts = phoneCase({ ip: "Kuromi", ipConfirmed: true });
  const repaired = repairListingTitle("Hello Kitty", facts);
  assert.equal(
    repaired.title,
    "Kuromi Phone Case for iPhone 17 16 15 Pro Max",
  );
});

test("a supplier's own shop name is not a classification", () => {
  assert.equal(isNonIpBrandValue("Y2CASE"), true);
  assert.equal(isNonIpBrandValue("joy nova"), true);
  assert.equal(isNonIpBrandValue("Bandai"), true);
  // Real IPs, and a registry alias that happens to look like a maker, are not.
  assert.equal(isNonIpBrandValue("Sanrio"), false);
  assert.equal(isNonIpBrandValue("San-X"), false);
  assert.equal(isNonIpBrandValue(null), false);
});

test("operator provenance is read back from the marker it is written with", () => {
  assert.equal(
    isOperatorConfirmed([`${OPERATOR_EVIDENCE_PREFIX} by me@shop.com`]),
    true,
  );
  assert.equal(isOperatorConfirmed(["hello kitty", "sanrio"]), false);
  assert.equal(isOperatorConfirmed(null), false);
});

test("a contradicted brand column never earns the right to re-file", () => {
  // The rule the collection filer depends on. A Cinnamoroll case whose brand
  // column says Hello Kitty must read as a conflict, because filing acts
  // destructively on that axis and a destructive move on a disputed
  // classification is what removed correct memberships from the catalogue.
  const facts = phoneCase({ ip: "Hello Kitty", ipEvidence: ["hello kitty"] });
  assert.equal(
    ipVerdict("Sanrio Cinnamoroll 3D Charm Clear Phone Case", facts),
    "conflict",
  );
  // And the corroborated case still files, or nothing would ever move.
  assert.equal(
    ipVerdict("Hello Kitty Sticker Fun Case", facts),
    "present",
  );
  assert.equal(
    ipVerdict("Kawaii Glitter & Sticker Phone Case", facts),
    "addable",
  );
});

test("a range claiming a phone that does not exist is an error, and repairable", () => {
  // Straight off the products console: the product sells for 15–17, and the
  // title advertises an iPhone 18. Both ends of the range are false.
  const facts = phoneCase({ ip: null });
  const title = "Mint Green Kawaii Bear Phone Case for iPhone 13-18 Pro Max";

  const codes = auditListingTitle(title, facts).map((issue) => issue.code);
  assert.deepEqual(codes, ["device_overclaim"]);

  const repaired = repairListingTitle(title, facts);
  assert.equal(
    repaired.title,
    "Mint Green Kawaii Bear Phone Case for iPhone 17 16 15 Pro Max",
  );
  assert.deepEqual(auditListingTitle(repaired.title, facts), []);
});

test("a slash-separated model list that is already correct is left alone", () => {
  const facts = phoneCase({ ip: "Hello Kitty", magsafe: true });
  const title =
    "Hello Kitty Summer Beach 360 Stand Phone Case for iPhone 15/16/17 Series — MagSafe";
  assert.deepEqual(auditListingTitle(title, facts), []);
});

test("repair is idempotent and reports a compliant title as unchanged", () => {
  const once = repairListingTitle(
    "Rilakkuma Clear Phone Case with Card Slot",
    phoneCase(),
  );
  const twice = repairListingTitle(once.title, phoneCase());
  assert.equal(twice.title, once.title);
  assert.equal(twice.changed, false);
});

test("a model descriptor cannot smuggle in a segment we compose ourselves", () => {
  const facts = phoneCase();
  const head = headFromDescriptor(
    "Rilakkuma MagSafe Phone Case for iPhone 16 Pro Max, Mint Green",
    facts,
  );
  const { title } = composeListingTitle(head, facts);
  // The brand appears once, the device claim comes from the variant matrix, and
  // the MagSafe wording is absent because this product is not MagSafe.
  assert.equal(title, "Rilakkuma Mint Green Phone Case for iPhone 17 16 15 Pro Max");
  assert.equal(title.match(/Rilakkuma/g)?.length, 1);
});

test("descriptor filler that makes every listing collide is stripped", () => {
  // Sixteen Miffy titles saying "Kawaii Cute Clear" is how the catalogue got
  // here. The prompt bans these words; the sanitiser is the backstop when the
  // model ignores the ban.
  const facts = phoneCase({ ip: "Miffy" });
  const head = headFromDescriptor(
    "Kawaii Cute Clear Glitter Bunny Aesthetic Y2K",
    facts,
  );
  assert.ok(!/\b(kawaii|cute|aesthetic|y2k)\b/i.test(head), head);
  assert.match(head, /Clear Glitter/i);
});

test("an uncorroborated classification is reported, never written in", () => {
  // A Tamagotchi case that the old classifier stored as Sanrio/Hello Kitty, at
  // "high" confidence. The catalogue really contains rows like this, so the
  // repair path must not launder them into customer-visible copy.
  const facts = phoneCase({ ip: "Hello Kitty", ipEvidence: ["tamagotchi_y2k"] });
  assert.equal(ipVerdict("Tamagotchi Y2K Cute Clear Phone Case", facts), "conflict");

  const issues = auditListingTitle("Tamagotchi Y2K Cute Clear Phone Case", facts);
  const conflict = issues.find((i) => i.code === "brand_conflict");
  assert.ok(conflict);
  assert.equal(conflict.severity, "error");

  const repaired = repairListingTitle("Tamagotchi Y2K Cute Clear Phone Case", facts);
  assert.ok(
    !/Hello Kitty/.test(repaired.title),
    `must not prepend a contradicted brand: ${repaired.title}`,
  );
});

test("a classification nothing supports is flagged rather than guessed at", () => {
  // Neither the title nor the tags nor the folder mention Mickey; the brand
  // column asserting it on its own is not evidence.
  const title = "Cute Puppy & Whale Glitter Phone Case with Beaded Strap";
  const facts = phoneCase({ ip: "Mickey Mouse", ipEvidence: ["glitter", "beaded_strap"] });
  assert.equal(ipVerdict(title, facts), "unverified");
  assert.ok(
    auditListingTitle(title, facts).some((i) => i.code === "brand_unverified"),
  );
  assert.ok(!/Mickey Mouse/.test(repairListingTitle(title, facts).title));
});

test("a title naming a sibling character contradicts the brand column", () => {
  // Stitch and Mickey are both Disney, so the brands agree and only the
  // character disagrees — still a disagreement, and still not ours to settle.
  const facts = phoneCase({ ip: "Mickey Mouse", ipEvidence: ["disney"] });
  assert.equal(ipVerdict("Stitch Skateboard PopSocket Phone Case", facts), "conflict");
});

test("naming only the umbrella brand is less specific, not a conflict", () => {
  const facts = phoneCase({ ip: "Hello Kitty", ipEvidence: ["hello_kitty"] });
  assert.equal(ipVerdict("Sanrio Pink Glitter Phone Case", facts), "addable");
});

test("MagSafe wording already in the prose is kept, not duplicated", () => {
  const facts = phoneCase({ ip: null, magsafe: true });
  const repaired = repairListingTitle(
    "Starry Sky Grid Phone Case with MagSafe Star Stand",
    facts,
  );
  assert.equal(
    repaired.title,
    "Starry Sky Grid Phone Case with MagSafe Star Stand for iPhone 17 16 15 Pro Max",
  );
  assert.equal(repaired.title.match(/MagSafe/gi)?.length, 1);
});

test("a MagSafe claim on a non-MagSafe product is stripped, not relocated", () => {
  const repaired = repairListingTitle(
    "Starry Sky Grid Phone Case with MagSafe Star Stand",
    phoneCase({ ip: null, magsafe: false }),
  );
  assert.ok(!/MagSafe/i.test(repaired.title), repaired.title);
});

test("the IP is resolved through the registry, character before brand", () => {
  assert.equal(listingIp("Sanrio", "Kuromi"), "Kuromi");
  assert.equal(listingIp("Rilakkuma", null), "Rilakkuma");
  // Legacy rows that put a character in the brand column still resolve.
  assert.equal(listingIp("Hello Kitty", null), "Hello Kitty");
  // A character we cannot place must not hide a brand we can.
  assert.equal(listingIp("Sanrio", "Totoro"), "Sanrio");
  assert.equal(listingIp("Totoro", null), null);
});

test("a composed title never exceeds the length budget", () => {
  const facts = phoneCase({ models: [...IPHONE_MODELS] });
  const { title, dropped } = composeListingTitle(
    `Extremely Detailed ${"Sparkly Iridescent Holographic ".repeat(4)}Finish`,
    facts,
  );
  assert.ok(title.length <= LISTING_TITLE_MAX, `${title.length} chars`);
  assert.ok(dropped.length > 0, "over-budget titles must report what they lost");
});

test("the noun never stutters against the device segment", () => {
  const { title } = composeListingTitle("Clear Glitter", phoneCase());
  assert.equal(title, "Rilakkuma Clear Glitter Phone Case for iPhone 17 16 15 Pro Max");
  assert.ok(!/iPhone Case for iPhone/.test(title));
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(
  failed === 0
    ? `\n  ✓ copy-guard: ${passed} checks passed\n`
    : `\n  ✗ copy-guard: ${failed} failed, ${passed} passed\n`,
);
process.exit(failed === 0 ? 0 : 1);
