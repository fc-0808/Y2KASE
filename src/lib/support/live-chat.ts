/**
 * Live chat — the only module that knows which vendor we use (tawk.to).
 *
 * WHY THIS EXISTS (the load policy)
 * Hosted chat SDKs are among the heaviest third-party scripts on the web:
 * tawk's embed pulls several hundred KB and opens a websocket the moment it
 * boots. Dropping the vendor snippet into the root layout means every shopper
 * pays that cost during page load so the ~1% who want a human can have one —
 * straight off our LCP and INP budget, on the mobile traffic that converts.
 *
 * So we never load it with the page. `SupportWidget` renders a ~3 KB facade,
 * and the SDK is fetched only when a shopper explicitly asks to talk to us
 * ("import on interaction"). `warmUpLiveChat()` opens the TLS connections on
 * hover so the click still feels instant.
 *
 * PRIVACY
 * Because the SDK is fetched only after an explicit request, the cookies it
 * sets are strictly necessary for a service the user asked for — the ePrivacy
 * Art. 5(3) exemption — and no consent gate is required. That argument only
 * holds while the load stays user-initiated, so nothing here may be promoted
 * to page load. `resumeLiveChat()` is the single exception and is reachable
 * only for someone who already started a conversation in this browser.
 *
 * SWAPPING PROVIDERS
 * Everything below the exported API is tawk-specific. Moving to Crisp,
 * Intercom or Gorgias is a rewrite of this file alone; no component changes.
 *
 * tawk JS API reference: https://developer.tawk.to/jsapi/
 */

/** tawk.to → Administration → Chat Widget. Empty string disables live chat. */
const PROPERTY_ID = (process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID ?? "").trim();
/** Widget id from the same screen; tawk names the first one "default". */
const WIDGET_ID =
  (process.env.NEXT_PUBLIC_TAWK_WIDGET_ID ?? "").trim() || "default";

const EMBED_ORIGIN = "https://embed.tawk.to";
/** Origins the SDK reaches for once it boots — worth a preconnect on intent. */
const PRECONNECT_ORIGINS = [EMBED_ORIGIN, "https://va.tawk.to"];
/** Generous enough for a bad 3G connection, short enough to not hang the UI. */
const LOAD_TIMEOUT_MS = 20_000;

/** Remembers that this browser has an open conversation. See `hasRecentChat`. */
const RECENT_CHAT_KEY = "y2k_support_chat_at";
const RECENT_CHAT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Live chat is only offered when a property id is configured at build time. */
export const LIVE_CHAT_ENABLED = PROPERTY_ID.length > 0;

/**
 * Identity handed to the vendor. `hash` is an HMAC of the email signed by
 * /api/support/identity — tawk's "secure mode", which stops a visitor from
 * claiming to be another customer.
 */
export type LiveChatVisitor = {
  name?: string;
  email?: string;
  hash?: string;
};

/**
 * Free-form context shown beside the conversation in the agent dashboard.
 * tawk restricts keys to alphanumerics and dashes, so use `cart-value`, never
 * `cart_value` — a bad key silently drops the whole attribute payload.
 */
export type LiveChatAttributes = Record<string, string>;

export type LiveChatEvent = "opened" | "closed" | "agent-message";

type TawkApi = {
  visitor?: LiveChatVisitor;
  onBeforeLoad?: () => void;
  onLoad?: () => void;
  onChatMaximized?: () => void;
  onChatMinimized?: () => void;
  onChatEnded?: () => void;
  onChatMessageAgent?: (message: unknown) => void;
  maximize?: () => void;
  minimize?: () => void;
  showWidget?: () => void;
  hideWidget?: () => void;
  setAttributes?: (
    attributes: LiveChatAttributes,
    callback?: (error?: unknown) => void,
  ) => void;
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

// ─── Lifecycle events ────────────────────────────────────────────────────────

const listeners = new Set<(event: LiveChatEvent) => void>();

/** Subscribe to chat lifecycle changes. Returns an unsubscribe function. */
export function subscribeToLiveChat(
  listener: (event: LiveChatEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: LiveChatEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A broken subscriber must never take down the vendor callback.
    }
  }
}

// ─── Returning-conversation memory ───────────────────────────────────────────

/**
 * True when this browser started a conversation recently enough that an agent
 * reply is still plausible. Used to decide whether it's worth reconnecting the
 * SDK in the background so replies aren't silently missed — the one real cost
 * of the facade pattern.
 */
export function hasRecentChat(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(RECENT_CHAT_KEY);
    if (!raw) return false;
    const startedAt = Number(raw);
    if (!Number.isFinite(startedAt)) return false;
    if (Date.now() - startedAt > RECENT_CHAT_TTL_MS) {
      window.localStorage.removeItem(RECENT_CHAT_KEY);
      return false;
    }
    return true;
  } catch {
    // Safari private mode and storage-partitioned contexts throw on access.
    return false;
  }
}

function rememberChat(): void {
  try {
    window.localStorage.setItem(RECENT_CHAT_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — degrade to facade-only behaviour */
  }
}

function forgetChat(): void {
  try {
    window.localStorage.removeItem(RECENT_CHAT_KEY);
  } catch {
    /* nothing to clean up */
  }
}

// ─── Loading ─────────────────────────────────────────────────────────────────

let warmed = false;

/**
 * Open the TLS connections to the vendor without downloading anything. Cheap
 * enough to fire on hover/focus of the launcher; removes a full round-trip
 * from the click that follows.
 */
export function warmUpLiveChat(): void {
  if (warmed || !LIVE_CHAT_ENABLED || typeof document === "undefined") return;
  warmed = true;
  for (const origin of PRECONNECT_ORIGINS) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "";
    document.head.appendChild(link);
  }
}

let loadPromise: Promise<TawkApi> | null = null;

/**
 * Inject the vendor SDK exactly once. Resolves when tawk reports it is ready
 * to take API calls; rejects on a blocked/failed script or a boot that stalls.
 */
function loadSdk(visitor: LiveChatVisitor): Promise<TawkApi> {
  if (loadPromise) return loadPromise;

  const pending = new Promise<TawkApi>((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("Live chat is browser-only."));
      return;
    }

    const api: TawkApi = (window.Tawk_API = window.Tawk_API ?? {});

    // tawk reads `visitor` while booting. Assigning it after the script has
    // downloaded is a no-op, so identity has to be in place before injection —
    // this is also what makes secure mode work.
    if (visitor.email) {
      api.visitor = {
        ...(visitor.name ? { name: visitor.name } : {}),
        email: visitor.email,
        ...(visitor.hash ? { hash: visitor.hash } : {}),
      };
    }
    window.Tawk_LoadStart = new Date();

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(new Error("Live chat timed out while connecting.")));
    }, LOAD_TIMEOUT_MS);

    // Fires before the widget paints — the only place we can suppress tawk's
    // own bubble without it flashing on screen next to our launcher.
    api.onBeforeLoad = () => api.hideWidget?.();
    api.onLoad = () => {
      api.hideWidget?.();
      finish(() => resolve(api));
    };

    api.onChatMaximized = () => emit("opened");
    api.onChatMinimized = () => {
      // Collapsing tawk's window would otherwise reveal its default bubble;
      // hide it again and hand control back to our launcher.
      api.hideWidget?.();
      emit("closed");
    };
    api.onChatEnded = () => {
      forgetChat();
      api.hideWidget?.();
      emit("closed");
    };
    api.onChatMessageAgent = () => emit("agent-message");

    const script = document.createElement("script");
    script.async = true;
    script.charset = "UTF-8";
    // Mirrors tawk's official snippet verbatim; their CDN keys off this.
    script.setAttribute("crossorigin", "*");
    script.src = `${EMBED_ORIGIN}/${PROPERTY_ID}/${WIDGET_ID}`;
    script.onerror = () => {
      finish(() =>
        reject(new Error("Live chat could not be reached (blocked or offline).")),
      );
    };
    document.head.appendChild(script);
  });

  loadPromise = pending;
  // A blocked or timed-out load must not poison the module forever — clearing
  // the cached promise lets a later click retry from scratch.
  pending.catch(() => {
    if (loadPromise === pending) loadPromise = null;
  });

  return pending;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load the SDK if needed and bring the conversation to the front.
 *
 * Throws when the SDK can't be reached (ad blocker, offline, vendor outage) so
 * the caller can fall back to email instead of leaving a dead button.
 */
export async function openLiveChat(
  options: {
    visitor?: LiveChatVisitor;
    attributes?: LiveChatAttributes;
  } = {},
): Promise<void> {
  if (!LIVE_CHAT_ENABLED) throw new Error("Live chat is not configured.");

  const visitor = options.visitor ?? {};
  const api = await loadSdk(visitor);

  // Attributes only enrich the agent's view — a rejected payload must never
  // stop a shopper from reaching a human, so this is strictly best-effort.
  try {
    const attributes: LiveChatAttributes = { ...options.attributes };
    // Name/email may only travel through setAttributes under secure mode; sent
    // unsigned, tawk rejects the entire call.
    if (visitor.hash && visitor.email) {
      attributes.hash = visitor.hash;
      attributes.email = visitor.email;
      if (visitor.name) attributes.name = visitor.name;
    }
    if (Object.keys(attributes).length > 0) {
      api.setAttributes?.(attributes, () => {});
    }
  } catch {
    /* non-fatal */
  }

  api.showWidget?.();
  api.maximize?.();
  rememberChat();
  emit("opened");
}

/**
 * Reconnect a conversation this browser already started, without showing
 * anything. Lets agent replies surface as an unread badge on our launcher
 * instead of vanishing because the SDK isn't on the page.
 *
 * Callers must schedule this at idle so it never competes with page load.
 *
 * Deliberately boots without identity: resolving the signed-in shopper would
 * mean a network round-trip during page load, which is what the facade exists
 * to avoid. A later `openLiveChat()` re-attaches identity via `setAttributes`,
 * the path tawk documents for logins that resolve after boot.
 */
export async function resumeLiveChat(): Promise<void> {
  if (!LIVE_CHAT_ENABLED || !hasRecentChat()) return;
  const api = await loadSdk({});
  api.hideWidget?.();
}
