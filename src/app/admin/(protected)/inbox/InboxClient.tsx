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
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InboxAttachment, InboxMailbox } from "@/lib/inbox/attachments";
import { EmailAttachments } from "./EmailAttachments";
import { EmailBody } from "./EmailBody";
import { ReplyComposer } from "./ReplyComposer";

interface EmailHeader {
  uid: number;
  mailbox?: InboxMailbox;
  from: string;
  fromEmail: string;
  to?: string;
  toEmail?: string;
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
  attachments?: InboxAttachment[];
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
  mailbox,
  selected,
  onClick,
}: {
  email: EmailHeader;
  mailbox: InboxMailbox;
  selected: boolean;
  onClick: () => void;
}) {
  const outbound = mailbox === "sent";
  const title = outbound
    ? email.to || email.toEmail || "Unknown"
    : email.from || email.fromEmail;
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
              {outbound ? `To ${title}` : title}
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
  onReplied,
}: {
  email: EmailDetail;
  onDelete: () => void;
  onMarkUnread: () => void;
  onClose: () => void;
  onReplied: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const attachmentCount = email.attachments?.length ?? 0;
  const outbound = email.mailbox === "sent";
  const personName = outbound
    ? email.to || email.toEmail || "Unknown"
    : email.from || email.fromEmail;
  const personEmail = outbound ? email.toEmail || "" : email.fromEmail;
  const canReply = Boolean(personEmail);

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
              {outbound ? "To" : "From"} <strong>{personName}</strong>
              {personEmail && personEmail !== personName && (
                <span className="opacity-60">&lt;{personEmail}&gt;</span>
              )}
            </span>
            {outbound && (
              <span className="flex items-center gap-1">
                From <strong>{email.from || email.fromEmail}</strong>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {dateFmt.format(new Date(email.date))}
            </span>
            {attachmentCount > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {attachmentCount}
              </span>
            )}
          </div>
          {email.isSpam && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Possible spam / solicitation detected
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canReply && (
            <button
              type="button"
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
          )}
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
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <EmailBody uid={email.uid} html={email.html} text={email.text} />
        <EmailAttachments
          uid={email.uid}
          mailbox={email.mailbox === "sent" ? "sent" : "inbox"}
          attachments={email.attachments ?? []}
        />
      </div>

      {showReply && canReply && (
        <ReplyComposer
          recipient={personEmail}
          subject={email.subject}
          quotedText={email.text}
          onClose={() => setShowReply(false)}
          onSent={() => {
            setShowReply(false);
            onReplied();
          }}
        />
      )}
    </div>
  );
}

function mailboxParams(mailbox: InboxMailbox, uid?: number): string {
  const params = new URLSearchParams();
  if (uid) params.set("uid", String(uid));
  if (mailbox === "sent") params.set("mailbox", "sent");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function InboxClient() {
  const [mailbox, setMailbox] = useState<InboxMailbox>("inbox");
  const [emails, setEmails] = useState<EmailHeader[]>([]);
  const [selected, setSelected] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideSpam, setHideSpam] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  const loadEmails = useCallback(async () => {
    const requestId = ++listRequest.current;
    const box = mailbox;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inbox${mailboxParams(box)}`);
      if (requestId !== listRequest.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: EmailHeader[] = await res.json();
      if (requestId !== listRequest.current) return;
      setEmails(data);
    } catch (e) {
      if (requestId !== listRequest.current) return;
      setError(e instanceof Error ? e.message : "Failed to load emails");
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }, [mailbox]);

  useEffect(() => {
    // Initial fetch plus a poll — the effect IS the external subscription here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEmails();
    // Auth for this route reads Neon. Skip the poll while the tab is hidden
    // so a forgotten inbox cannot keep the database awake.
    const id = setInterval(() => {
      if (!document.hidden) loadEmails();
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden) loadEmails();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadEmails]);

  function selectMailbox(next: InboxMailbox) {
    if (next === mailbox) {
      void loadEmails();
      return;
    }
    listRequest.current += 1;
    detailRequest.current += 1;
    setSelected(null);
    setShowDetail(false);
    setEmails([]);
    setError(null);
    setMailbox(next);
  }

  async function openEmail(uid: number) {
    const requestId = ++detailRequest.current;
    const box = mailbox;
    setDetailLoading(true);
    setShowDetail(true);
    try {
      const res = await fetch(`/api/admin/inbox${mailboxParams(box, uid)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail: EmailDetail = await res.json();
      if (requestId !== detailRequest.current) return;
      setSelected(detail);
      setEmails((prev) =>
        prev.map((e) => (e.uid === uid ? { ...e, isRead: true } : e)),
      );
    } catch {
      if (requestId !== detailRequest.current) return;
      setSelected(null);
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }

  async function handleDelete(uid: number) {
    await fetch(`/api/admin/inbox${mailboxParams(mailbox, uid)}`, {
      method: "DELETE",
    });
    setEmails((prev) => prev.filter((e) => e.uid !== uid));
    setSelected(null);
    setShowDetail(false);
  }

  async function handleMarkUnread(uid: number) {
    const params = new URLSearchParams({ uid: String(uid), read: "false" });
    if (mailbox === "sent") params.set("mailbox", "sent");
    await fetch(`/api/admin/inbox?${params}`, { method: "PATCH" });
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
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)]/10">
            <Inbox className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-black leading-none">
              {mailbox === "sent" ? "Sent" : "Inbox"}
            </h1>
            <p className="text-xs text-[var(--foreground)]/50">
              hello@y2kase.com
            </p>
          </div>
          <div className="flex rounded-full bg-[var(--muted)] p-1">
            {(
              [
                ["inbox", "Inbox"],
                ["sent", "Sent"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mailbox === id}
                onClick={() => selectMailbox(id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold transition",
                  mailbox === id
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {mailbox === "inbox" && unreadCount > 0 && (
            <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs font-bold text-white">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mailbox === "inbox" && spamCount > 0 && (
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
                <p className="text-sm font-semibold">
                  {mailbox === "sent" ? "No sent mail yet" : "All clear!"}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {displayed.map((email) => (
                  <li key={email.uid}>
                    <EmailRow
                      email={email}
                      mailbox={mailbox}
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
                key={`${mailbox}-${selected.uid}`}
                email={selected}
                onDelete={() => handleDelete(selected.uid)}
                onMarkUnread={() => handleMarkUnread(selected.uid)}
                onClose={() => setShowDetail(false)}
                onReplied={() => {
                  if (mailbox === "sent") void loadEmails();
                }}
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
