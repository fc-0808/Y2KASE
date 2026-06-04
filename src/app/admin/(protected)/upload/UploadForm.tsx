"use client";

import { useActionState } from "react";
import { UploadCloud } from "lucide-react";
import { startIngest, type StartIngestState } from "./actions";

type TypeOption = { id: string; label: string; description: string; enabled: boolean };

const initialState: StartIngestState = { ok: false, message: "" };

export function UploadForm({
  types,
  defaultDir,
}: {
  types: TypeOption[];
  defaultDir: string;
}) {
  const [state, formAction, pending] = useActionState(startIngest, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-bold">Product type</label>
        <select
          name="type"
          defaultValue="iphone_case"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.enabled}>
              {t.label}
              {t.enabled ? "" : " (coming soon)"}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--foreground)]/50">
          Each type defines its own variation options and pricing.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-bold">
          Source folder (on this computer)
        </label>
        <input
          name="dir"
          defaultValue={defaultDir}
          placeholder="C:\path\to\folder-of-product-folders"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-[var(--foreground)]/50">
          A parent folder containing one subfolder per product (images + optional
          video). Subfolders are scanned recursively.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        <UploadCloud className="h-4 w-4" />
        {pending ? "Starting…" : "Start ingest"}
      </button>

      {state.message && (
        <p
          className={`rounded-xl border p-3 text-sm ${
            state.ok
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
