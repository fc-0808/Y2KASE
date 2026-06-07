"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Inbox,
  RefreshCw,
  Trash2,
  MailOpen,
  Mail,
  AlertTriangle,
  Shield,
  Clock,
  User,
  ChevronLeft,
  Reply,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailHeader {
  uid: number;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  isRead: boolean;
  isSpam: boolean;
  preview: string;
}

interface EmailDetail extends EmailHeader {
  html: string | null;
  text: string;
  toEmail: string;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Hong_Kong",
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return dateFmt.format(d).split(",")[1]?.trim() ?? "";
  return dateFmt.format(d);
}

function EmailRow({
  email,
  selected,
  onClick,
}: {
  email: EmailHeader;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer rounded-xl px-4 py-3 text-left transition-all",
        selected
          ? "bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
          : "hover:bg-[var(--muted)]",
        !email.isRead && !selected && "border-l-2 border-[var(--primary)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {email.isSpam && (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                spam?
              </span>
            )}
            <span
              className={cn(
                "truncate text-sm",
                email.isRead
                  ? "text-[var(--foreground)]/60"
                  : "font-bold text-[var(--foreground)]",
              )}
            >
              {email.from || email.fromEmail}
            </span>
          </div>
          <p
            className={cn(
              "mt-0.5 truncate text-sm",
              email.isRead
                ? "text-[var(--foreground)]/50"
                : "font-semibold text-[var(--foreground)]",
            )}
          >
            {email.subject}
          </p>
          {email.preview && (
            <p className="mt-0.5 truncate text-xs text-[var(--foreground)]/40">
              {email.preview}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--foreground)]/40">
          {formatDate(email.date)}
        </span>
      </div>
    </button>
  );
}

function EmailPane({
  email,
  onDelete,
  onMarkUnread,
  onClose,
}: {
  email: EmailDetail;
  onDelete: () => void;
  onMarkUnread: () => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [quoteOriginal, setQuoteOriginal] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "ok" | "error">("idle");

  // Reset composer when a different email is opened.
  useEffect(() => {
    setShowReply(false);
    setReplyBody("");
    setSendStatus("idle");
  }, [email.uid]);

  // Auto-resize iframe to content height.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !email.html) return;
    const handler = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height =
          iframe.contentDocument.body.scrollHeight + 32 + "px";
      }
    };
    iframe.addEventListener("load", handler);
    return () => iframe.removeEventListener("load", handler);
  }, [email.html]);

  async function handleSend() {
    if (!replyBody.trim()) return;
    setSending(true);
    setSendStatus("idle");
    try {
      const res = await fetch("/api/admin/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.fromEmail,
          subject: email.subject,
          body: replyBody.trim(),
          quotedText: quoteOriginal ? (email.text || undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSendStatus("ok");
      setReplyBody("");
      setTimeout(() => setShowReply(false), 2000);
    } catch (err) {
      console.error(err);
      setSendStatus("error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5">
        <div className="min-w-0 flex-1">
          <button
            onClick={onClose}
            className="mb-2 flex items-center gap-1 text-xs text-[var(--foreground)]/50 hover:text-[var(--foreground)] sm:hidden"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h2 className="text-base font-bold leading-snug text-[var(--foreground)]">
            {email.subject}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--foreground)]/55">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <strong>{email.from}</strong>
              {email.fromEmail !== email.from && (
                <span className="opacity-60">&lt;{email.fromEmail}&gt;</span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {dateFmt.format(new Date(email.date))}
            </span>
          </div>
          {email.isSpam && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Possible spam / solicitation detected
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowReply((v) => !v)}
            title="Reply"
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              showReply
                ? "bg-[var(--primary)] text-white"
                : "border border-[var(--border)] text-[var(--foreground)]/60 hover:border-[var(--primary)] hover:text-[var(--primary)]",
            )}
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </button>
          <button
            onClick={onMarkUnread}
            title="Mark as unread"
            className="rounded-full p-2 text-[var(--foreground)]/50 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <Mail className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="rounded-full p-2 text-[var(--foreground)]/50 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {email.html ? (
          <iframe
            ref={iframeRef}
            sandbox="allow-same-origin"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;word-break:break-word;}</style></head><body>${email.html}</body></html>`}
            className="w-full rounded-lg border border-[var(--border)] bg-white"
            style={{ minHeight: 200 }}
            title="Email content"
          />
        ) : (
          <pre className="whitespace-pre-wrap rounded-xl bg-[var(--muted)] p-4 font-sans text-sm leading-relaxed text-[var(--foreground)]">
            {email.text || "(empty)"}
          </pre>
        )}
      </div>

      {/* Reply composer */}
      {showReply && (
        <div className="border-t border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--foreground)]/60">
              Replying to <span className="text-[var(--foreground)]">{email.fromEmail}</span>
            </p>
            <button
              onClick={() => setShowReply(false)}
              className="rounded-full p-1 text-[var(--foreground)]/40 hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Type your reply…"
            rows={5}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--foreground)]/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/30"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--foreground)]/50">
              <input
                type="checkbox"
                checked={quoteOriginal}
                onChange={(e) => setQuoteOriginal(e.target.checked)}
                className="rounded"
              />
              Quote original message
            </label>

            <div className="flex items-center gap-2">
              {sendStatus === "ok" && (
                <span className="text-xs font-semibold text-emerald-500">✓ Sent!</span>
              )}
              {sendStatus === "error" && (
                <span className="text-xs font-semibold text-red-500">Failed — try again</span>
              )}
              <button
                onClick={handleSend}
                disabled={sending || !replyBody.trim()}
                className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function InboxClient() {
  const [emails, setEmails] = useState<EmailHeader[]>([]);
  const [selected, setSelected] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideSpam, setHideSpam] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inbox");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: EmailHeader[] = await res.json();
      setEmails(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
    // Auto-refresh every 60 seconds.
    const id = setInterval(loadEmails, 60_000);
    return () => clearInterval(id);
  }, [loadEmails]);

  async function openEmail(uid: number) {
    setDetailLoading(true);
    setShowDetail(true);
    try {
      const res = await fetch(`/api/admin/inbox?uid=${uid}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail: EmailDetail = await res.json();
      setSelected(detail);
      // Mark as read in local state.
      setEmails((prev) =>
        prev.map((e) => (e.uid === uid ? { ...e, isRead: true } : e)),
      );
    } catch {
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDelete(uid: number) {
    await fetch(`/api/admin/inbox?uid=${uid}`, { method: "DELETE" });
    setEmails((prev) => prev.filter((e) => e.uid !== uid));
    setSelected(null);
    setShowDetail(false);
  }

  async function handleMarkUnread(uid: number) {
    await fetch(`/api/admin/inbox?uid=${uid}&read=false`, { method: "PATCH" });
    setEmails((prev) =>
      prev.map((e) => (e.uid === uid ? { ...e, isRead: false } : e)),
    );
    setSelected(null);
    setShowDetail(false);
  }

  const displayed = hideSpam ? emails.filter((e) => !e.isSpam) : emails;
  const spamCount = emails.filter((e) => e.isSpam).length;
  const unreadCount = emails.filter((e) => !e.isRead && !e.isSpam).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Page header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)]/10">
            <Inbox className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-black leading-none">Inbox</h1>
            <p className="text-xs text-[var(--foreground)]/50">
              hello@y2kase.com
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs font-bold text-white">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {spamCount > 0 && (
            <button
              onClick={() => setHideSpam((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                hideSpam
                  ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--foreground)]/60 hover:border-[var(--primary)] hover:text-[var(--primary)]",
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              {hideSpam ? "Showing clean" : `Hide ${spamCount} spam`}
            </button>
          )}
          <button
            onClick={loadEmails}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]/60 transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Main layout: list + detail pane */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex h-[calc(100dvh-220px)] min-h-[500px]">
          {/* Email list */}
          <div
            className={cn(
              "flex h-full w-full flex-col overflow-y-auto border-r border-[var(--border)] sm:w-[340px] sm:shrink-0",
              showDetail && "hidden sm:flex",
            )}
          >
            {loading && emails.length === 0 ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--foreground)]/40">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--foreground)]/40">
                <MailOpen className="h-8 w-8" />
                <p className="text-sm font-semibold">All clear!</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {displayed.map((email) => (
                  <li key={email.uid}>
                    <EmailRow
                      email={email}
                      selected={selected?.uid === email.uid}
                      onClick={() => openEmail(email.uid)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detail pane */}
          <div
            className={cn(
              "hidden h-full flex-1 overflow-hidden sm:block",
              showDetail && "block",
            )}
          >
            {detailLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--foreground)]/40">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading email…
              </div>
            ) : selected ? (
              <EmailPane
                email={selected}
                onDelete={() => handleDelete(selected.uid)}
                onMarkUnread={() => handleMarkUnread(selected.uid)}
                onClose={() => setShowDetail(false)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--foreground)]/30">
                <MailOpen className="h-10 w-10" />
                <p className="text-sm font-semibold">Select an email to read</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
