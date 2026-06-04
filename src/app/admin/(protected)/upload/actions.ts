"use server";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getProductType, listEnabledProductTypes } from "@/lib/catalog/product-types";

export type StartIngestState = {
  ok: boolean;
  message: string;
};

/**
 * Kick off the bulk ingest pipeline for a local folder of product folders.
 *
 * This is a LOCAL-ONLY operation: it reads files from the machine's disk and
 * spawns the resumable `build:catalog` script in the background. It is not
 * available on Vercel (no persistent local filesystem there).
 */
export async function startIngest(
  _prev: StartIngestState,
  formData: FormData,
): Promise<StartIngestState> {
  if (process.env.VERCEL) {
    return {
      ok: false,
      message:
        "Bulk ingest runs locally only. Run `npm run build:catalog` on your machine.",
    };
  }

  const dir = String(formData.get("dir") ?? "").trim();
  const type = String(formData.get("type") ?? "iphone_case").trim();

  if (!dir) return { ok: false, message: "Enter a folder path." };

  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, message: `Folder not found: ${resolved}` };
  }

  const enabled = listEnabledProductTypes().map((t) => t.id);
  if (!enabled.includes(getProductType(type).id)) {
    return { ok: false, message: `Product type "${type}" is not enabled yet.` };
  }

  const logDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `ingest-${Date.now()}.log`);
  const out = fs.openSync(logFile, "a");

  // Spawn the resumable CLI in the background (Windows needs shell for npm.cmd).
  const child = spawn(
    "npm",
    ["run", "build:catalog", "--", "--dir", resolved, "--type", type],
    {
      cwd: process.cwd(),
      detached: true,
      shell: true,
      stdio: ["ignore", out, out],
    },
  );
  child.unref();

  return {
    ok: true,
    message: `Ingest started for "${resolved}" (${type}). Progress logs: data/${path.basename(
      logFile,
    )}. Drafts will appear below as they finish.`,
  };
}
