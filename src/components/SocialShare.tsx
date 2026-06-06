"use client";

/**
 * SocialShare — product-page share buttons.
 *
 * Pinterest: "Save" button using Pinterest's JS SDK (best-in-class UX for
 * product discovery; opens a board picker, lets the user add context).
 *
 * Copy Link: copies the canonical URL with a utm_source=copy tag so referral
 * traffic is attributable in GA4.
 *
 * Design follows Y2KASE's pixel + kawaii aesthetic — small, tasteful, brand-
 * coloured, with micro-animation feedback.
 */

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

type Props = {
  url: string;       // full canonical URL  (e.g. https://y2kase.com/products/...)
  title: string;     // product title for the Pinterest description
  imageUrl?: string; // product hero image URL
};

export function SocialShare({ url, title, imageUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const utmUrl = `${url}?utm_source=share&utm_medium=social&utm_campaign=product-share`;

  const pinterestUrl = new URL("https://pinterest.com/pin/create/button/");
  pinterestUrl.searchParams.set("url", utmUrl);
  pinterestUrl.searchParams.set("description", `${title} | Y2KASE ✨`);
  if (imageUrl) pinterestUrl.searchParams.set("media", imageUrl);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(utmUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = utmUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]/40">
        Share
      </span>

      {/* Pinterest Save */}
      <a
        href={pinterestUrl.toString()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Save to Pinterest"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#E60023]/10 text-[#E60023] transition hover:bg-[#E60023] hover:text-white"
        title="Save to Pinterest"
      >
        <PinterestIcon className="h-4 w-4" />
      </a>

      {/* Copy link */}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Link copied!" : "Copy link"}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--foreground)]/10 text-[var(--foreground)]/60 transition hover:bg-[var(--primary)] hover:text-white"
        title={copied ? "Copied!" : "Copy link"}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Open in new tab (for Instagram — copy URL then paste in bio/story) */}
      <a
        href={utmUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open product page"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--foreground)]/10 text-[var(--foreground)]/60 transition hover:bg-[var(--primary)] hover:text-white"
        title="Open in new tab (useful for Instagram)"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}
