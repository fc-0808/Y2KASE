import assert from "node:assert/strict";
import {
  MARKETING_TEMPLATE_VERSION,
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
  createStarterDraft,
  marketingPreflight,
  marketingSendBlockers,
  renderMarketingEmail,
  validateMarketingDraft,
} from "../src/lib/marketing/template";
import {
  applyVerifiedOfferEmphasis,
  normalizeEmphasisMarkup,
  renderInlineEmphasisHtml,
  stripEmphasisMarkup,
} from "../src/lib/marketing/emphasis";
import {
  LAUNCH_CLAIM_STALE_MS,
  isDeletableMarketingCampaign,
  isEditableMarketingCampaign,
  isRecoverablePreparingCampaign,
} from "../src/lib/marketing/campaign-status";
import {
  sanitizeUtmParams,
  utmToMetadata,
} from "../src/lib/analytics/utm";
import {
  isMarketingSendable,
  subscriberLifecycleStatus,
} from "../src/lib/marketing/audience";
import {
  marketingCopyQualityWarnings,
  subjectCandidateIsProfessional,
} from "../src/lib/marketing/copy-quality";
import {
  bundleMechanicsCoverage,
  bundleOfferPromptContext,
  isBuyTwoGetTwoOfferText,
} from "../src/lib/marketing/offer";
import {
  MARKETING_HERO_OUTPUT,
  buildMarketingHeroAlt,
  isLegacyGenerativeMarketingHeroUrl,
  isMarketingHeroStyle,
  recommendedMarketingHeroReferenceCount,
  selectMarketingHeroReferenceIds,
} from "../src/lib/marketing/hero";
import {
  resolveBroadcastCoupon,
  resolveLocalCoupon,
} from "../src/lib/promotions";

const starter = createStarterDraft("promotion");
assert.match(MARKETING_TEMPLATE_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
const valid = validateMarketingDraft(starter);
assert.equal(valid.ok, true, "professional starter must pass server validation");
assert.ok(
  valid.ok &&
    valid.value.body.includes("**2 lowest-priced items are free**"),
  "promotion starter must emphasise the concrete customer benefit",
);
assert.deepEqual(
  marketingPreflight(starter),
  [],
  "professional bundle starter must pass every automated copy check",
);
assert.equal(starter.subject, "Pick 4 favorites. Pay for 2.");
assert.equal(starter.ctaLabel, "Build your bundle");
for (const type of [
  "product-launch",
  "restock",
  "newsletter",
  "seasonal",
] as const) {
  assert.deepEqual(
    marketingPreflight(createStarterDraft(type)),
    [],
    `${type} professional starter must pass automated copy checks`,
  );
}
assert.ok(
  marketingPreflight(createStarterDraft("announcement")).some(
    (warning) => warning.code === "placeholder-copy",
  ),
  "announcement instructions must never look send-ready",
);

const rendered = renderMarketingEmail(starter, {
  postalAddress: "Example Business Address, Hong Kong",
});
assert.match(rendered.html, /^<!DOCTYPE html>/);
assert.ok(rendered.html.includes(RESEND_UNSUBSCRIBE_PLACEHOLDER));
assert.ok(rendered.text.includes(RESEND_UNSUBSCRIBE_PLACEHOLDER));
assert.ok(rendered.html.includes("utm_source=email"));
assert.ok(rendered.html.includes("Example Business Address"));
assert.ok(
  rendered.html.includes(
    '<strong style="font-weight:800;color:#ff3ea5;">2 lowest-priced items are free</strong>',
  ),
  "emphasis markup must render as branded strong tags",
);
assert.ok(
  !rendered.text.includes("**"),
  "plain-text part must strip emphasis markers",
);
assert.ok(!rendered.html.includes("Hey bestie"), "greeting filler removed");
assert.ok(!rendered.html.includes("<style"));
assert.ok(!rendered.html.includes("<script"));
assert.ok(!rendered.html.includes("<form"));

const attributed = renderMarketingEmail(starter, {
  postalAddress: "Example Business Address, Hong Kong",
  campaignId: "11111111-1111-4111-8111-111111111111",
});
assert.ok(
  attributed.html.includes(
    "utm_id=11111111-1111-4111-8111-111111111111",
  ),
);

const imageDraft = {
  ...starter,
  heroImageUrl: "https://media.example.com/campaign-hero.jpg",
  heroImageAlt: "Four Y2KASE phone cases on a pastel background.",
};
const imageRendered = renderMarketingEmail(imageDraft, {
  postalAddress: "Example Business Address, Hong Kong",
  campaignId: "11111111-1111-4111-8111-111111111111",
});
assert.ok(
  imageRendered.html.includes(
    '<a href="https://y2kase.com/products?utm_source=email',
  ),
  "campaign hero must link to the tracked CTA",
);
assert.ok(
  imageRendered.html.includes('width="600" height="360"'),
  "campaign hero must reserve a stable 5:3 display box",
);
assert.ok(
  imageRendered.html.includes(
    'alt="Four Y2KASE phone cases on a pastel background."',
  ),
  "campaign hero must preserve accessible alt text",
);

const heroReferences = [
  {
    title: "Pink Kitty MagSafe Case",
    imageUrl: "https://media.example.com/kitty.jpg",
  },
  {
    title: "Lavender Bunny Phone Case",
    imageUrl: "https://media.example.com/bunny.jpg",
  },
];
assert.equal(isMarketingHeroStyle("pastel-flatlay"), true);
assert.equal(isMarketingHeroStyle("invented-style"), false);
assert.equal(MARKETING_HERO_OUTPUT.width, 1200);
assert.equal(MARKETING_HERO_OUTPUT.height, 720);
assert.equal(MARKETING_HERO_OUTPUT.maxBytes, 250 * 1024);
assert.ok(buildMarketingHeroAlt(heroReferences).length <= 160);
assert.ok(
  buildMarketingHeroAlt([
    {
      title: "Very Cute ".repeat(30),
      imageUrl: "https://media.example.com/long-title.jpg",
    },
  ]).length > 1,
  "long generated alt text must truncate without becoming empty",
);
const retiredHeroUrl =
  "https://media.example.com/marketing/campaigns/abc/hero-123456-a1b2c3d4.jpg";
assert.equal(isLegacyGenerativeMarketingHeroUrl(retiredHeroUrl), true);
assert.equal(
  isLegacyGenerativeMarketingHeroUrl(
    "https://media.example.com/marketing/campaigns/abc/hero-catalog-v1-123456-a1b2c3d4.jpg",
  ),
  false,
);
assert.equal(
  validateMarketingDraft({
    ...starter,
    heroImageUrl: retiredHeroUrl,
    heroImageAlt: "A retired AI-generated image.",
  }).ok,
  false,
  "retired model-repainted product heroes must be blocked from test/send",
);
assert.equal(
  recommendedMarketingHeroReferenceCount({
    campaignType: "promotion",
    campaignText: "Buy 2, Get 2 Free — add four cases to your bag.",
  }),
  4,
);
assert.equal(
  recommendedMarketingHeroReferenceCount({
    campaignType: "product-launch",
    campaignText: "Meet the new case.",
  }),
  1,
);
const smartReferences = selectMarketingHeroReferenceIds({
  campaignId: "11111111-1111-4111-8111-111111111111",
  products: [
    { id: 1, imageUrl: "https://media.example.com/1.jpg" },
    { id: 2, imageUrl: "https://media.example.com/2.jpg" },
    { id: 3, imageUrl: null },
    { id: 4, imageUrl: "https://media.example.com/4.jpg" },
    { id: 5, imageUrl: "https://media.example.com/5.jpg" },
    { id: 6, imageUrl: "https://media.example.com/6.jpg" },
  ],
  targetCount: 4,
  featuredProductId: 4,
});
assert.equal(smartReferences.length, 4);
assert.equal(smartReferences[0], 4);
assert.equal(smartReferences.includes(3), false);
assert.deepEqual(
  smartReferences,
  selectMarketingHeroReferenceIds({
    campaignId: "11111111-1111-4111-8111-111111111111",
    products: [
      { id: 1, imageUrl: "https://media.example.com/1.jpg" },
      { id: 2, imageUrl: "https://media.example.com/2.jpg" },
      { id: 3, imageUrl: null },
      { id: 4, imageUrl: "https://media.example.com/4.jpg" },
      { id: 5, imageUrl: "https://media.example.com/5.jpg" },
      { id: 6, imageUrl: "https://media.example.com/6.jpg" },
    ],
    targetCount: 4,
    featuredProductId: 4,
  }),
  "smart product selection must be stable for a campaign",
);
assert.equal(
  selectMarketingHeroReferenceIds({
    campaignId: "invalid-target",
    products: [{ id: 1, imageUrl: "https://media.example.com/1.jpg" }],
    targetCount: Number.NaN,
  }).length,
  1,
);

const hostile = {
  ...starter,
  heading: `<script>alert("x")</script>`,
  body: `**<img src=x onerror="alert(1)">** and <script>alert(1)</script>`,
  promoCode: `"><svg onload=alert(1)>`,
};
const hostileRendered = renderMarketingEmail(hostile, {
  postalAddress: "Example & Co, Hong Kong",
});
assert.ok(!hostileRendered.html.includes("<script>"));
assert.ok(!hostileRendered.html.includes("<svg"));
assert.ok(!hostileRendered.html.includes("<img src=x"));
assert.ok(hostileRendered.html.includes("&lt;script&gt;"));
assert.ok(hostileRendered.html.includes("&lt;img"));
assert.ok(hostileRendered.html.includes("Example &amp; Co"));

assert.equal(
  normalizeEmphasisMarkup("Add **Buy 2, Get 2 Free** today**"),
  "Add **Buy 2, Get 2 Free** today",
);
assert.equal(
  stripEmphasisMarkup("Add **Buy 2, Get 2 Free** today"),
  "Add Buy 2, Get 2 Free today",
);
assert.ok(
  renderInlineEmphasisHtml("Save with **50%** off", "body").includes(
    '<strong style="font-weight:800;color:#ff3ea5;">50%</strong>',
  ),
);

const autoEmphasised = applyVerifiedOfferEmphasis(
  {
    heading: "Your cart can unlock a little extra",
    body: "Add 4 eligible units and Buy 2, Get 2 Free applies automatically.",
  },
  "Buy 2, Get 2 Free — automatic at 4 units, no code",
);
assert.equal(
  autoEmphasised.body,
  "Add 4 eligible units and **Buy 2, Get 2 Free** applies automatically.",
);
assert.equal(
  autoEmphasised.heading,
  "Your cart can unlock a little extra",
  "post-processing must not repeat the offer in an otherwise unmarked heading",
);

assert.equal(isBuyTwoGetTwoOfferText("Buy 4, pay for 2"), true);
assert.equal(isBuyTwoGetTwoOfferText("A regular product launch"), false);
assert.match(bundleOfferPromptContext(), /2 lowest-priced items/);
assert.deepEqual(
  bundleMechanicsCoverage(
    "Add any 4 cases or charms. The 2 lowest-priced items are free automatically. For every 4 items, 2 are free. Coupon codes can’t be combined.",
  ),
  {
    itemCount: true,
    freeCount: true,
    automatic: true,
    repeating: true,
    nonStacking: true,
  },
);
assert.equal(subjectCandidateIsProfessional("Pick 4. Pay for 2."), true);
assert.equal(subjectCandidateIsProfessional("FREE!!! FREE!!!"), false);
assert.ok(
  marketingCopyQualityWarnings({
    ...starter,
    subject: "Buy 2 get 2 free",
    previewText: "Buy 2 get 2 free today",
    ctaLabel: "Shop now",
    body: "This is your sign to shop now.",
  }).some((warning) => warning.code === "generic-cta"),
);
assert.ok(
  marketingCopyQualityWarnings({
    ...starter,
    eyebrow: "BUY 2, GET 2 FREE",
    heading: "Mix, match, and get Buy 2, Get 2 Free",
  }).some((warning) => warning.code === "heading-eyebrow-overlap"),
  "repeating the offer label as the heading must trigger a quality warning",
);
assert.equal(
  validateMarketingDraft({
    ...starter,
    promoCode: "BESTIE10",
  }).ok,
  false,
  "automatic bundle campaigns must reject stacked promo codes",
);
assert.equal(resolveBroadcastCoupon("BESTIE10")?.percentOff, 10);
assert.equal(resolveBroadcastCoupon("BESTIE20"), null);
assert.equal(resolveBroadcastCoupon("WELCOME15"), null);
assert.equal(
  resolveLocalCoupon("WELCOME15")?.percentOff,
  15,
  "retired issued codes must remain redeemable at checkout",
);
assert.equal(
  validateMarketingDraft({
    ...createStarterDraft("announcement"),
    promoCode: "WELCOME15",
  }).ok,
  false,
  "retired coupon codes must be blocked from broadcast campaigns",
);
assert.equal(
  validateMarketingDraft({
    ...createStarterDraft("announcement"),
    promoCode: "BESTIE20",
  }).ok,
  false,
  "individual scratch-card codes must be blocked from full-list campaigns",
);
assert.equal(
  validateMarketingDraft({
    ...createStarterDraft("announcement"),
    promoCode: "BESTIE10",
  }).ok,
  true,
  "broadcast-approved coupon must remain available",
);
assert.ok(
  marketingSendBlockers({
    ...starter,
    previewText: "Choose four favorites.",
    body: "Pick four products and build a set.",
  }).some((blocker) => blocker.code === "bundle-terms-blocker"),
);

const externalLink = validateMarketingDraft({
  ...starter,
  ctaUrl: "https://example.com/phishing",
});
assert.equal(externalLink.ok, false, "CTA must remain on the verified brand domain");

const inaccessibleImage = validateMarketingDraft({
  ...starter,
  heroImageUrl: "https://images.example.com/product.jpg",
  heroImageAlt: "",
});
assert.equal(
  inaccessibleImage.ok,
  false,
  "hero images must include accessible alt text",
);
const privateImage = validateMarketingDraft({
  ...starter,
  heroImageUrl: "https://127.0.0.1/internal.jpg",
  heroImageAlt: "Internal image",
});
assert.equal(privateImage.ok, false, "hero image must not target a private host");

const headerInjection = validateMarketingDraft({
  ...starter,
  subject: "Hello\r\nBcc: attacker@example.com",
});
assert.equal(headerInjection.ok, true);
if (headerInjection.ok) {
  assert.ok(!/[\r\n]/.test(headerInjection.value.subject));
}

const providerTemplateInjection = validateMarketingDraft({
  ...starter,
  body: "Hi {{{contact.email}}}",
});
assert.equal(
  providerTemplateInjection.ok,
  false,
  "editable copy must not inject provider template expressions",
);

const preflightCodes = new Set(
  marketingPreflight({
    ...starter,
    subject: "THIS IS AN EXTREMELY LONG SUBJECT LINE WITH TOO MUCH ENERGY!!!",
  }).map((warning) => warning.code),
);
assert.ok(preflightCodes.has("long-subject"));
assert.ok(preflightCodes.has("uppercase-subject"));
assert.ok(preflightCodes.has("subject-punctuation"));
assert.ok(
  marketingPreflight({
    ...starter,
    heroImageUrl: "https://media.example.com/hero.webp",
    heroImageAlt: "A campaign hero.",
  }).some((warning) => warning.code === "email-image-format"),
  "preflight must flag image formats with inconsistent email-client support",
);

const safeAttribution = sanitizeUtmParams({
  source: `  ${"social ".repeat(30)}  `,
  campaign: "summer-drop",
  fbclid: "f".repeat(400),
  landingUrl: `https://y2kase.com/products?${"x".repeat(600)}`,
  unexpected: "must-not-pass",
});
assert.ok(safeAttribution);
assert.equal(safeAttribution.source?.length, 100);
assert.equal(safeAttribution.fbclid?.length, 255);
assert.equal(safeAttribution.landingUrl?.length, 500);
assert.equal(
  Object.prototype.hasOwnProperty.call(safeAttribution, "unexpected"),
  false,
);
assert.equal(sanitizeUtmParams(["not", "an", "object"]), null);
const stripeMetadata = utmToMetadata(safeAttribution);
assert.equal(stripeMetadata.utm_campaign, "summer-drop");
assert.equal(stripeMetadata.fbclid.length, 255);

const now = Date.UTC(2026, 7, 18, 12, 0, 0);
assert.equal(
  isRecoverablePreparingCampaign({
    status: "preparing",
    updatedAt: new Date(now - LAUNCH_CLAIM_STALE_MS + 1_000).toISOString(),
    now,
  }),
  false,
  "a fresh preparing claim must stay locked",
);
assert.equal(
  isRecoverablePreparingCampaign({
    status: "preparing",
    updatedAt: new Date(now - LAUNCH_CLAIM_STALE_MS).toISOString(),
    now,
  }),
  true,
  "a five-minute-old preparing claim must become recoverable",
);
assert.equal(
  isRecoverablePreparingCampaign({
    status: "queued",
    updatedAt: new Date(now - LAUNCH_CLAIM_STALE_MS * 2).toISOString(),
    now,
  }),
  false,
  "only preparing rows are recoverable through the stale-claim path",
);
assert.equal(
  isDeletableMarketingCampaign({
    status: "draft",
    resendBroadcastId: null,
  }),
  true,
);
assert.equal(
  isDeletableMarketingCampaign({
    status: "failed",
    resendBroadcastId: "provider-broadcast",
  }),
  false,
);
assert.equal(
  isDeletableMarketingCampaign({ status: "sent", resendBroadcastId: null }),
  false,
);
assert.equal(
  isEditableMarketingCampaign({
    status: "preparing",
    resendBroadcastId: null,
    updatedAt: new Date(now - LAUNCH_CLAIM_STALE_MS),
    now,
  }),
  true,
);

assert.equal(
  isMarketingSendable({ status: "active" }),
  true,
  "active members are sendable even when consent ledger columns were never backfilled",
);
assert.equal(isMarketingSendable({ status: "unsubscribed" }), false);
assert.equal(isMarketingSendable(null), false);
assert.equal(isMarketingSendable(undefined), false);
assert.equal(isMarketingSendable({ status: "pending" }), false);
assert.equal(
  subscriberLifecycleStatus({
    status: "active",
  }),
  "active",
);
assert.equal(
  subscriberLifecycleStatus({ status: "unsubscribed" }),
  "unsubscribed",
);
assert.equal(subscriberLifecycleStatus({ status: "unknown" }), "unsubscribed");

console.log("✓ marketing template safety checks passed");
