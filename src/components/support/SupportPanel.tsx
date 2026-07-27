"use client";

/**
 * The help panel — what opens when a shopper taps the launcher.
 *
 * Answers first, human second. It paints instantly with zero network calls, so
 * the five questions that generate most of our inbox get resolved in about a
 * second. Reaching a person is always one tap away underneath, but most people
 * never need it — which is the point: an unanswered live chat converts worse
 * than no live chat at all.
 *
 * Non-modal by design (`aria-modal="false"`). The shopper keeps browsing with
 * the panel open, exactly like every messenger widget they've used before, so
 * there's no focus trap and no scroll lock. Escape and outside-click dismissal
 * are owned by `SupportWidget`, which also owns the launcher we return focus to.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Mail,
  MessageCircle,
  X,
} from "lucide-react";
import { trackSupport } from "@/lib/support/analytics";
import {
  SUPPORT_EMAIL,
  SUPPORT_RESPONSE_TIME,
} from "@/lib/support/constants";
import { SUPPORT_TOPICS } from "@/lib/support/topics";
import { cn } from "@/lib/utils";

export type ChatState = "idle" | "connecting" | "error";

type SupportPanelProps = {
  id: string;
  titleId: string;
  liveChatEnabled: boolean;
  chatState: ChatState;
  onStartChat: () => void;
  onClose: () => void;
  /** Fired when the shopper follows a link out of the panel. */
  onNavigate: () => void;
};

export function SupportPanel({
  id,
  titleId,
  liveChatEnabled,
  chatState,
  onStartChat,
  onClose,
  onNavigate,
}: SupportPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Move the reading cursor into the panel so screen-reader and keyboard users
  // land on the dialog title instead of being left behind on the launcher.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // Give support the page the shopper was on — it's the single most useful
  // thing an inbound email can carry, and it costs the sender nothing.
  const mailtoHref = useMemo(() => {
    const page = typeof window === "undefined" ? "" : window.location.href;
    const body = `\n\n---\nSent from: ${page}`;
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "Y2KASE support",
    )}&body=${encodeURIComponent(body)}`;
  }, []);

  function toggleTopic(topicId: string) {
    setExpanded((current) => {
      const next = current === topicId ? null : topicId;
      if (next) trackSupport("support_topic_view", { topic_id: next });
      return next;
    });
  }

  const connecting = chatState === "connecting";

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="card-cute animate-float-up pointer-events-auto w-[min(22rem,calc(100vw-2rem))] overflow-hidden outline-none"
    >
      <div className="h-1.5 w-full bg-holo-vivid" />

      <div className="flex items-start gap-3 px-5 pb-4 pt-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-holo text-[var(--primary)]">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="font-display text-base font-extrabold">
            Need a hand, bestie? 💕
          </p>
          <p className="text-xs font-semibold text-[var(--foreground)]/55">
            {SUPPORT_RESPONSE_TIME}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--foreground)]/50 transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[min(20rem,calc(100dvh-21rem))] overflow-y-auto border-t border-[var(--border)]">
        {SUPPORT_TOPICS.map((topic) => {
          const Icon = topic.icon;
          const isOpen = expanded === topic.id;
          const answerId = `${id}-${topic.id}`;

          return (
            <div
              key={topic.id}
              className="border-b border-[var(--border)] last:border-b-0"
            >
              <button
                type="button"
                onClick={() => toggleTopic(topic.id)}
                aria-expanded={isOpen}
                aria-controls={answerId}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[var(--muted)]/50"
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full transition",
                    isOpen
                      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "bg-[var(--muted)] text-[var(--foreground)]/60",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-bold">
                  {topic.question}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0 text-[var(--foreground)]/40 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <div id={answerId} className="px-5 pb-4 pl-16">
                  <p className="text-sm leading-relaxed text-[var(--foreground)]/70">
                    {topic.answer}
                  </p>
                  {topic.link && (
                    <Link
                      href={topic.link.href}
                      onClick={onNavigate}
                      className="mt-2 inline-block text-sm font-extrabold text-[var(--primary)] hover:underline"
                    >
                      {topic.link.label} →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-[var(--border)] bg-[var(--muted)]/40 px-5 py-4">
        {liveChatEnabled && (
          <button
            type="button"
            onClick={onStartChat}
            disabled={connecting}
            className="btn-candy flex w-full items-center justify-center gap-2 py-3 text-sm disabled:cursor-wait disabled:opacity-70"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <MessageCircle className="h-4 w-4" />
                Chat with us
              </>
            )}
          </button>
        )}

        {chatState === "error" && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-[var(--primary)]"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Chat couldn&apos;t connect — an ad blocker or your network may be
              in the way. Email us and we&apos;ll reply just as fast.
            </span>
          </p>
        )}

        <a
          href={mailtoHref}
          onClick={() => trackSupport("support_email_click")}
          className={cn(
            "flex w-full items-center justify-center gap-2 py-3 text-sm font-extrabold transition",
            liveChatEnabled
              ? "rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/75 hover:border-[var(--primary)] hover:text-[var(--primary)]"
              : "btn-candy",
          )}
        >
          <Mail className="h-4 w-4" />
          Email {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
