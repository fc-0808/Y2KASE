"use client";

/** Footer control that re-opens the cookie consent banner on demand. */

import { CONSENT_OPEN_EVENT } from "@/lib/analytics/consent";

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
