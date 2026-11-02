/**
 * Turn a stored document referrer, plus the landing page's attribution
 * query, into the source and the specific detail shown in Visitors.
 *
 * Cross-origin referrers usually arrive as an origin only (`https://www.google.com/`).
 * The landing query is where ad clicks and campaign names still show up.
 */

export type VisitSource = {
  /** Channel name, e.g. Google, Instagram, Y2KASE. */
  source: string;
  /** Path, search, page, or campaign. Null when the source name is enough. */
  detail: string | null;
  /** Raw referrer and landing query, for the hover tooltip. */
  title: string;
};

const LANDING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "ttclid",
  "msclkid",
  "srsltid",
  "igshid",
  "ref",
] as const;

const CLICK_KEYS = new Set<string>([
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "ttclid",
  "msclkid",
  "srsltid",
  "igshid",
]);

type LandingRead = {
  source: string | null;
  /** Ad, search-result, or in-app click — more specific than a bare origin. */
  mechanism: string | null;
  notes: string[];
};

/**
 * Keep utm fields and click-id presence from a landing URL search string.
 * Click ids are stored as `1` so the visit log can name the channel without
 * keeping the token.
 */
export function sanitizeLandingQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.startsWith("?") ? value.slice(1) : value;
  if (!raw || raw.length > 512 || /[\u0000-\u001f\u007f]/.test(raw)) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }

  const kept = new URLSearchParams();
  for (const key of LANDING_KEYS) {
    const item = params.get(key);
    if (!item) continue;
    const clean = item.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!clean) continue;
    kept.set(key, CLICK_KEYS.has(key) ? "1" : clean);
  }
  const out = kept.toString();
  return out || null;
}

export function describeVisitSource(
  referrer: string | null,
  landingQuery: string | null = null,
): VisitSource {
  const referred = describeReferrerUrl(referrer);
  const landing = describeLandingQuery(landingQuery);

  let source = referred.source;
  if (source === "Direct" && landing.source) source = landing.source;

  const detailParts: string[] = [];
  if (referred.detail && referred.detail !== "Search") {
    detailParts.push(referred.detail);
  }
  if (landing.mechanism) {
    if (referred.detail === "Search") detailParts.length = 0;
    if (!detailParts.includes(landing.mechanism)) {
      detailParts.push(landing.mechanism);
    }
  } else if (referred.detail === "Search") {
    detailParts.push("Search");
  }
  for (const note of landing.notes) {
    if (!detailParts.some((part) => part.includes(note))) detailParts.push(note);
  }

  const title = [referrer, landingQuery ? `?${landingQuery}` : null]
    .filter(Boolean)
    .join(" · ");

  return {
    source,
    detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
    title: title || "Direct",
  };
}

function describeReferrerUrl(referrer: string | null): {
  source: string;
  detail: string | null;
} {
  if (!referrer) return { source: "Direct", detail: null };

  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return { source: referrer, detail: null };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (isOwnHost(host)) return ownSite(url);

  const named = namedChannel(host, url);
  if (named) return named;

  const path = displayPath(url);
  return { source: host, detail: path === "/" ? null : path };
}

function describeLandingQuery(query: string | null): LandingRead {
  if (!query) return { source: null, mechanism: null, notes: [] };
  const params = new URLSearchParams(query);
  const notes: string[] = [];
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  const content = params.get("utm_content");
  const term = params.get("utm_term");
  if (medium) notes.push(medium);
  if (campaign) notes.push(`campaign ${campaign}`);
  if (content) notes.push(content);
  if (term) notes.push(`term ${term}`);
  const ref = params.get("ref");
  if (ref && ref !== "1") notes.push(`ref ${ref}`);

  const utmSource = params.get("utm_source");
  let source = utmSource ? labelUtmSource(utmSource) : null;
  let mechanism: string | null = null;

  if (params.get("gclid") || params.get("gbraid") || params.get("wbraid")) {
    source = source ?? "Google";
    mechanism = "Ad";
  } else if (params.get("srsltid")) {
    source = source ?? "Google";
    mechanism = "Search result";
  }
  if (params.get("msclkid")) {
    source = source ?? "Bing";
    mechanism = mechanism ?? "Ad";
  }
  if (params.get("fbclid")) {
    source = source ?? "Facebook";
    mechanism = mechanism ?? "Click";
  }
  if (params.get("igshid")) {
    source = source ?? "Instagram";
    mechanism = mechanism ?? "Share";
  }
  if (params.get("ttclid")) {
    source = source ?? "TikTok";
    mechanism = mechanism ?? "Ad";
  }

  return { source, mechanism, notes };
}

function ownSite(url: URL): { source: string; detail: string } {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const pathLabel = path === "/" ? "Homepage" : path;
  const params = url.searchParams;
  const notes: string[] = [];
  const q = params.get("q")?.trim();
  if (q) notes.push(`search "${q}"`);
  const page = params.get("page");
  if (page && page !== "1") notes.push(`page ${page}`);
  const brand = params.get("brand")?.trim();
  if (brand) notes.push(brand);
  if (params.get("magsafe") === "true") notes.push("MagSafe");
  const medium = params.get("utm_medium");
  if (medium) notes.push(medium);
  const campaign = params.get("utm_campaign");
  if (campaign) notes.push(`campaign ${campaign}`);
  const content = params.get("utm_content");
  if (content) notes.push(content);
  const term = params.get("utm_term");
  if (term) notes.push(`term ${term}`);
  const consumed = new Set([
    "q",
    "page",
    "brand",
    "magsafe",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]);
  for (const [key, value] of params) {
    if (consumed.has(key) || !value.trim()) continue;
    notes.push(`${key}=${value.trim()}`);
  }

  const utm = params.get("utm_source");
  return {
    source: utm ? labelUtmSource(utm) : "Y2KASE",
    detail: notes.length > 0 ? `${pathLabel} · ${notes.join(" · ")}` : pathLabel,
  };
}

function namedChannel(
  host: string,
  url: URL,
): { source: string; detail: string | null } | null {
  if (host === "accounts.google.com") return { source: "Google", detail: "Sign-in" };
  if (host === "mail.google.com") return { source: "Gmail", detail: null };
  if (host === "docs.google.com") return { source: "Google Docs", detail: null };
  if (host === "maps.google.com") return { source: "Google Maps", detail: null };
  if (host === "checkout.stripe.com" || host === "stripe.com") {
    return { source: "Stripe", detail: "Checkout" };
  }
  if (host === "l.instagram.com") return { source: "Instagram", detail: "Tapped a link" };
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return { source: "Instagram", detail: null };
  }
  if (host === "l.facebook.com") return { source: "Facebook", detail: "Tapped a link" };
  if (host === "m.facebook.com") return { source: "Facebook", detail: "Mobile site" };
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com") {
    return { source: "Facebook", detail: null };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return { source: "TikTok", detail: null };
  }
  if (
    host === "pinterest.com" ||
    host.endsWith(".pinterest.com") ||
    host === "pin.it"
  ) {
    return { source: "Pinterest", detail: null };
  }
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) {
    return { source: "ChatGPT", detail: null };
  }
  if (host === "perplexity.ai" || host.endsWith(".perplexity.ai")) {
    return { source: "Perplexity", detail: null };
  }
  if (host === "alohafind.com") return { source: "AlohaFind", detail: null };

  const search = searchEngine(host, url);
  if (search) return search;
  return null;
}

function searchEngine(
  host: string,
  url: URL,
): { source: string; detail: string | null } | null {
  const query = url.searchParams.get("q")?.trim();
  const path = displayPath(url);
  const detail = query
    ? `Search "${query}"`
    : path !== "/"
      ? path
      : "Search";

  if (isGoogleSearchHost(host)) return { source: "Google", detail };
  if (host === "bing.com" || host.endsWith(".bing.com")) return { source: "Bing", detail };
  if (host === "search.brave.com" || host === "brave.com") {
    return { source: "Brave", detail };
  }
  if (host === "duckduckgo.com") return { source: "DuckDuckGo", detail };
  if (host === "search.yahoo.com" || host === "yahoo.com") {
    return { source: "Yahoo", detail };
  }
  if (host === "ecosia.org" || host.endsWith(".ecosia.org")) {
    return { source: "Ecosia", detail };
  }
  return null;
}

function isGoogleSearchHost(host: string): boolean {
  if (
    host.startsWith("accounts.") ||
    host.startsWith("mail.") ||
    host.startsWith("docs.") ||
    host.startsWith("maps.")
  ) {
    return false;
  }
  return (
    host === "google.com" ||
    host.endsWith(".google.com") ||
    /^google\.[a-z.]+$/.test(host)
  );
}

function isOwnHost(host: string): boolean {
  return host === "y2kase.com" || host.endsWith(".y2kase.com");
}

function displayPath(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return path === "/" ? "/" : `${path}${url.search}`;
}

function labelUtmSource(raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes("chatgpt")) return "ChatGPT";
  if (value.includes("instagram") || value === "ig") return "Instagram";
  if (value.includes("facebook") || value === "fb" || value === "meta") {
    return "Facebook";
  }
  if (value.includes("pinterest") || value === "pin") return "Pinterest";
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("google")) return "Google";
  if (value.includes("bing")) return "Bing";
  if (value === "email" || value === "newsletter" || value.includes("klaviyo")) {
    return "Email";
  }
  return raw;
}
