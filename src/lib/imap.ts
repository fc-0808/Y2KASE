/**
 * IMAP inbox client for hello@y2kase.com
 *
 * Connects to Namecheap Private Email via IMAP (mail.privateemail.com:993),
 * fetches messages, marks them read, and moves them to Trash on delete.
 *
 * All env vars:
 *   IMAP_HOST  — default: mail.privateemail.com
 *   IMAP_PORT  — default: 993
 *   IMAP_USER  — e.g. hello@y2kase.com
 *   IMAP_PASS  — your email account password
 */

import { ImapFlow } from "imapflow";
import PostalMime, { type Email } from "postal-mime";
import {
  prepareInboxBody,
  type InboxAttachment,
  type InboxBinaryPart,
  type InboxMailbox,
} from "@/lib/inbox/attachments";
import {
  getInboxAttachment,
  loadInboxAttachments,
  rememberInboxAttachments,
} from "@/lib/inbox/attachment-cache";

export type { InboxAttachment, InboxMailbox };

const SENT_FALLBACKS = ["Sent", "Sent Items", "Sent Messages", "INBOX.Sent"];
let sentMailboxPath: string | null = null;

export interface EmailHeader {
  uid: number;
  mailbox: InboxMailbox;
  from: string;
  fromEmail: string;
  to: string;
  toEmail: string;
  subject: string;
  date: Date;
  isRead: boolean;
  isSpam: boolean;
  preview: string;
}

export interface EmailDetail extends EmailHeader {
  html: string | null;
  text: string;
  toEmail: string;
  attachments: InboxAttachment[];
}

// Known spam/solicitation patterns based on actual inbox content.
const SPAM_PATTERNS = [
  /commission/i,
  /\d+[\s-]*orders?/i,
  /willing to (improve|help|grow)/i,
  /collaborat/i,
  /ecommfafix/i,
  /shuttle\s+(now|app)/i,
  /reno upfront/i,
  /generate.*orders?/i,
  /shopify.*upgrade/i,
  /ads?\s+service/i,
  /\bseo\b.*service/i,
  /free.*audit/i,
  /boost.*sales/i,
  /link.?building/i,
];

function detectSpam(subject: string, fromEmail: string): boolean {
  const haystack = `${subject} ${fromEmail}`;
  return SPAM_PATTERNS.some((p) => p.test(haystack));
}

export function isImapConfigured(): boolean {
  return Boolean(process.env.IMAP_USER && process.env.IMAP_PASS);
}

function missingMailbox(err: unknown): boolean {
  const responseText =
    err && typeof err === "object" && "responseText" in err
      ? String((err as { responseText?: unknown }).responseText ?? "")
      : "";
  const message = `${err instanceof Error ? err.message : String(err)} ${responseText}`;
  return /does(?:n't| not) exist|nonexistent|unknown mailbox|no such mailbox|trycreate/i.test(
    message,
  );
}

function isSentBox(box: {
  path: string;
  name?: string;
  specialUse?: string;
  flags?: Set<string>;
}): boolean {
  if (box.specialUse === "\\Sent") return true;
  if (box.flags) {
    for (const flag of box.flags) {
      if (flag.toLowerCase() === "\\sent") return true;
    }
  }
  const name = (box.name || box.path.split(/[./]/).pop() || "").toLowerCase();
  return name === "sent" || name === "sent items" || name === "sent messages";
}

async function resolveSentPath(client: ImapFlow): Promise<string> {
  if (sentMailboxPath) return sentMailboxPath;
  const boxes = await client.list();
  const match =
    boxes.find((box) => isSentBox(box)) ??
    boxes.find((box) =>
      SENT_FALLBACKS.some(
        (candidate) =>
          box.path === candidate ||
          box.name.toLowerCase() === candidate.toLowerCase(),
      ),
    );
  const path = match?.path ?? "Sent";
  sentMailboxPath = path;
  return path;
}

async function mailboxPath(
  client: ImapFlow,
  mailbox: InboxMailbox,
): Promise<string> {
  if (mailbox === "inbox") return "INBOX";
  return resolveSentPath(client);
}

async function openMailbox(client: ImapFlow, mailbox: InboxMailbox) {
  const path = await mailboxPath(client, mailbox);
  try {
    return await client.mailboxOpen(path);
  } catch (err) {
    if (mailbox !== "sent") throw err;
    sentMailboxPath = null;
    for (const candidate of SENT_FALLBACKS) {
      if (candidate === path) continue;
      try {
        const opened = await client.mailboxOpen(candidate);
        sentMailboxPath = candidate;
        return opened;
      } catch {
        // Try the next known Sent folder name.
      }
    }
    console.error("[imap] could not open Sent", err);
    throw new Error("Sent folder was not found on the mail server.");
  }
}

function makeClient(): ImapFlow {
  return new ImapFlow({
    host: process.env.IMAP_HOST ?? "mail.privateemail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER ?? "",
      pass: process.env.IMAP_PASS ?? "",
    },
    // Suppress verbose logging in production.
    logger: false,
  });
}

/**
 * Fetch the most recent `limit` emails from INBOX or Sent, newest first.
 * Returns lightweight headers only — no body content.
 */
export async function fetchEmails(
  limit = 40,
  mailbox: InboxMailbox = "inbox",
): Promise<EmailHeader[]> {
  if (!isImapConfigured()) return [];

  const client = makeClient();
  const headers: EmailHeader[] = [];

  try {
    await client.connect();
    const opened = await openMailbox(client, mailbox);

    if (opened.exists === 0) return [];

    // Always fetch the last `limit` sequence numbers (most recent).
    const start = Math.max(1, opened.exists - limit + 1);
    const range = `${start}:*`;

    for await (const msg of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      bodyParts: ["TEXT"],
    })) {
      if (!msg.envelope || !msg.flags) continue;

      const fromAddr = msg.envelope.from?.[0];
      const toAddr = msg.envelope.to?.[0];
      const fromName = fromAddr?.name ?? fromAddr?.address ?? "Unknown";
      const fromEmail = fromAddr?.address ?? "";
      const toName = toAddr?.name?.trim() || toAddr?.address || "";
      const toEmail = toAddr?.address ?? "";
      const subject = msg.envelope.subject ?? "(no subject)";

      // Extract plain-text preview from the body part if available.
      const textPart = msg.bodyParts?.get("TEXT");
      const preview = textPart
        ? textPart.toString("utf8").replace(/\s+/g, " ").slice(0, 140)
        : "";

      headers.push({
        uid: msg.uid,
        mailbox,
        from: fromName,
        fromEmail,
        to: toName,
        toEmail,
        subject,
        date: msg.envelope.date ?? new Date(),
        isRead: msg.flags.has("\\Seen"),
        isSpam: mailbox === "sent" ? false : detectSpam(subject, fromEmail),
        preview,
      });
    }

    // Reverse so the newest email appears first.
    return headers.reverse();
  } finally {
    await client.logout().catch(() => {});
  }
}

type PreparedMessage = {
  detail: EmailDetail;
  binaries: InboxBinaryPart[];
};

/**
 * Fetch a single email's full content, rewrite inline images so the admin
 * iframe can render them, and mark the message as read.
 */
export async function fetchEmailDetail(
  uid: number,
  mailbox: InboxMailbox = "inbox",
): Promise<EmailDetail | null> {
  if (!isImapConfigured()) return null;

  const prepared = await downloadAndPrepare(uid, { markSeen: true, mailbox });
  return prepared?.detail ?? null;
}

/**
 * Serve one MIME part previously discovered while reading the message.
 * Cache-first so a gallery of photos does not open N IMAP connections.
 */
export async function fetchEmailAttachment(
  uid: number,
  id: string,
  mailbox: InboxMailbox = "inbox",
): Promise<InboxBinaryPart | null> {
  if (!isImapConfigured()) return null;

  const cached = getInboxAttachment(uid, id, mailbox);
  if (cached) return cached;

  const loaded = await loadInboxAttachments(uid, mailbox, async () => {
    const prepared = await downloadAndPrepare(uid, { markSeen: false, mailbox });
    return prepared?.binaries ?? null;
  });
  return loaded?.parts.get(id) ?? null;
}

async function downloadAndPrepare(
  uid: number,
  opts: { markSeen: boolean; mailbox: InboxMailbox },
): Promise<PreparedMessage | null> {
  const client = makeClient();

  try {
    await client.connect();
    await openMailbox(client, opts.mailbox);

    let prepared: PreparedMessage | null = null;

    for await (const msg of client.fetch(
      { uid: String(uid) },
      { uid: true, envelope: true, flags: true, source: true },
      { uid: true },
    )) {
      if (!msg.envelope || !msg.flags) continue;

      const fromAddr = msg.envelope.from?.[0];
      const toAddr = msg.envelope.to?.[0];
      const fromEmail = fromAddr?.address ?? "";
      const subject = msg.envelope.subject ?? "(no subject)";

      const rawSource: Buffer | undefined = msg.source as Buffer | undefined;
      let parsed: Email | null = null;
      if (rawSource) {
        try {
          parsed = await PostalMime.parse(rawSource, { maxNestingDepth: 64 });
        } catch (err) {
          console.error("[imap] Failed to parse message", uid, err);
        }
      }

      const body = prepareInboxBody(
        parsed ?? { html: null, text: "", attachments: [] },
        uid,
        opts.mailbox,
      );

      prepared = {
        detail: {
          uid: msg.uid,
          mailbox: opts.mailbox,
          from: fromAddr?.name ?? fromEmail,
          fromEmail,
          to: toAddr?.name?.trim() || toAddr?.address || "",
          toEmail: toAddr?.address ?? "",
          subject,
          date: msg.envelope.date ?? new Date(),
          isRead: msg.flags.has("\\Seen"),
          isSpam:
            opts.mailbox === "sent" ? false : detectSpam(subject, fromEmail),
          preview: body.text.slice(0, 140),
          html: body.html,
          text: body.text,
          attachments: body.attachments,
        },
        binaries: body.binaries,
      };
    }

    if (prepared) {
      rememberInboxAttachments(uid, prepared.binaries, opts.mailbox);
      if (opts.markSeen) {
        await client
          .messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true })
          .catch(() => {});
      }
    }

    return prepared;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Move a message to Trash (or delete permanently if Trash doesn't exist).
 */
export async function deleteEmail(
  uid: number,
  mailbox: InboxMailbox = "inbox",
): Promise<void> {
  if (!isImapConfigured()) return;

  const client = makeClient();

  try {
    await client.connect();
    await openMailbox(client, mailbox);

    // Try to move to Trash; fall back to permanent delete.
    const trashMoved = await client
      .messageMove({ uid: String(uid) }, "Trash", { uid: true })
      .catch(() => null);

    if (!trashMoved) {
      await client
        .messageDelete({ uid: String(uid) }, { uid: true })
        .catch(() => {});
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Toggle the \Seen flag on a message.
 */
export async function markEmail(
  uid: number,
  read: boolean,
  mailbox: InboxMailbox = "inbox",
): Promise<void> {
  if (!isImapConfigured()) return;

  const client = makeClient();

  try {
    await client.connect();
    await openMailbox(client, mailbox);

    if (read) {
      await client.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true });
    } else {
      await client.messageFlagsRemove({ uid: String(uid) }, ["\\Seen"], { uid: true });
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Return the count of unread messages in INBOX.
 */
export async function getUnreadCount(): Promise<number> {
  if (!isImapConfigured()) return 0;

  const client = makeClient();

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");
    // `exists` is the total count; `unseen` may not be on all server responses.
    return (mailbox as unknown as { unseen?: number }).unseen ?? 0;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Save a copy of a message we just sent. SMTP only relays mail; Private Email
 * does not put that copy in Sent unless we APPEND it.
 */
export async function archiveSentCopy(raw: Buffer): Promise<void> {
  if (!isImapConfigured()) {
    throw new Error("IMAP not configured");
  }

  const client = makeClient();
  try {
    await client.connect();
    const preferred = await resolveSentPath(client);
    const candidates = [...new Set([preferred, ...SENT_FALLBACKS])];
    let lastError: unknown;
    for (const path of candidates) {
      try {
        const saved = await client.append(path, raw, ["\\Seen"]);
        if (!saved) throw new Error("Could not save a copy to Sent");
        sentMailboxPath = path;
        return;
      } catch (err) {
        lastError = err;
        sentMailboxPath = null;
        if (!missingMailbox(err)) break;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not save a copy to Sent");
  } finally {
    await client.logout().catch(() => {});
  }
}
