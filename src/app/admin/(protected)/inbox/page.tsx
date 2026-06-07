import type { Metadata } from "next";
import { isImapConfigured } from "@/lib/imap";
import { InboxClient } from "./InboxClient";

export const metadata: Metadata = { title: "Admin · Inbox" };
export const dynamic = "force-dynamic";

export default function AdminInboxPage() {
  if (!isImapConfigured()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="text-2xl">📭</span>
        </div>
        <h1 className="text-2xl font-black">Inbox not configured</h1>
        <p className="mt-2 text-sm text-[var(--foreground)]/60">
          Add the following environment variables in Vercel (or your{" "}
          <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs">.env.local</code>
          ):
        </p>
        <pre className="mt-4 rounded-xl bg-[var(--muted)] p-4 text-left text-xs leading-relaxed">
          {`IMAP_HOST=mail.privateemail.com\nIMAP_PORT=993\nIMAP_USER=hello@y2kase.com\nIMAP_PASS=your_email_password`}
        </pre>
        <p className="mt-3 text-xs text-[var(--foreground)]/40">
          Restart the dev server after updating env vars.
        </p>
      </div>
    );
  }

  return <InboxClient />;
}
