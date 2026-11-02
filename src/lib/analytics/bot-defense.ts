import { isbot } from "isbot";
import {
  ANALYTICS_MARKER_HEADER,
  ANALYTICS_MARKER_VALUE,
  MAX_ANALYTICS_REQUEST_BYTES,
} from "@/lib/analytics/protocol";

/**
 * Search and social crawlers whose JavaScript renderers can present a normal
 * Chrome User-Agent. These are intentionally excluded from shopper analytics.
 * The same CIDRs are applied at capture time and in reporting queries.
 */
const VERIFIED_CRAWLER_IPV4_CIDRS = [
  // Google (Googlebot, Ads, APIs and JavaScript Rendering Service)
  "66.249.0.0/16",
  "64.233.0.0/16",
  "66.102.0.0/16",
  "72.14.0.0/16",
  "74.125.0.0/16",
  "209.85.0.0/16",
  "216.58.0.0/16",
  "216.239.0.0/16",
  "35.191.0.0/16",
  "130.211.0.0/16",
  // Bing / Microsoft
  "40.77.0.0/16",
  "157.55.0.0/16",
  "207.46.0.0/16",
  "65.52.0.0/16",
  "199.30.0.0/16",
  // Meta
  "66.220.0.0/16",
  "69.63.0.0/16",
  "69.171.0.0/16",
  "173.252.0.0/16",
  // Applebot
  "17.0.0.0/16",
  "17.172.0.0/16",
  "17.253.0.0/16",
] as const;

/**
 * Hosting ranges confirmed against raw visitor rows and registry data.
 * These are denied at the Vercel Firewall. The application check is defense
 * in depth for preview domains, configuration drift and local replays.
 *
 * Do not widen a provider to its whole ASN. AS132203 also announces Tencent
 * ranges outside Singapore, and AS45102 is broader than the four Alibaba /24s
 * from the first incident. Consumer ISPs in Singapore (StarHub AS4657 and
 * AS55430, Singtel AS3758 and AS45143, M1 AS4773, Simba AS4817) had real
 * browsing sessions and are intentionally absent.
 */
export const ABUSIVE_ANALYTICS_IPV4_CIDRS = [
  // 2026-09-03 rotating-proxy incident. Alibaba Cloud Singapore (AS45102).
  "43.119.100.0/24",
  "43.119.104.0/24",
  "47.82.201.0/24",
  "47.82.202.0/24",
  // 2026-10-31 one-page proxy farm. Tencent Cloud Singapore, Aceville PTE LTD
  // (AS132203). Regional allocations only, not AS45090 (Tencent China).
  "43.128.0.0/13",
  "43.152.0.0/13",
  "43.160.0.0/12",
  "101.32.0.0/16",
  "129.226.0.0/16",
  "150.109.0.0/19",
  // Same farm on Huawei Cloud Singapore (AS136907).
  "49.0.200.0/21",
  "101.44.160.0/20",
  "111.119.192.0/18",
  "119.8.160.0/19",
  "119.13.96.0/20",
  "124.243.128.0/20",
  "124.243.160.0/19",
  "159.138.120.0/22",
  "188.239.0.0/20",
  "188.239.32.0/20",
] as const;

export const ANALYTICS_EXCLUDED_IPV4_CIDRS: readonly string[] = [
  ...VERIFIED_CRAWLER_IPV4_CIDRS,
  ...ABUSIVE_ANALYTICS_IPV4_CIDRS,
];

type Ipv4Cidr = { network: number; mask: number };

function ipv4ToInt(octets: readonly [number, number, number, number]): number {
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

/** Rejects host bits so a typo like 43.128.1.0/13 cannot silently over-match. */
function parseIpv4Cidr(cidr: string): Ipv4Cidr {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(
    cidr,
  );
  if (!match) throw new Error(`Analytics CIDR must be IPv4: ${cidr}`);
  const bits = Number(match[5]);
  if (!Number.isInteger(bits) || bits < 1 || bits > 32) {
    throw new Error(`Analytics CIDR prefix length is out of range: ${cidr}`);
  }
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    throw new Error(`Analytics CIDR has an invalid octet: ${cidr}`);
  }
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  const network = ipv4ToInt(octets as [number, number, number, number]);
  if (((network & mask) >>> 0) !== network) {
    throw new Error(`Analytics CIDR is not network-aligned: ${cidr}`);
  }
  return { network, mask };
}

const EXCLUDED_IPV4_CIDRS = ANALYTICS_EXCLUDED_IPV4_CIDRS.map(parseIpv4Cidr);

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const VISITOR_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normalize the forms proxies commonly use for IPv4 client addresses. */
export function normalizeClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  let value = ip.trim().toLowerCase();
  if (!value) return null;

  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) value = bracketed[1]!;
  if (value.startsWith("::ffff:")) value = value.slice(7);
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }

  const ipv4 = parseIpv4(value);
  if (ipv4) return ipv4.join(".");

  // Strip an IPv6 zone identifier. It is meaningful only on the source host.
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  return expandIpv6(value) ? value : null;
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const match = IPV4_RE.exec(value);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;
  return octets as [number, number, number, number];
}

function expandIpv6(value: string): string[] | null {
  if (!value.includes(":")) return null;
  const halves = value.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return null;
  }

  if (halves.length === 1) {
    return left.length === 8 ? left.map((part) => part.padStart(4, "0")) : null;
  }

  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((part) => part.padStart(4, "0"));
}

/** True for crawler infrastructure and the confirmed abusive proxy ranges. */
export function isExcludedAnalyticsIp(ip: string | null | undefined): boolean {
  const normalized = normalizeClientIp(ip);
  const octets = normalized ? parseIpv4(normalized) : null;
  if (!octets) return false;
  const value = ipv4ToInt(octets);
  return EXCLUDED_IPV4_CIDRS.some(
    (cidr) => ((value & cidr.mask) >>> 0) === cidr.network,
  );
}

/**
 * Coarse network identity for burst limiting. Per-IP limits alone are useless
 * against a proxy pool; grouping IPv4 by /24 and IPv6 by /64 closes that gap
 * without treating a whole country or cloud provider as hostile.
 */
export function analyticsNetworkKey(
  ip: string | null | undefined,
): string | null {
  const normalized = normalizeClientIp(ip);
  if (!normalized) return null;

  const ipv4 = parseIpv4(normalized);
  if (ipv4) return `v4:${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.0/24`;

  const ipv6 = expandIpv6(normalized);
  if (!ipv6) return null;
  return `v6:${ipv6.slice(0, 4).join(":")}/64`;
}

/**
 * `isbot` carries the maintained crawler corpus. The extra patterns cover
 * automation frameworks and HTTP clients that intentionally avoid a "bot"
 * token but should never appear as a storefront browser.
 */
const AUTOMATION_UA_RE =
  /headless|phantomjs|selenium|webdriver|playwright|puppeteer|chromedriver|chrome-lighthouse|cypress|postmanruntime|insomnia|httpie/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const value = ua?.trim();
  return !value || isbot(value) || AUTOMATION_UA_RE.test(value);
}

export type HeaderReader = {
  get(name: string): string | null;
};

export type AnalyticsRequestRejection =
  | "missing_marker"
  | "invalid_content_type"
  | "invalid_content_length"
  | "missing_browser_context"
  | "cross_site"
  | "invalid_fetch_mode"
  | "invalid_fetch_destination"
  | "origin_mismatch";

/**
 * Validate that a beacon has the shape of the same-origin `fetch` emitted by
 * VisitorTracker. Fetch metadata is not an authentication mechanism—headers
 * can be forged by a custom client—but it cheaply rejects cross-site requests,
 * stale clients and unsophisticated direct endpoint floods.
 */
export function analyticsRequestRejection(
  headers: HeaderReader,
): AnalyticsRequestRejection | null {
  if (headers.get(ANALYTICS_MARKER_HEADER) !== ANALYTICS_MARKER_VALUE) {
    return "missing_marker";
  }

  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return "invalid_content_type";
  }

  const rawLength = headers.get("content-length");
  if (rawLength) {
    if (!/^\d+$/.test(rawLength)) return "invalid_content_length";
    const length = Number(rawLength);
    if (!Number.isSafeInteger(length) || length > MAX_ANALYTICS_REQUEST_BYTES) {
      return "invalid_content_length";
    }
  }

  const fetchSite = headers.get("sec-fetch-site")?.toLowerCase() ?? null;
  const origin = headers.get("origin");
  if (!fetchSite && !origin) return "missing_browser_context";
  if (fetchSite && fetchSite !== "same-origin") return "cross_site";

  const fetchMode = headers.get("sec-fetch-mode")?.toLowerCase();
  if (fetchMode && fetchMode !== "cors" && fetchMode !== "same-origin") {
    return "invalid_fetch_mode";
  }

  const fetchDestination = headers.get("sec-fetch-dest")?.toLowerCase();
  if (fetchDestination && fetchDestination !== "empty") {
    return "invalid_fetch_destination";
  }

  if (origin) {
    const requestHost = (
      headers.get("x-forwarded-host") ??
      headers.get("host") ??
      ""
    )
      .split(",")[0]!
      .trim()
      .toLowerCase();
    try {
      const parsedOrigin = new URL(origin);
      if (
        !requestHost ||
        !["http:", "https:"].includes(parsedOrigin.protocol) ||
        parsedOrigin.host.toLowerCase() !== requestHost
      ) {
        return "origin_mismatch";
      }
    } catch {
      return "origin_mismatch";
    }
  }

  return null;
}

type BrowserPlatform =
  | "android"
  | "chromeos"
  | "ios"
  | "linux"
  | "macos"
  | "windows";

function browserPlatform(value: string | null | undefined): BrowserPlatform | null {
  const normalized = value?.replaceAll('"', "").trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (/iphone|ipad|ipod|\bios\b/.test(normalized)) return "ios";
  if (/android/.test(normalized)) return "android";
  if (/cros|chrome\s?os/.test(normalized)) return "chromeos";
  if (/mac|darwin/.test(normalized)) return "macos";
  if (/win/.test(normalized)) return "windows";
  if (/linux/.test(normalized)) return "linux";
  return null;
}

function platformIsCompatible(
  expected: BrowserPlatform,
  reported: BrowserPlatform,
): boolean {
  if (expected === reported) return true;
  // Older Android exposes navigator.platform as Linux; desktop-mode iPad can
  // expose MacIntel. Neither discrepancy is evidence of automation.
  return (
    (expected === "android" && reported === "linux") ||
    (expected === "ios" && reported === "macos")
  );
}

export type AutomationRejection =
  | "webdriver"
  | "client_hint_platform_mismatch"
  | "runtime_platform_mismatch"
  | "mobile_hint_mismatch";

/**
 * Positive automation signals only. Missing Client Hints are accepted because
 * Safari and privacy-focused browsers omit them; contradictory signals are not.
 */
export function automationRejection(input: {
  headers: HeaderReader;
  userAgent: string;
  webdriver: boolean;
  runtimePlatform: string | null;
}): AutomationRejection | null {
  if (input.webdriver) return "webdriver";

  const expected = browserPlatform(input.userAgent);
  const hinted = browserPlatform(input.headers.get("sec-ch-ua-platform"));
  const runtime = browserPlatform(input.runtimePlatform);
  if (expected && hinted && !platformIsCompatible(expected, hinted)) {
    return "client_hint_platform_mismatch";
  }
  if (expected && runtime && !platformIsCompatible(expected, runtime)) {
    return "runtime_platform_mismatch";
  }

  const mobileHint = input.headers.get("sec-ch-ua-mobile");
  if (mobileHint === "?0" || mobileHint === "?1") {
    const uaIsTablet =
      /ipad|tablet|(android(?!.*mobile))/i.test(input.userAgent);
    if (!uaIsTablet) {
      const uaIsMobile =
        /mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(
          input.userAgent,
        );
      if ((mobileHint === "?1") !== uaIsMobile) {
        return "mobile_hint_mismatch";
      }
    }
  }

  return null;
}

/** Only IDs minted by `crypto.randomUUID()` are accepted as visitor cookies. */
export function isValidVisitorId(value: string | null | undefined): boolean {
  return Boolean(value && VISITOR_ID_RE.test(value));
}

/**
 * Compact, non-cryptographic key for an in-process anomaly bucket. It is never
 * persisted or exposed and is not used to identify a person.
 */
export function analyticsFingerprintKey(parts: readonly (string | null)[]): string {
  const value = parts.map((part) => part ?? "").join("\u001f");
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
