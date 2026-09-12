/**
 * Quiet Preferred Sources ask for editorial surfaces.
 *
 * Loaded only on pages that opt in (blog posts, About, Insights) — never on
 * cart, checkout or PDPs, where the reader is buying, not following a
 * publication. The official Google button is the documented embed; the text
 * deeplink is the no-JS / crawler path so the destination exists in HTML even
 * if `publisher.js` never runs.
 */
import Script from "next/script";
import {
  PREFERRED_SOURCES_SCRIPT,
  preferredSourcesDeeplink,
} from "@/lib/seo/preferred-sources";

export function PreferredSourceCard() {
  const deeplink = preferredSourcesDeeplink();

  return (
    <aside className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8">
      <Script src={PREFERRED_SOURCES_SCRIPT} strategy="afterInteractive" />
      <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
        Google
      </p>
      <h2 className="mt-2 font-display text-xl font-extrabold sm:text-2xl">
        Prefer Y2KASE in your Google
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--foreground)]/70">
        If you already read our guides, you can mark y2kase.com as a preferred
        source. Google may then badge our links in{" "}
        <em>your</em> Top Stories, AI Overviews and AI Mode. It does not change
        results for anyone else.
      </p>
      <div className="mt-5">
        <div
          {...{ "google-add-preferred-source-btn": "" }}
          data-theme="light"
        />
      </div>
      <p className="mt-3 text-xs font-semibold text-[var(--foreground)]/50">
        <a
          href={deeplink}
          className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--primary)]"
        >
          Or add us from Google&apos;s source preferences
        </a>
        . You need to be signed into Google.
      </p>
    </aside>
  );
}
