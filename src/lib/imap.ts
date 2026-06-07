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
import PostalMime from "postal-mime";

export interface EmailHeader {
  uid: number;
  from: string;
  fromEmail: string;
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
 * Fetch the most recent `limit` emails from INBOX, newest first.
 * Returns lightweight headers only — no body content.
 */
export async function fetchEmails(limit = 40): Promise<EmailHeader[]> {
  if (!isImapConfigured()) return [];

  const client = makeClient();
  const headers: EmailHeader[] = [];

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");

    if (mailbox.exists === 0) return [];

    // Always fetch the last `limit` sequence numbers (most recent).
    const start = Math.max(1, mailbox.exists - limit + 1);
    const range = `${start}:*`;

    for await (const msg of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      bodyParts: ["TEXT"],
    })) {
      if (!msg.envelope || !msg.flags) continue;

      const fromAddr = msg.envelope.from?.[0];
      const fromName = fromAddr?.name ?? fromAddr?.address ?? "Unknown";
      const fromEmail = fromAddr?.address ?? "";
      const subject = msg.envelope.subject ?? "(no subject)";

      // Extract plain-text preview from the body part if available.
      const textPart = msg.bodyParts?.get("TEXT");
      const preview = textPart
        ? textPart.toString("utf8").replace(/\s+/g, " ").slice(0, 140)
        : "";

      headers.push({
        uid: msg.uid,
        from: fromName,
        fromEmail,
        subject,
        date: msg.envelope.date ?? new Date(),
        isRead: msg.flags.has("\\Seen"),
        isSpam: detectSpam(subject, fromEmail),
        preview,
      });
    }

    // Reverse so the newest email appears first.
    return headers.reverse();
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Fetch a single email's full content and mark it as read.
 */
export async function fetchEmailDetail(uid: number): Promise<EmailDetail | null> {
  if (!isImapConfigured()) return null;

  const client = makeClient();

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    let detail: EmailDetail | null = null;

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

      // Parse the raw RFC 2822 message with PostalMime.
      const rawSource: Buffer | undefined = msg.source as Buffer | undefined;
      const parsed = rawSource
        ? await new PostalMime().parse(rawSource)
        : { html: null, text: "" };

      detail = {
        uid: msg.uid,
        from: fromAddr?.name ?? fromEmail,
        fromEmail,
        toEmail: toAddr?.address ?? "",
        subject,
        date: msg.envelope.date ?? new Date(),
        isRead: msg.flags.has("\\Seen"),
        isSpam: detectSpam(subject, fromEmail),
        preview: ((parsed as { text?: string }).text ?? "").slice(0, 140),
        html: (parsed as { html?: string | null }).html ?? null,
        text: (parsed as { text?: string }).text ?? "",
      };
    }

    // Mark as \Seen after reading.
    if (detail) {
      await client
        .messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true })
        .catch(() => {});
    }

    return detail;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Move a message to Trash (or delete permanently if Trash doesn't exist).
 */
export async function deleteEmail(uid: number): Promise<void> {
  if (!isImapConfigured()) return;

  const client = makeClient();

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

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
export async function markEmail(uid: number, read: boolean): Promise<void> {
  if (!isImapConfigured()) return;

  const client = makeClient();

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

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
