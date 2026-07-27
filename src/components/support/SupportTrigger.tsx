"use client";

/**
 * In-page CTA that raises the floating help panel.
 *
 * Lets any Server Component page (contact, FAQ, order confirmation) offer
 * "talk to us" without importing the widget or knowing it exists — the event
 * bus in `@/lib/support/constants` is the whole interface.
 */

import { MessageCircle } from "lucide-react";
import { openSupportPanel } from "@/lib/support/constants";

export function SupportTrigger({ label = "Chat with us" }: { label?: string }) {
  return (
    <button
      type="button"
      // Marks this as a request to open the panel, so the widget's
      // outside-click dismissal leaves it alone.
      data-support-trigger=""
      onClick={openSupportPanel}
      className="btn-candy inline-flex w-full items-center justify-center gap-2 px-6 py-3 text-sm"
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </button>
  );
}
