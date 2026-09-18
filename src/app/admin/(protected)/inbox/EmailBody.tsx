"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildEmailSrcDoc,
  collectInboxAttachmentUrls,
  escapeHtmlAttr,
  htmlContainsInboxAttachments,
} from "@/lib/inbox/attachments";

/**
 * Renders the HTML body in a sandboxed iframe.
 *
 * `cid:` parts are rewritten server-side to `/api/admin/inbox/attachment`.
 * We then hydrate those URLs into blob: URLs in the parent (which has the
 * session cookie) so the iframe does not have to make credentialed requests
 * of its own — sandboxed srcDoc documents are unreliable for that.
 */
export function EmailBody({
  uid,
  html,
  text,
}: {
  uid: number;
  html: string | null;
  text: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const needsHydration = Boolean(html && htmlContainsInboxAttachments(html));
  const [frameHtml, setFrameHtml] = useState<string | null>(html);
  const [hydrating, setHydrating] = useState(needsHydration);

  useEffect(() => {
    let cancelled = false;
    const blobs: string[] = [];

    async function hydrate() {
      if (!html) {
        setFrameHtml(null);
        setHydrating(false);
        return;
      }
      if (!htmlContainsInboxAttachments(html)) {
        setFrameHtml(html);
        setHydrating(false);
        return;
      }
      setHydrating(true);
      const next = await hydrateInboxHtml(html, (url) => blobs.push(url));
      if (!cancelled) {
        setFrameHtml(next);
        setHydrating(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
      for (const url of blobs) URL.revokeObjectURL(url);
    };
  }, [uid, html]);

  useEffect(() => {
    const iframe = iframeRef.current;
    const rendered = frameHtml ?? html;
    if (!iframe || !rendered) return;

    const listeners: Array<{ img: HTMLImageElement; fn: () => void }> = [];
    let observer: ResizeObserver | null = null;

    const syncHeight = () => {
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) return;
      const height = Math.max(
        doc.documentElement.scrollHeight,
        doc.body?.scrollHeight ?? 0,
        doc.body?.offsetHeight ?? 0,
      );
      iframe.style.height = `${Math.max(height + 16, 160)}px`;
    };

    const onLoad = () => {
      syncHeight();
      const doc = iframe.contentDocument;
      if (!doc) return;
      observer = new ResizeObserver(syncHeight);
      observer.observe(doc.documentElement);
      if (doc.body) observer.observe(doc.body);
      for (const img of Array.from(doc.images)) {
        const fn = () => syncHeight();
        img.addEventListener("load", fn);
        img.addEventListener("error", fn);
        listeners.push({ img, fn });
      }
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") onLoad();

    return () => {
      iframe.removeEventListener("load", onLoad);
      observer?.disconnect();
      for (const { img, fn } of listeners) {
        img.removeEventListener("load", fn);
        img.removeEventListener("error", fn);
      }
    };
  }, [frameHtml, html, uid]);

  const displayHtml = frameHtml ?? html;

  if (!html) {
    return (
      <pre className="whitespace-pre-wrap rounded-xl bg-[var(--muted)] p-4 font-sans text-sm leading-relaxed text-[var(--foreground)]">
        {text || "(empty)"}
      </pre>
    );
  }

  return (
    <div className="relative">
      {hydrating && (
        <div className="mb-2 text-xs font-semibold text-[var(--foreground)]/45">
          Loading images…
        </div>
      )}
      {displayHtml && (
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          srcDoc={buildEmailSrcDoc(displayHtml)}
          className="w-full rounded-lg border border-[var(--border)] bg-white"
          style={{ minHeight: 200 }}
          title="Email content"
        />
      )}
    </div>
  );
}

async function hydrateInboxHtml(
  html: string,
  track: (blobUrl: string) => void,
): Promise<string> {
  const urls = collectInboxAttachmentUrls(html);
  if (urls.length === 0) return html;

  const mapped = new Map<string, string>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return;
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        track(blobUrl);
        mapped.set(url, blobUrl);
      } catch {
        // Leave the original URL; the iframe may still be able to load it.
      }
    }),
  );

  let out = html;
  for (const [from, to] of mapped) {
    out = out.split(from).join(to);
    out = out.split(escapeHtmlAttr(from)).join(to);
  }
  return out;
}
