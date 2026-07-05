"use client";

import { useActionState, useState } from "react";
import { UploadCloud, FolderSearch, Image as ImageIcon } from "lucide-react";
import { startIngest, type StartIngestState } from "./actions";
import { FolderBrowser } from "./FolderBrowser";
import { IngestProgress } from "./IngestProgress";

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
  const [dir, setDir] = useState(defaultDir);
  const [browsing, setBrowsing] = useState(false);
  const [preview, setPreview] = useState<{
    productFolders: number;
    imageCount: number;
  } | null>(null);

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
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-700">
            <ImageIcon className="h-3.5 w-3.5" />
            {preview.productFolders} product folder
            {preview.productFolders === 1 ? "" : "s"} · {preview.imageCount}{" "}
            image
            {preview.imageCount === 1 ? "" : "s"} ready to ingest
          </p>
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
        disabled={pending || !dir.trim()}
        className="flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        <UploadCloud className="h-4 w-4" />
        {pending ? "Starting…" : "Start ingest"}
      </button>

      {state.ok && state.logFile ? (
        <IngestProgress
          key={state.logFile}
          logFile={state.logFile}
          dir={state.dir ?? dir}
          type={state.type ?? "auto"}
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
          initialPath={dir}
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
