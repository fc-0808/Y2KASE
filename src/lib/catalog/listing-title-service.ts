/**
 * Server-side orchestration for listing titles: gather the facts a title is
 * composed from, score the stored title against them, and propose a better one.
 *
 * The two proposal modes exist because they cost different things and fix
 * different problems:
 *
 *   • `repair` is deterministic, instant and free. It keeps the prose spine of
 *     the existing title and re-emits only the segments the contract owns — the
 *     character prefix, the device coverage, the MagSafe suffix. This is the
 *     right answer when only an owned segment is wrong (stale IP after a brand
 *     confirm, wrong model list, missing MagSafe).
 *
 *   • `rewrite` spends a vision call to get a fresh descriptive phrase. Used
 *     when Confirm & retitle runs, and whenever the prose itself is generic or
 *     wrong — "Clear Glitter Phone Case" is not a differentiator when half the
 *     catalogue already says it.
 *
 * Both end at the same composer, so both are held to the same contract.
 */
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { productImages, products } from "@/lib/db/schema";
import { MODEL_OPTION_NAME } from "@/lib/pricing";
import { MAGSAFE_TAG } from "@/lib/catalog/magsafe";
import { isOperatorConfirmed } from "@/lib/catalog/brands";
import { ensureBrandRegistry } from "@/lib/catalog/brand-registry";
import {
  classifyCharacterBrand,
  describeProductForTitle,
  visionBrandIsAuthoritative,
} from "@/lib/ai";
import {
  auditListingTitle,
  composeListingTitle,
  headFromDescriptor,
  listingIp,
  listingNoun,
  repairListingTitle,
  sanitizeDescriptor,
  type ListingTitleFacts,
  type TitleIssue,
} from "@/lib/catalog/listing-title";

/** A product's title alongside everything needed to judge and rebuild it. */
export type ProductTitleState = {
  productId: number;
  title: string;
  facts: ListingTitleFacts;
  issues: TitleIssue[];
};

/** Photos sent to the descriptor pass. Enough angles to see the accessories. */
const DESCRIBE_IMAGE_LIMIT = 6;

/** Load one product's title alongside the facts it should be composed from. */
export async function loadProductTitleState(
  productId: number,
): Promise<ProductTitleState | null> {
  await ensureBrandRegistry();
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      id: true,
      title: true,
      tags: true,
      sourceFolder: true,
      productType: true,
      brandName: true,
      characterName: true,
      brandEvidence: true,
    },
    with: { options: { columns: { name: true, values: true } } },
  });
  if (!product) return null;

  const facts = factsFromRow(product);

  return {
    productId: product.id,
    title: product.title,
    facts,
    issues: auditListingTitle(product.title, facts),
  };
}

/** A title's health, reduced to what a list row needs to render a badge. */
export type TitleHealth = {
  /** `error` = the title makes a false claim. `warning` = a missed opportunity. */
  severity: "error" | "warning";
  /** One line per issue, for the badge tooltip. */
  details: string[];
  /**
   * Whether the deterministic repair would actually change this title. A brand
   * conflict is an error that repair cannot settle — it needs a human or the
   * photos — so the bulk action can skip it instead of reporting a no-op fix.
   */
  repairable: boolean;
};

/**
 * Audit every title in the catalog in one pass.
 *
 * The product console renders a badge per row from this, which is the whole
 * point: an operator scanning the list can see which titles lie about their
 * device coverage without opening each product. Two queries total, so it costs
 * about the same as the list itself.
 */
export async function auditCatalogTitles(): Promise<Map<number, TitleHealth>> {
  await ensureBrandRegistry();
  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      title: true,
      tags: true,
      sourceFolder: true,
      productType: true,
      brandName: true,
      characterName: true,
      brandEvidence: true,
    },
    with: { options: { columns: { name: true, values: true } } },
  });

  const health = new Map<number, TitleHealth>();
  for (const row of rows) {
    const facts = factsFromRow(row);
    const issues = auditListingTitle(row.title, facts);
    if (issues.length === 0) continue;
    health.set(row.id, {
      severity: issues.some((issue) => issue.severity === "error")
        ? "error"
        : "warning",
      details: issues.map((issue) => issue.detail),
      repairable: repairListingTitle(row.title, facts).changed,
    });
  }
  return health;
}

/** The shape `loadProductTitleState` and the batch audit both read. */
type TitleFactsRow = {
  tags: string[];
  sourceFolder: string | null;
  productType: string;
  brandName: string | null;
  characterName: string | null;
  brandEvidence: string[] | null;
  options: { name: string; values: string[] }[];
};

/**
 * Device coverage comes from the product's own `iPhone Model` option values —
 * the same rows that render the buyer's model picker — so a title can only ever
 * claim models the product is actually purchasable for.
 */
function factsFromRow(row: TitleFactsRow): ListingTitleFacts {
  return {
    ip: listingIp(row.brandName, row.characterName),
    ipEvidence: [...row.tags, row.sourceFolder ?? ""],
    ipConfirmed: isOperatorConfirmed(row.brandEvidence),
    productTypeId: row.productType,
    models:
      row.options.find((option) => option.name === MODEL_OPTION_NAME)?.values ??
      [],
    magsafe: row.tags.includes(MAGSAFE_TAG),
  };
}

/**
 * Pull the descriptive core out of a stored title so sibling avoidance can
 * compare like with like — without the IP prefix or the device/MagSafe tail
 * the contract owns.
 */
function descriptiveCore(title: string, facts: ListingTitleFacts): string {
  let out = title;
  if (facts.ip) {
    const escaped = facts.ip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`^${escaped}\\s+`, "i"), "");
  }
  out = out
    .replace(/\s+for\s+iPhone\b.*$/i, "")
    .replace(/\s+[—–-]\s*MagSafe\b.*$/i, "")
    .replace(/\s+MagSafe\b.*$/i, "");
  return sanitizeDescriptor(out, facts);
}

/**
 * Descriptive phrases already used by other products of the same IP — fed to
 * the vision call so a Confirm & retitle does not invent the twelfth
 * "Clear Glitter" Miffy title.
 */
async function siblingDescriptors(
  productId: number,
  facts: ListingTitleFacts,
  brandName: string | null,
  characterName: string | null,
): Promise<string[]> {
  if (!brandName && !characterName) return [];

  const identityFilter = characterName
    ? eq(products.characterName, characterName)
    : eq(products.brandName, brandName!);

  const siblings = await db.query.products.findMany({
    where: and(ne(products.id, productId), identityFilter),
    columns: { title: true, brandName: true, characterName: true },
    limit: 24,
  });

  const cores = siblings
    .map((s) =>
      descriptiveCore(s.title, {
        ...facts,
        ip: listingIp(s.brandName, s.characterName) ?? facts.ip,
      }),
    )
    .filter((s) => s.length >= 3);

  return [...new Set(cores)].slice(0, 12);
}

async function productImageUrls(productId: number): Promise<string[]> {
  const images = await db.query.productImages.findMany({
    where: eq(productImages.productId, productId),
    columns: { url: true },
    orderBy: (img, { asc }) => asc(img.position),
    limit: DESCRIBE_IMAGE_LIMIT,
  });
  return images.map((image) => image.url);
}

export type VisionRetitleResult = {
  ok: boolean;
  title: string | null;
  message: string;
  source: "vision" | "deterministic" | null;
  notes: string[];
};

/**
 * Rebuild a title from the product photos while keeping the stored brand.
 *
 * This is what Confirm & retitle calls. It deliberately does *not* re-run the
 * vision brand classifier: the operator just confirmed (or corrected) the IP,
 * and a photo pass that disagrees would silently undo that decision. The
 * descriptive phrase is the only thing the model is allowed to invent; IP,
 * devices and MagSafe still come from data.
 *
 * Falls back to a deterministic repair when photos are missing or the model
 * fails — classification still lands, the title just keeps its old prose with
 * the new IP swapped in.
 */
export async function rewriteTitleKeepingBrand(
  productId: number,
): Promise<VisionRetitleResult> {
  const state = await loadProductTitleState(productId);
  if (!state) {
    return {
      ok: false,
      title: null,
      message: "Product not found.",
      source: null,
      notes: [],
    };
  }

  const notes: string[] = [];
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { brandName: true, characterName: true },
  });

  const urls = await productImageUrls(productId);
  if (urls.length === 0) {
    const repaired = repairListingTitle(state.title, state.facts);
    notes.push("no photos — fell back to the instant IP/device fix");
    return {
      ok: true,
      title: repaired.title,
      message: repaired.changed
        ? "No photos to read; applied the deterministic title fix instead."
        : "No photos to read, and the title already matches the product data.",
      source: "deterministic",
      notes,
    };
  }

  const avoid = await siblingDescriptors(
    productId,
    state.facts,
    product?.brandName ?? null,
    product?.characterName ?? null,
  );
  if (avoid.length > 0) {
    notes.push(`avoiding ${avoid.length} sibling descriptor${avoid.length === 1 ? "" : "s"}`);
  }

  const described = await describeProductForTitle(
    urls,
    {
      ip: state.facts.ip,
      noun: listingNoun(state.facts.productTypeId),
      avoid,
    },
    (msg) => notes.push(msg),
  );

  if (described) {
    const composed = composeListingTitle(
      headFromDescriptor(described.descriptor, state.facts),
      state.facts,
    );
    notes.push(...described.seen);
    return {
      ok: true,
      title: composed.title,
      message: "Rewritten from the product photos.",
      source: "vision",
      notes,
    };
  }

  const repaired = repairListingTitle(state.title, state.facts);
  notes.push("descriptor unavailable — fell back to the instant fix");
  return {
    ok: true,
    title: repaired.title,
    message:
      "The photos could not be read; applied the deterministic title fix instead.",
    source: "deterministic",
    notes,
  };
}

export type TitleProposalMode = "repair" | "rewrite";

export type TitleProposal = {
  title: string;
  /** Which path produced it — surfaced so the operator can weigh it. */
  source: "deterministic" | "vision";
  /** Short notes on what the proposal is based on. */
  notes: string[];
  /** Issues the stored title has, and the ones the proposal would still have. */
  issuesBefore: TitleIssue[];
  issuesAfter: TitleIssue[];
  /**
   * A brand reassignment the proposal depends on — set only when the photos
   * identified an IP the product is not currently classified as. Applying the
   * proposal applies this too, so the title and the classification can never
   * disagree with each other.
   */
  brand: { brandId: string; brandName: string; characterId: string | null; characterName: string | null } | null;
};

export type TitleProposalResult = {
  ok: boolean;
  message: string;
  proposal: TitleProposal | null;
};

/**
 * Propose a corrected title without writing anything.
 *
 * In `rewrite` mode the photos are also re-read for the IP, because a title
 * that needs a full rewrite is usually a title whose brand was never right
 * either — and composing a fresh title around a stale character just produces a
 * confidently wrong listing. A vision verdict only displaces the stored
 * classification when it clears the same confidence bar the ingest uses.
 */
export async function proposeListingTitle(
  productId: number,
  mode: TitleProposalMode,
): Promise<TitleProposalResult> {
  const state = await loadProductTitleState(productId);
  if (!state) {
    return { ok: false, message: "Product not found.", proposal: null };
  }

  const notes: string[] = [];
  let facts = state.facts;
  let brand: TitleProposal["brand"] = null;

  if (mode === "rewrite") {
    const urls = await productImageUrls(productId);
    if (urls.length === 0) {
      return {
        ok: false,
        message: "No photos to read — add images, or use the instant fix.",
        proposal: null,
      };
    }

    const seen = await classifyCharacterBrand(urls, (msg) => notes.push(msg));
    if (visionBrandIsAuthoritative(seen) && seen.brandId && seen.brand) {
      const ip = seen.character ?? seen.brand;
      if (ip !== facts.ip) {
        brand = {
          brandId: seen.brandId,
          brandName: seen.brand,
          characterId: seen.characterId,
          characterName: seen.character,
        };
        notes.push(`photos read as ${ip} (${seen.confidence} confidence)`);
        facts = { ...facts, ip };
      }
    }

    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
      columns: { brandName: true, characterName: true },
    });
    const avoid = await siblingDescriptors(
      productId,
      facts,
      brand?.brandName ?? product?.brandName ?? null,
      brand?.characterName ?? product?.characterName ?? null,
    );
    if (avoid.length > 0) {
      notes.push(
        `avoiding ${avoid.length} sibling descriptor${avoid.length === 1 ? "" : "s"}`,
      );
    }

    const described = await describeProductForTitle(
      urls,
      {
        ip: facts.ip,
        noun: listingNoun(facts.productTypeId),
        avoid,
      },
      (msg) => notes.push(msg),
    );

    if (described) {
      const composed = composeListingTitle(
        headFromDescriptor(described.descriptor, facts),
        facts,
      );
      notes.push(...described.seen);
      return {
        ok: true,
        message: "Rewritten from the product photos.",
        proposal: {
          title: composed.title,
          source: "vision",
          notes,
          issuesBefore: state.issues,
          issuesAfter: auditListingTitle(composed.title, facts),
          brand,
        },
      };
    }
    notes.push("descriptor unavailable — fell back to the instant fix");
  }

  const repaired = repairListingTitle(state.title, facts);
  if (!repaired.changed && !brand) {
    return {
      ok: false,
      message: "This title already matches the product's data — nothing to fix.",
      proposal: null,
    };
  }

  return {
    ok: true,
    message:
      mode === "rewrite"
        ? "The photos could not be read; here is the deterministic fix instead."
        : "Rebuilt from the product's brand, variants and MagSafe status.",
    proposal: {
      title: repaired.title,
      source: "deterministic",
      notes,
      issuesBefore: state.issues,
      issuesAfter: auditListingTitle(repaired.title, facts),
      brand,
    },
  };
}
