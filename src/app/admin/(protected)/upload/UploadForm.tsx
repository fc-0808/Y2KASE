"use client";

import { useActionState, useEffect, useState } from "react";
import { UploadCloud, FolderSearch, Image as ImageIcon } from "lucide-react";
import { startIngest, type StartIngestState } from "./actions";
import {
  FolderBrowser,
  type FolderSummary,
} from "./FolderBrowser";
import { RunningJobNote, useCatalogJob } from "./UploadConsole";

type TypeOption = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

const initialState: StartIngestState = { ok: false, message: "" };

export function UploadForm({
  types,
  defaultDir,
}: {
  types: TypeOption[];
  defaultDir: string;
}) {
  const [state, formAction, pending] = useActionState(
    startIngest,
    initialState,
  );
  const { busy, reportJob } = useCatalogJob();
  const [dir, setDir] = useState(defaultDir);
  const [browsing, setBrowsing] = useState(false);
  const [preview, setPreview] = useState<FolderSummary | null>(null);

  useEffect(() => {
    if (!state.logFile) return;
    reportJob({
      kind: state.kind ?? "ingest",
      logFile: state.logFile,
      dir: state.dir ?? "",
      type: state.type ?? "auto",
      startedAt: state.startedAt ?? new Date().toISOString(),
      running: true,
    });
  }, [
    reportJob,
    state.dir,
    state.kind,
    state.logFile,
    state.startedAt,
    state.type,
  ]);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-bold">Product type</label>
        <select
          name="type"
          defaultValue="auto"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm"
        >
          <option value="auto">✨ Auto-detect (AI) — recommended</option>
          {types.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.enabled}>
              {t.label}
              {t.enabled ? "" : " (coming soon)"}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--foreground)]/50">
          Auto-detect lets the vision model classify each product from its
          photos. Pick a specific type to force it for the whole folder.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-bold">
          Source folder (on this computer)
        </label>
        <div className="flex gap-2">
          <input
            name="dir"
            value={dir}
            onChange={(e) => {
              setDir(e.target.value);
              setPreview(null);
            }}
            placeholder="C:\path\to\folder-of-product-folders"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setBrowsing(true)}
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
              {preview.imageCount === 1 ? "" : "s"} ready to ingest
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
            Click <span className="font-semibold">Browse</span> to pick a
            folder, or type a path. It should contain one subfolder per product
            (images + optional video); subfolders are scanned recursively.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || busy || !dir.trim()}
        className="flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        <UploadCloud className="h-4 w-4" />
        {pending ? "Starting…" : busy ? "Job running…" : "Start ingest"}
      </button>

      {busy ? (
        <RunningJobNote />
      ) : (
        state.blocked &&
        state.message && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            {state.message} Live progress stays pinned to the bottom of the
            screen.
          </p>
        )
      )}

      {!state.ok && state.message && !state.blocked && (
        <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}

      {browsing && (
        <FolderBrowser
          initialPath={dir}
          requireProducts
          onClose={() => setBrowsing(false)}
          onSelect={(selectedPath, summary) => {
            setDir(selectedPath);
            setPreview(summary ?? null);
            setBrowsing(false);
          }}
        />
      )}
    </form>
  );
}
