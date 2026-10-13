/**
 * Storefront review proof: excerpts, when a quote row is allowed to appear,
 * and when a post-purchase ask is allowed to send.
 *
 *   tsx scripts/check-review-proof.ts
 */
import assert from "node:assert/strict";
import {
  highlightFromReviews,
  pickLeadQuote,
  pickQuoteBand,
  reviewExcerpt,
  shortProductLabel,
  type QuoteCandidate,
} from "../src/lib/reviews/display";
import {
  signReviewInvite,
  verifyReviewInvite,
} from "../src/lib/reviews/invite";
import {
  isReviewReminderDue,
  isReviewRequestDue,
  reviewRequestDueAt,
} from "../src/lib/reviews/schedule";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  }
}

const ANGIE =
  "It’s a good quality phone case. It looks exactly like the picture and I love that the strawberry spins, the phone charm is pretty long not sure if its suppose to be like that but had to tie it a few times, phone can be a little hard to grip without the pop-socket, other then that";

test("a run-on review keeps the photo-match line and drops the complaint", () => {
  assert.equal(
    reviewExcerpt(ANGIE),
    "It’s a good quality phone case. It looks exactly like the picture and I love that the strawberry spins.",
  );
});

test("the buy-box sentence comes from this product's own review", () => {
  assert.deepEqual(highlightFromReviews([{ body: ANGIE, authorName: "Angie Smith" }]), {
    excerpt:
      "It’s a good quality phone case. It looks exactly like the picture and I love that the strawberry spins.",
    authorName: "Angie",
  });
  assert.equal(highlightFromReviews([{ body: "ok", authorName: "A" }]), null);
});

test("product labels stop before the device keyword list", () => {
  assert.equal(
    shortProductLabel(
      "Cute pastel bear clear phone case with bead strap for iPhone 18 17 16",
    ),
    "Cute pastel bear clear phone case with bead strap",
  );
});

function candidate(
  id: number,
  productId: number,
  body = ANGIE,
): QuoteCandidate {
  return {
    id,
    productId,
    rating: 4,
    body,
    authorName: "Angie",
    verified: id % 2 === 0,
    productTitle: `Case ${productId} for iPhone 16`,
    productSlug: `case-${productId}`,
    imageUrl: null,
  };
}

test("one review can lead the homepage and cannot fill a quote row", () => {
  const rows = [candidate(1, 10)];
  assert.equal(pickLeadQuote(rows)?.productId, 10);
  assert.deepEqual(pickQuoteBand(rows), []);
});

test("a quote row waits for eight reviews across three products", () => {
  const twoDesigns = Array.from({ length: 8 }, (_, index) =>
    candidate(index + 1, index < 4 ? 1 : 2),
  );
  assert.deepEqual(pickQuoteBand(twoDesigns), []);

  const threeDesigns = [
    ...twoDesigns.slice(0, 7),
    candidate(8, 3),
  ];
  const band = pickQuoteBand(threeDesigns);
  assert.deepEqual(
    band.map((quote) => quote.productId),
    [1, 2, 3],
  );
});

test("the quote row skips the homepage lead and stops at six products", () => {
  const rows = Array.from({ length: 8 }, (_, index) =>
    candidate(index + 1, index + 1),
  );
  const lead = pickLeadQuote(rows);
  const band = pickQuoteBand(rows, lead?.id);
  assert.equal(band.length, 6);
  assert.equal(
    band.some((quote) => quote.id === lead?.id),
    false,
  );
  assert.deepEqual(
    band.map((quote) => quote.productId),
    [2, 3, 4, 5, 6, 7],
  );
});

test("review requests wait out the published delivery window", () => {
  const shipped = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    reviewRequestDueAt(shipped, "HK").toISOString(),
    "2026-01-07T00:00:00.000Z",
  );
  assert.equal(
    reviewRequestDueAt(shipped, "US").toISOString(),
    "2026-01-18T00:00:00.000Z",
  );
  assert.equal(
    reviewRequestDueAt(shipped, "United States").toISOString(),
    "2026-01-25T00:00:00.000Z",
  );
  assert.equal(
    isReviewRequestDue(shipped, "US", new Date("2026-01-17T00:00:00.000Z")),
    false,
  );
  assert.equal(
    isReviewRequestDue(shipped, "US", new Date("2026-01-18T00:00:00.000Z")),
    true,
  );
  assert.equal(
    isReviewRequestDue(shipped, "US", new Date("2026-02-16T00:00:00.000Z")),
    false,
  );
});

test("the reminder is one follow-up inside the 45-day window", () => {
  const shipped = new Date("2026-01-01T00:00:00.000Z");
  const sent = new Date("2026-01-18T00:00:00.000Z");
  assert.equal(
    isReviewReminderDue(sent, shipped, new Date("2026-01-27T00:00:00.000Z")),
    false,
  );
  assert.equal(
    isReviewReminderDue(sent, shipped, new Date("2026-01-28T00:00:00.000Z")),
    true,
  );
  assert.equal(
    isReviewReminderDue(sent, shipped, new Date("2026-02-20T00:00:00.000Z")),
    false,
  );
});

test("a review link verifies one order and one product, then expires", () => {
  const issued = Date.parse("2026-06-01T00:00:00.000Z");
  const token = signReviewInvite(41, 9, issued);
  const parsed = verifyReviewInvite(token, Date.parse("2026-06-02T00:00:00.000Z"));
  assert.equal(parsed?.orderId, 41);
  assert.equal(parsed?.productId, 9);
  assert.equal(
    verifyReviewInvite(token, Date.parse("2026-08-15T00:00:00.000Z")),
    null,
  );
  const [body, signature] = token.split(".");
  const flipped = signature!.slice(0, -1) + (signature!.endsWith("a") ? "b" : "a");
  assert.equal(verifyReviewInvite(`${body}.${flipped}`), null);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`review proof: ${passed} passed`);
