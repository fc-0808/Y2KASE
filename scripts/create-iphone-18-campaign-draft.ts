/**
 * Create (or refresh) the Club Email draft for the iPhone 18 Pro / Pro Max
 * catalog update, with Buy 2, Get 2 Free stated from the checkout engine.
 *
 *   npx tsx scripts/create-iphone-18-campaign-draft.ts
 *
 * Hero pixels come from live catalogue photos, composed by the same
 * Sharp path Campaign Studio uses — never an image model, so printed
 * artwork cannot drift from the PDP.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, like } from "drizzle-orm";
import { db } from "../src/lib/db";
import { marketingCampaigns, products, users } from "../src/lib/db/schema";
import { loadImage } from "../src/lib/catalog/image-source";
import { makeR2Client, uploadImageToR2 } from "../src/lib/catalog/r2";
import { canonicalizePublicR2Url } from "../src/lib/catalog/r2-public";
import { offeredCompatibilityValues } from "../src/lib/catalog/offered-options";
import { composeCatalogMarketingHero } from "../src/lib/marketing/hero-compose";
import {
  MARKETING_HERO_OUTPUT,
  buildMarketingHeroAlt,
} from "../src/lib/marketing/hero";
import { BUNDLE_MARKETING } from "../src/lib/marketing/offer";
import {
  marketingCopyQualityWarnings,
  subjectCandidateIsProfessional,
} from "../src/lib/marketing/copy-quality";
import {
  MARKETING_TEMPLATE_VERSION,
  marketingPreflight,
  marketingSendBlockers,
  validateMarketingDraft,
} from "../src/lib/marketing/template";
import type { MarketingDraft } from "../src/lib/marketing/types";
import { SUPPORT_EMAIL } from "../src/lib/support/constants";

const IPHONE_18_PRO = "iPhone 18 Pro";
const IPHONE_18_PRO_MAX = "iPhone 18 Pro Max";
const DRAFT_NAME = "iPhone 18 Pro / Pro Max · Buy 2 Get 2";
const HERO_STYLE = "holographic-editorial" as const;
const HERO_COUNT = 4;

type CatalogPick = {
  id: number;
  title: string;
  slug: string;
  imageUrl: string;
  brandName: string | null;
  characterName: string | null;
  featured: boolean;
};

function draftCopy(): MarketingDraft {
  return {
    name: DRAFT_NAME,
    campaignType: "product-launch",
    subject: "iPhone 18 Pro and Pro Max cases are live",
    previewText:
      "Pro Max fits just landed. Add 4 — the 2 lowest-priced are free.",
    eyebrow: "NEW MODEL FIT",
    heading: "iPhone 18 Pro and Pro Max **are on the site.**",
    body: [
      `Y2KASE iPhone cases now include **${IPHONE_18_PRO}** and **${IPHONE_18_PRO_MAX}** as selectable models. Same prints as the listing photos; MagSafe stays on the cases already tagged for it.`,
      `While you pick a fit, **${BUNDLE_MARKETING.name}** is on. Add any ${BUNDLE_MARKETING.qualifyingItems} ${BUNDLE_MARKETING.eligibleProductCopy} and the **${BUNDLE_MARKETING.freeItems} lowest-priced items are free** automatically—no code needed.`,
      `For every ${BUNDLE_MARKETING.qualifyingItems} items, ${BUNDLE_MARKETING.freeItems} are free. Coupon codes cannot be combined with the bundle; your bag shows the savings before checkout.`,
    ].join("\n\n"),
    ctaLabel: "Shop the 18 Pro lineup",
    ctaUrl: BUNDLE_MARKETING.collectionUrl,
    heroImageUrl: "",
    heroImageAlt: "",
    promoCode: "",
  };
}

function hasIphone18ProFits(models: readonly string[]): boolean {
  return models.includes(IPHONE_18_PRO) && models.includes(IPHONE_18_PRO_MAX);
}

function pickHeroProducts(candidates: CatalogPick[]): CatalogPick[] {
  const selected: CatalogPick[] = [];
  const usedBrands = new Set<string>();
  const usedCharacters = new Set<string>();

  const consider = (product: CatalogPick) => {
    if (selected.some((row) => row.id === product.id)) return;
    const brand = product.brandName?.trim().toLowerCase() ?? "";
    const character = product.characterName?.trim().toLowerCase() ?? "";
    if (brand && usedBrands.has(brand) && selected.length < HERO_COUNT - 1) {
      return;
    }
    if (
      character &&
      usedCharacters.has(character) &&
      selected.length < HERO_COUNT - 1
    ) {
      return;
    }
    selected.push(product);
    if (brand) usedBrands.add(brand);
    if (character) usedCharacters.add(character);
  };

  for (const product of candidates.filter((row) => row.featured)) {
    if (selected.length >= HERO_COUNT) break;
    consider(product);
  }
  for (const product of candidates) {
    if (selected.length >= HERO_COUNT) break;
    consider(product);
  }
  if (selected.length < HERO_COUNT) {
    for (const product of candidates) {
      if (selected.length >= HERO_COUNT) break;
      if (!selected.some((row) => row.id === product.id)) selected.push(product);
    }
  }
  return selected.slice(0, HERO_COUNT);
}

async function loadIphone18Cases(): Promise<CatalogPick[]> {
  const rows = await db.query.products.findMany({
    where: and(eq(products.status, "active"), eq(products.productType, "iphone_case")),
    columns: {
      id: true,
      slug: true,
      title: true,
      featured: true,
      featuredPosition: true,
      brandName: true,
      characterName: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (image, { asc }) => asc(image.position),
        limit: 1,
      },
      options: {
        columns: { name: true, values: true },
        orderBy: (option, { asc }) => asc(option.position),
      },
    },
    orderBy: (product, { asc, desc }) => [
      desc(product.featured),
      asc(product.featuredPosition),
      desc(product.id),
    ],
    limit: 400,
  });

  return rows.flatMap((row) => {
    const imageUrl = row.images[0]?.url
      ? canonicalizePublicR2Url(row.images[0].url)
      : null;
    if (!imageUrl) return [];
    const models = offeredCompatibilityValues("iphone_case", row.options);
    if (!hasIphone18ProFits(models)) return [];
    return [
      {
        id: row.id,
        title: row.title,
        slug: row.slug,
        imageUrl,
        brandName: row.brandName,
        characterName: row.characterName,
        featured: row.featured,
      },
    ];
  });
}

function r2Ready(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL,
  );
}

function contentHash(draft: MarketingDraft): string {
  const ordered = [
    draft.name,
    draft.campaignType,
    draft.subject,
    draft.previewText,
    draft.eyebrow,
    draft.heading,
    draft.body,
    draft.ctaLabel,
    draft.ctaUrl,
    draft.heroImageUrl,
    draft.heroImageAlt,
    draft.promoCode,
    MARKETING_TEMPLATE_VERSION,
    new Date().getUTCFullYear(),
    process.env.MARKETING_POSTAL_ADDRESS?.trim() || "",
    process.env.EMAIL_FROM_MARKETING?.trim() ||
      process.env.EMAIL_FROM?.trim() ||
      "Y2KASE <orders@send.y2kase.com>",
    SUPPORT_EMAIL,
  ];
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

async function composeAndUploadHero(
  campaignId: string,
  picks: CatalogPick[],
): Promise<{ imageUrl: string; width: number; height: number; byteSize: number }> {
  if (!r2Ready()) {
    throw new Error("Campaign hero creation requires complete R2 configuration.");
  }
  const images = await Promise.all(
    picks.map((pick) => loadImage(pick.imageUrl)),
  );
  const jpeg = await composeCatalogMarketingHero(
    images.map((image) => image.bytes),
    HERO_STYLE,
  );
  const campaignKey = campaignId.replace(/[^a-z0-9-]/gi, "");
  const key = `marketing/campaigns/${campaignKey}/hero-catalog-v1-${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
  const imageUrl = await uploadImageToR2(
    makeR2Client(),
    process.env.R2_BUCKET_NAME!,
    key,
    jpeg,
    "image/jpeg",
  );
  return {
    imageUrl,
    width: MARKETING_HERO_OUTPUT.width,
    height: MARKETING_HERO_OUTPUT.height,
    byteSize: jpeg.byteLength,
  };
}

function assertDraftQuality(draft: MarketingDraft): void {
  const validated = validateMarketingDraft(draft);
  if (!validated.ok) {
    throw new Error(`Draft failed validation: ${validated.errors.join(" ")}`);
  }
  if (!subjectCandidateIsProfessional(draft.subject)) {
    throw new Error("Subject failed the professional-subject check.");
  }
  const blockers = marketingSendBlockers(validated.value);
  const warnings = [
    ...marketingCopyQualityWarnings(validated.value),
    ...marketingPreflight(validated.value),
  ];
  const unique = [...new Map(warnings.map((item) => [item.code, item])).values()];
  if (blockers.length > 0 || unique.length > 0) {
    throw new Error(
      [
        ...blockers.map((item) => `blocker ${item.code}: ${item.message}`),
        ...unique.map((item) => `warning ${item.code}: ${item.message}`),
      ].join("\n"),
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const admin = await db.query.users.findFirst({
    where: eq(users.role, "admin"),
    columns: { id: true, email: true },
    orderBy: (row, { asc }) => [asc(row.createdAt)],
  });
  if (!admin) throw new Error("No admin user exists to own the draft.");

  const existing = await db.query.marketingCampaigns.findFirst({
    where: and(
      eq(marketingCampaigns.status, "draft"),
      like(marketingCampaigns.name, "iPhone 18 Pro%"),
    ),
    orderBy: desc(marketingCampaigns.updatedAt),
    columns: { id: true, name: true },
  });
  const campaignId = existing?.id ?? randomUUID();

  const candidates = await loadIphone18Cases();
  const picks = pickHeroProducts(candidates);
  if (picks.length < HERO_COUNT) {
    throw new Error(
      `Need ${HERO_COUNT} live iPhone cases with ${IPHONE_18_PRO} / ${IPHONE_18_PRO_MAX} photos; found ${picks.length}.`,
    );
  }

  console.log(
    `Hero references (${picks.length} of ${candidates.length} matching cases):`,
  );
  for (const pick of picks) {
    console.log(
      `  · #${pick.id} ${pick.featured ? "★" : " "} ${pick.title}`,
    );
  }

  const generated = await composeAndUploadHero(campaignId, picks);
  const draft: MarketingDraft = {
    ...draftCopy(),
    heroImageUrl: generated.imageUrl,
    heroImageAlt: buildMarketingHeroAlt(
      picks.map((pick) => ({ title: pick.title, imageUrl: pick.imageUrl })),
    ),
  };
  assertDraftQuality(draft);

  const now = new Date();
  const hash = contentHash(draft);
  if (existing) {
    await db
      .update(marketingCampaigns)
      .set({
        ...draft,
        heroImageUrl: draft.heroImageUrl,
        heroImageAlt: draft.heroImageAlt,
        promoCode: null,
        contentHash: hash,
        testedContentHash: null,
        reviewedContentHash: null,
        reviewedBy: null,
        reviewedAt: null,
        lastError: null,
        status: "draft",
        updatedAt: now,
      })
      .where(eq(marketingCampaigns.id, campaignId));
  } else {
    await db.insert(marketingCampaigns).values({
      id: campaignId,
      createdBy: admin.id,
      ...draft,
      heroImageUrl: draft.heroImageUrl,
      heroImageAlt: draft.heroImageAlt,
      promoCode: null,
      contentHash: hash,
      status: "draft",
      updatedAt: now,
    });
  }

  console.log("\nDraft saved.");
  console.log(`  id:     ${campaignId}`);
  console.log(`  name:   ${draft.name}`);
  console.log(`  type:   ${draft.campaignType}`);
  console.log(`  status: draft`);
  console.log(`  owner:  ${admin.email}`);
  console.log(`  hero:   ${generated.imageUrl}`);
  console.log(
    `          ${generated.width}×${generated.height} · ${Math.ceil(generated.byteSize / 1024)} KB`,
  );
  console.log(`  open:   http://localhost:3001/admin/campaigns`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
