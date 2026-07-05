"use client";

import { useEffect, useState } from "react";
import {
  Folder,
  ArrowUp,
  X,
  Loader2,
  HardDrive,
  Check,
  Image as ImageIcon,
  TriangleAlert,
} from "lucide-react";

type Entry = { name: string; path: string };
type Summary = { productFolders: number; imageCount: number };
type BrowseResponse = {
  path: string | null;
  parent: string | null;
  entries: Entry[];
  summary?: Summary;
  error?: string;
};

export function FolderBrowser({
  initialPath,
  onClose,
  onSelect,
}: {
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string, summary?: Summary) => void;
}) {
  const [path, setPath] = useState<string | null>(initialPath?.trim() || null);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (path) {
      qs.set("path", path);
      qs.set("inspect", "1");
    }
    fetch(`/api/admin/browse?${qs.toString()}`)
      .then((r) => r.json())
      .then((d: BrowseResponse) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => !cancelled && setError("Failed to read folder."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const atRoots = !data?.path;
  const current = data?.path ?? null;
  const summary = data?.summary;
  const ingestable = (summary?.productFolders ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <Folder className="h-5 w-5 text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black">Choose a folder</h2>
            <p className="truncate text-xs text-[var(--foreground)]/55">
              {current ?? "This computer"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-2">
          <button
            onClick={() => setPath(data?.parent ?? null)}
            disabled={atRoots}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-40"
          >
            <ArrowUp className="h-3.5 w-3.5" /> Up
          </button>
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--foreground)]/40" />
          )}
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {error ? (
            <div className="m-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : data?.entries.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--foreground)]/50">
              No subfolders here.
            </p>
          ) : (
            <ul>
              {data?.entries.map((e) => (
                <li key={e.path}>
                  <button
                    onClick={() => setPath(e.path)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                  >
                    {atRoots ? (
                      <HardDrive className="h-4 w-4 shrink-0 text-[var(--foreground)]/50" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                    )}
                    <span className="truncate">{e.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-[var(--border)] px-5 py-3">
          <div className="min-w-0 flex-1 text-xs">
            {current && summary && (
              <span
                className={`flex items-center gap-1.5 font-semibold ${
                  ingestable ? "text-green-700" : "text-[var(--foreground)]/45"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {summary.productFolders} product folder
                {summary.productFolders === 1 ? "" : "s"} · {summary.imageCount}{" "}
                image{summary.imageCount === 1 ? "" : "s"} detected
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
          >
            Cancel
          </button>
          <button
            onClick={() => current && onSelect(current, summary)}
            disabled={!current}
            className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}
