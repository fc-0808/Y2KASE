/**
 * UTM parameter capture and attribution.
 *
 * Captures UTM params from the landing URL and persists them in sessionStorage
 * (cleared per tab) plus a 30-day cookie (survives browser restarts). During
 * checkout we attach the attribution data to the Stripe session metadata so
 * every order carries its acquisition source — essential for channel-level
 * ROAS analysis.
 *
 * Param set: utm_source, utm_medium, utm_campaign, utm_content, utm_term
 * Extended:  fbclid (Facebook), ttclid (TikTok), gclid (Google), ref (Pinterest)
 */

export const UTM_COOKIE = "y2k_utm";
export const UTM_SESSION_KEY = "y2k_utm_session";
const UTM_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export type UtmParams = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  // Platform click IDs for enhanced matching
  fbclid?: string;
  ttclid?: string;
  gclid?: string;
  // Pinterest
  ref?: string;
  // Captured URL for reference
  landingUrl?: string;
  // ISO timestamp of first capture
  capturedAt?: string;
};

/** Normalize untrusted URL/client attribution before storage or Stripe metadata. */
export function sanitizeUtmParams(value: unknown): UtmParams | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const text = (key: keyof UtmParams, max: number): string | undefined => {
    const raw = input[key];
    if (typeof raw !== "string") return undefined;
    const normalized = raw.replace(/\s+/g, " ").trim().slice(0, max);
    return normalized || undefined;
  };
  const safe: UtmParams = {
    source: text("source", 100),
    medium: text("medium", 100),
    campaign: text("campaign", 200),
    content: text("content", 200),
    term: text("term", 200),
    fbclid: text("fbclid", 255),
    ttclid: text("ttclid", 255),
    gclid: text("gclid", 255),
    ref: text("ref", 255),
    landingUrl: text("landingUrl", 500),
    capturedAt: text("capturedAt", 64),
  };
  for (const key of Object.keys(safe) as (keyof UtmParams)[]) {
    if (!safe[key]) delete safe[key];
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

/** Extract UTM + click-ID params from a URL search string. */
export function extractUtmParams(search: string): UtmParams | null {
  const p = new URLSearchParams(search);
  const utm: UtmParams = {};
  const source = p.get("utm_source");
  const medium = p.get("utm_medium");
  const campaign = p.get("utm_campaign");
  const content = p.get("utm_content");
  const term = p.get("utm_term");
  const fbclid = p.get("fbclid");
  const ttclid = p.get("ttclid");
  const gclid = p.get("gclid");
  const ref = p.get("ref");

  if (source) utm.source = source;
  if (medium) utm.medium = medium;
  if (campaign) utm.campaign = campaign;
  if (content) utm.content = content;
  if (term) utm.term = term;
  if (fbclid) utm.fbclid = fbclid;
  if (ttclid) utm.ttclid = ttclid;
  if (gclid) utm.gclid = gclid;
  if (ref) utm.ref = ref;

  // Also derive medium from click IDs when utm_medium is missing
  if (!utm.medium) {
    if (fbclid) utm.medium = "paid_social";
    else if (ttclid) utm.medium = "paid_social";
    else if (gclid) utm.medium = "cpc";
  }

  if (!utm.source) {
    if (fbclid) utm.source = "facebook";
    else if (ttclid) utm.source = "tiktok";
    else if (gclid) utm.source = "google";
  }

  // Return null if no recognisable attribution params found
  const hasData = Object.keys(utm).length > 0;
  return hasData ? sanitizeUtmParams(utm) : null;
}

/** Save UTM params to both sessionStorage and a 30-day cookie. */
export function saveUtmParams(params: UtmParams): void {
  if (typeof window === "undefined") return;
  const enriched = sanitizeUtmParams({
    ...params,
    landingUrl: window.location.href,
    capturedAt: new Date().toISOString(),
  });
  if (!enriched) return;
  const json = JSON.stringify(enriched);
  try {
    sessionStorage.setItem(UTM_SESSION_KEY, json);
  } catch {
    // SessionStorage unavailable (private mode, full storage)
  }
  try {
    const encoded = encodeURIComponent(json);
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${UTM_COOKIE}=${encoded}; path=/; max-age=${UTM_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  } catch {
    // Cookie write failed — not critical
  }
}

/** Read the stored UTM params (client-side only). Prefers sessionStorage. */
export function readUtmParams(): UtmParams | null {
  if (typeof window === "undefined") return null;
  try {
    const session = sessionStorage.getItem(UTM_SESSION_KEY);
    if (session) return JSON.parse(session) as UtmParams;
  } catch {
    // ignore
  }
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${UTM_COOKIE}=([^;]*)`),
    );
    if (match) return JSON.parse(decodeURIComponent(match[1])) as UtmParams;
  } catch {
    // ignore
  }
  return null;
}

/** Convert stored UTM params to Stripe metadata key-value pairs. */
export function utmToMetadata(
  params: UtmParams | null,
): Record<string, string> {
  const safe = sanitizeUtmParams(params);
  if (!safe) return {};
  const meta: Record<string, string> = {};
  if (safe.source) meta.utm_source = safe.source;
  if (safe.medium) meta.utm_medium = safe.medium;
  if (safe.campaign) meta.utm_campaign = safe.campaign;
  if (safe.content) meta.utm_content = safe.content;
  if (safe.term) meta.utm_term = safe.term;
  if (safe.fbclid) meta.fbclid = safe.fbclid;
  if (safe.ttclid) meta.ttclid = safe.ttclid;
  if (safe.gclid) meta.gclid = safe.gclid;
  if (safe.ref) meta.pinterest_ref = safe.ref;
  if (safe.landingUrl) meta.landing_url = safe.landingUrl;
  if (safe.capturedAt) meta.utm_captured_at = safe.capturedAt;
  return meta;
}
