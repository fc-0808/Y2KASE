"use client";

import { useActionState, useState } from "react";
import { FolderSearch, Image as ImageIcon, Sparkles } from "lucide-react";
import { startClassify, type StartClassifyState } from "./actions";
import {
  FolderBrowser,
  type FolderSummary,
} from "./FolderBrowser";
import { IngestProgress } from "./IngestProgress";

const initialState: StartClassifyState = { ok: false, message: "" };

export function ClassifyForm({
  defaultDir,
  defaultDest,
}: {
  defaultDir: string;
  defaultDest: string;
}) {
  const [state, formAction, pending] = useActionState(
    startClassify,
    initialState,
  );
  const [dir, setDir] = useState(defaultDir);
  const [dest, setDest] = useState(defaultDest);
  const [browsing, setBrowsing] = useState<"dir" | "dest" | null>(null);
  const [preview, setPreview] = useState<FolderSummary | null>(null);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-bold">
          Incoming dump (QQ / WeChat downloads)
        </label>
        <div className="flex gap-2">
          <input
            name="dir"
            value={dir}
            onChange={(e) => {
              setDir(e.target.value);
              setPreview(null);
            }}
            placeholder="C:\path\to\qq-download"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setBrowsing("dir")}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <FolderSearch className="h-4 w-4" /> Browse
          </button>
        </div>
        {preview ? (
          <div className="mt-1.5 space-y-0.5 text-xs font-semibold">
            <p className="flex items-center gap-1.5 text-green-700">
              <ImageIcon className="h-3.5 w-3.5" />
              {preview.productFolders} product folder
              {preview.productFolders === 1 ? "" : "s"} · {preview.imageCount}{" "}
              image
              {preview.imageCount === 1 ? "" : "s"} to classify
            </p>
            {preview.ignoredHelperFolders > 0 && (
              <p className="text-amber-700">
                Excluding {preview.ignoredHelperFolders} internal
                {" _originals/_removed "}
                folder{preview.ignoredHelperFolders === 1 ? "" : "s"} (
                {preview.ignoredHelperImages} non-gallery image
                {preview.ignoredHelperImages === 1 ? "" : "s"}).
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-[var(--foreground)]/50">
            One subfolder per product. Chinese names, numeric SKUs, mixed types
            and chat screenshots are all fine — the vision model sorts them.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-bold">
          File into (catalog root)
        </label>
        <div className="flex gap-2">
          <input
            name="dest"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder={defaultDest}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setBrowsing("dest")}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <FolderSearch className="h-4 w-4" /> Browse
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--foreground)]/50">
          High-confidence products move into brand/type folders (Sanrio,
          AirPods, Others). Unsure items go to _review/; junk to _rejected/.
        </p>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="apply"
          value="1"
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-semibold">Move folders</span>
          <span className="block text-xs text-[var(--foreground)]/50">
            Leave unchecked for a dry-run. Check this only after the plan looks
            right — it writes listing.json and relocates folders.
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={pending || !dir.trim()}
        className="flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" />
        {pending ? "Starting…" : "Classify folders"}
      </button>

      {state.ok && state.logFile ? (
        <IngestProgress
          key={state.logFile}
          kind="classify"
          logFile={state.logFile}
          dir={state.dir ?? dir}
          type={state.apply ? "apply" : "dry-run"}
        />
      ) : (
        state.message && (
          <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {state.message}
          </p>
        )
      )}

      {browsing && (
        <FolderBrowser
          initialPath={browsing === "dir" ? dir : dest}
          requireProducts={browsing === "dir"}
          onClose={() => setBrowsing(null)}
          onSelect={(selectedPath, summary) => {
            if (browsing === "dir") {
              setDir(selectedPath);
              setPreview(summary ?? null);
            } else {
              setDest(selectedPath);
            }
            setBrowsing(null);
          }}
        />
      )}
    </form>
  );
}
