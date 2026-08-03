"use client";

/**
 * SupportWidget — the storefront's help surface.
 *
 * Owns three things the individual pieces can't decide on their own:
 *
 *  1. WHEN TO STAND DOWN. The bottom of the viewport is crowded (cookie
 *     banner, welcome pop-up, cart drawer, and tawk's own window once it
 *     opens). Rather than fight those with z-indexes and offsets — which
 *     breaks the moment any of them changes height — the launcher simply
 *     yields. Nothing floats over the consent choice, and there are never two
 *     chat bubbles on screen at once.
 *
 *  2. IDENTITY, EARLY. Resolving the signed-in shopper takes a round-trip, so
 *     it starts the moment the panel opens rather than when "Chat with us" is
 *     tapped. By the time anyone reads the quick answers and decides they want
 *     a human, the answer is already in hand.
 *
 *  3. NOT LOSING REPLIES. The cost of never shipping the SDK on page load is
 *     that an agent answering ten minutes later has no widget to answer into.
 *     So a browser that started a conversation in the last few days quietly
 *     reconnects at idle, and replies surface as a badge on our own launcher.
 *     Everyone else still pays nothing.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { trackSupport } from "@/lib/support/analytics";
import { cartSubtotal, useCart } from "@/lib/store/cart";
import { useHasBlockingOverlay } from "@/lib/store/overlay";
import {
  SUPPORT_OPEN_EVENT,
  type SupportIdentity,
} from "@/lib/support/constants";
import {
  LIVE_CHAT_ENABLED,
  closeLiveChat,
  getLiveChatState,
  hasRecentChat,
  openLiveChat,
  resumeLiveChat,
  setLiveChatAttributes,
  subscribeToLiveChat,
  warmUpLiveChat,
  type LiveChatAttributes,
} from "@/lib/support/live-chat";
import { formatPrice } from "@/lib/utils";
import { SupportLauncher } from "./SupportLauncher";
import { SupportPanel, type ChatState } from "./SupportPanel";

/** Never rejects — a failed lookup just means an anonymous conversation. */
async function fetchIdentity(): Promise<SupportIdentity> {
  try {
    const res = await fetch("/api/support/identity", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { identified: false };
    return (await res.json()) as SupportIdentity;
  } catch {
    return { identified: false };
  }
}

/**
 * What the shopper is looking at and carrying, shown beside the conversation
 * in the agent dashboard. Read imperatively from the store so the widget never
 * re-renders on cart changes it doesn't display.
 */
function collectContext(): LiveChatAttributes {
  const attributes: LiveChatAttributes = {};

  if (typeof window !== "undefined") {
    attributes["current-page"] = window.location.pathname;
  }

  const { items } = useCart.getState();
  if (items.length > 0) {
    attributes["cart-items"] = String(
      items.reduce((units, item) => units + item.quantity, 0),
    );
    attributes["cart-value"] = formatPrice(
      cartSubtotal(items),
      items[0].currency,
    );
    attributes["cart-contents"] = items
      .map((item) => `${item.quantity}x ${item.title}`)
      .join(", ")
      .slice(0, 250);
  }

  return attributes;
}

/** Run once the browser is genuinely free, never during page load. */
function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 5_000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(run, 2_500);
  return () => window.clearTimeout(timer);
}

export function SupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatState, setChatState] = useState<ChatState>("idle");
  const [unread, setUnread] = useState(0);

  const cartOpen = useCart((state) => state.isOpen);
  const overlayActive = useHasBlockingOverlay();
  const state = getLiveChatState();

  const launcherRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<Promise<SupportIdentity> | null>(null);

  const domId = useId();
  const panelId = `support-panel-${domId}`;
  const titleId = `support-title-${domId}`;

  // Stand down whenever something else owns the bottom of the screen. The open
  // state survives so the panel comes back where the shopper left it.
  const suppressed = overlayActive || cartOpen || chatOpen || !state.enabled;

  const closePanel = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  const openPanel = useCallback((method: string) => {
    setOpen(true);
    warmUpLiveChat();
    // Start resolving who this is now, so "Chat with us" doesn't have to wait
    // on a round-trip that could have happened while they were reading.
    if (LIVE_CHAT_ENABLED && !identityRef.current) {
      identityRef.current = fetchIdentity();
    }
    trackSupport("support_widget_open", {
      method,
      live_chat_enabled: state.enabled ? "true" : "false",
      live_chat_property: state.propertyId ?? "",
      live_chat_widget: state.widgetId ?? "",
    });
  }, [state.enabled, state.propertyId, state.widgetId]);

  // A navigation means the shopper moved on; the panel shouldn't follow them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Let any page raise the panel — see `openSupportPanel()`.
  useEffect(() => {
    const handler = () => openPanel("page_cta");
    window.addEventListener(SUPPORT_OPEN_EVENT, handler);
    return () => window.removeEventListener(SUPPORT_OPEN_EVENT, handler);
  }, [openPanel]);

  useEffect(
    () =>
      subscribeToLiveChat((event) => {
        if (event === "opened") {
          setChatOpen(true);
          setUnread(0);
        } else if (event === "closed") {
          setChatOpen(false);
        } else {
          setUnread((count) => count + 1);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!LIVE_CHAT_ENABLED) return;
    void setLiveChatAttributes({
      "page-path": pathname,
      "page-section": pathname.startsWith("/admin") ? "admin" : "storefront",
      "cart-status": cartOpen ? "open" : "closed",
      "support-surface": suppressed ? "suppressed" : "available",
    }).catch(() => {
      /* best-effort */
    });
  }, [cartOpen, pathname, suppressed]);

  // Reconnect an in-flight conversation so agent replies aren't lost to the
  // facade. Scoped to browsers that already chatted, and deferred to idle.
  useEffect(() => {
    if (!LIVE_CHAT_ENABLED || !hasRecentChat() || suppressed) return;
    return whenIdle(() => {
      void resumeLiveChat().catch(() => {
        // Blocked or offline — the launcher still works, just without a badge.
      });
    });
  }, [suppressed]);

  // Dismissal. Escape returns focus to the launcher (the user is still
  // navigating by keyboard); an outside click does not, because they've
  // already chosen where to go.
  useEffect(() => {
    if (!open || suppressed) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      // An in-page CTA is asking for this panel, not dismissing it — closing
      // here would make it flash shut and reopen on the same tap.
      if (target instanceof Element && target.closest("[data-support-trigger]")) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, suppressed, closePanel]);

  const startChat = useCallback(async () => {
    setChatState("connecting");
    trackSupport("live_chat_start");

    try {
      if (!identityRef.current) identityRef.current = fetchIdentity();
      const identity = await identityRef.current;

      await openLiveChat({
        visitor: identity.identified
          ? {
              name: identity.name,
              email: identity.email,
              hash: identity.hash,
            }
          : undefined,
        attributes: { ...identity.attributes, ...collectContext() },
      });
      setChatState("idle");
      setOpen(false);
    } catch {
      // Ad blockers take out hosted chat widgets routinely. Say so plainly and
      // keep the email path in front of the shopper rather than a dead button.
      setChatState("error");
      closeLiveChat();
      trackSupport("live_chat_error");
    }
  }, []);

  function handleLauncherClick() {
    // An unread reply is the shopper's actual intent — skip the help panel and
    // take them straight back into the conversation.
    if (unread > 0) {
      if (chatState !== "connecting") void startChat();
      return;
    }
    if (open) {
      closePanel();
      return;
    }
    openPanel("launcher");
  }

  if (suppressed) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-0 right-0 z-50 flex flex-col items-end gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <span aria-live="polite" className="sr-only">
        {unread > 0
          ? `${unread} new ${unread === 1 ? "message" : "messages"} from Y2KASE support`
          : ""}
      </span>

      {open && (
        <SupportPanel
          id={panelId}
          titleId={titleId}
          liveChatEnabled={LIVE_CHAT_ENABLED}
          chatState={chatState}
          onStartChat={() => void startChat()}
          onClose={closePanel}
          onNavigate={() => setOpen(false)}
        />
      )}

      <SupportLauncher
        ref={launcherRef}
        open={open}
        unread={unread}
        controls={panelId}
        onClick={handleLauncherClick}
        onWarmUp={warmUpLiveChat}
      />
    </div>
  );
}
