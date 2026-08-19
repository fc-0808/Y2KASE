import assert from "node:assert/strict";
import {
  MARKETING_TEMPLATE_VERSION,
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
  createStarterDraft,
  marketingPreflight,
  renderMarketingEmail,
  validateMarketingDraft,
} from "../src/lib/marketing/template";
import {
  LAUNCH_CLAIM_STALE_MS,
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

const starter = createStarterDraft("promotion");
assert.match(MARKETING_TEMPLATE_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
const valid = validateMarketingDraft(starter);
assert.equal(valid.ok, true, "professional starter must pass server validation");

const rendered = renderMarketingEmail(starter, {
  postalAddress: "Example Business Address, Hong Kong",
});
assert.match(rendered.html, /^<!DOCTYPE html>/);
assert.ok(rendered.html.includes(RESEND_UNSUBSCRIBE_PLACEHOLDER));
assert.ok(rendered.text.includes(RESEND_UNSUBSCRIBE_PLACEHOLDER));
assert.ok(rendered.html.includes("utm_source=email"));
assert.ok(rendered.html.includes("Example Business Address"));
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

const hostile = {
  ...starter,
  heading: `<script>alert("x")</script>`,
  body: `<img src=x onerror="alert(1)">`,
  promoCode: `"><svg onload=alert(1)>`,
};
const hostileRendered = renderMarketingEmail(hostile, {
  postalAddress: "Example & Co, Hong Kong",
});
assert.ok(!hostileRendered.html.includes("<script>"));
assert.ok(!hostileRendered.html.includes("<svg"));
assert.ok(!hostileRendered.html.includes("<img src=x"));
assert.ok(hostileRendered.html.includes("&lt;script&gt;"));
assert.ok(hostileRendered.html.includes("Example &amp; Co"));

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
