/**
 * Referrer labels for the Visitors table.
 * Pins the real referrers we already store, plus landing-query attribution.
 */
import assert from "node:assert/strict";
import {
  describeVisitSource,
  sanitizeLandingQuery,
} from "../src/lib/analytics/referrer";

function detail(referrer: string | null, search?: string | null) {
  return describeVisitSource(referrer, sanitizeLandingQuery(search ?? null));
}

assert.deepEqual(detail(null), {
  source: "Direct",
  detail: null,
  title: "Direct",
});

assert.deepEqual(detail("https://www.google.com/"), {
  source: "Google",
  detail: "Search",
  title: "https://www.google.com/",
});

assert.deepEqual(detail("https://accounts.google.com/"), {
  source: "Google",
  detail: "Sign-in",
  title: "https://accounts.google.com/",
});

assert.deepEqual(detail("https://l.instagram.com/"), {
  source: "Instagram",
  detail: "Tapped a link",
  title: "https://l.instagram.com/",
});

assert.equal(detail("https://instagram.com/").source, "Instagram");
assert.equal(detail("https://instagram.com/").detail, null);
assert.equal(detail("http://m.facebook.com/").detail, "Mobile site");
assert.equal(detail("https://www.facebook.com/").source, "Facebook");
assert.equal(detail("https://checkout.stripe.com/").detail, "Checkout");
assert.equal(detail("https://search.brave.com/").source, "Brave");
assert.equal(detail("https://www.bing.com/").detail, "Search");
assert.equal(detail("https://duckduckgo.com/").source, "DuckDuckGo");
assert.equal(detail("https://search.yahoo.com/").source, "Yahoo");
assert.equal(detail("https://www.ecosia.org/").source, "Ecosia");
assert.equal(detail("https://chatgpt.com/").source, "ChatGPT");
assert.equal(detail("https://alohafind.com/").source, "AlohaFind");

assert.deepEqual(detail("https://y2kase.com/products?q=Bytwily+"), {
  source: "Y2KASE",
  detail: '/products · search "Bytwily"',
  title: "https://y2kase.com/products?q=Bytwily+",
});

assert.equal(
  detail("https://y2kase.com/collections/sanrio/iphone-18-pro?page=2").detail,
  "/collections/sanrio/iphone-18-pro · page 2",
);

assert.equal(
  detail("https://y2kase.com/devices/iphone?brand=sanrio&magsafe=true").detail,
  "/devices/iphone · sanrio · MagSafe",
);

assert.deepEqual(detail("https://y2kase.com/?utm_source=chatgpt.com"), {
  source: "ChatGPT",
  detail: "Homepage",
  title: "https://y2kase.com/?utm_source=chatgpt.com",
});

assert.equal(detail("https://y2kase.com/products").detail, "/products");
assert.equal(detail("https://y2kase.com/").detail, "Homepage");

assert.equal(
  detail("https://www.google.com/", "?gclid=abc123").detail,
  "Ad",
);
assert.equal(
  detail("https://www.google.com/", "?srsltid=abc").detail,
  "Search result",
);
assert.deepEqual(
  detail(null, "?utm_source=instagram&utm_medium=paid_social&utm_campaign=kuromi"),
  {
    source: "Instagram",
    detail: "paid_social · campaign kuromi",
    title: "?utm_source=instagram&utm_medium=paid_social&utm_campaign=kuromi",
  },
);

assert.equal(sanitizeLandingQuery("?gclid=super-long-token&utm_source=google"), "utm_source=google&gclid=1");
assert.equal(sanitizeLandingQuery("?email=person@example.com"), null);
assert.equal(sanitizeLandingQuery("?q=kuromi"), null);

console.log("✓ analytics referrer labels passed");
