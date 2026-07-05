"use server";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  getProductType,
  listEnabledProductTypes,
} from "@/lib/catalog/product-types";

export type StartIngestState = {
  ok: boolean;
  message: string;
  /** Basename of the progress log (e.g. "ingest-123.log") for live tracking. */
  logFile?: string;
  /** Resolved folder + type, echoed back for the progress panel header. */
  dir?: string;
  type?: string;
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

  // "auto" defers classification to the vision model per product (see
  // build-catalog --type auto). Any explicit type must be enabled.
  if (type !== "auto") {
    const enabled = listEnabledProductTypes().map((t) => t.id);
    if (!enabled.includes(getProductType(type).id)) {
      return {
        ok: false,
        message: `Product type "${type}" is not enabled yet.`,
      };
    }
  }

  const logDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `ingest-${Date.now()}.log`);

  // Spawn the resumable CLI in the background (Windows needs a shell to resolve
  // npm.cmd). Two Windows-specific gotchas are handled here:
  //
  //  1. Config is passed via INGEST_DIR / INGEST_PRODUCT_TYPE env vars, NOT
  //     `npm run … -- --dir … --type …`. npm swallows those flags (passing only
  //     their bare values), which made the script resolve the wrong directory.
  //     build-catalog.ts reads these env vars directly, so nothing can mangle
  //     them.
  //  2. stdout/stderr are PIPED into a file stream from this process rather than
  //     handed to the child as a raw file descriptor — with `shell: true` on
  //     Windows, fd-based stdio silently drops all output, leaving the progress
  //     log empty. Pipes are owned by Node and capture reliably.
  //
  // We deliberately don't detach: the long-lived Next server keeps the pipe and
  // child alive, and the ingest is resumable if the server restarts mid-run.
  const stream = fs.createWriteStream(logFile, { flags: "a" });
  const child = spawn("npm", ["run", "build:catalog"], {
    cwd: process.cwd(),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, INGEST_DIR: resolved, INGEST_PRODUCT_TYPE: type },
  });
  child.stdout?.pipe(stream);
  child.stderr?.pipe(stream);
  child.on("error", (e) => stream.write(`\n[spawn error] ${e.message}\n`));

  return {
    ok: true,
    message: "Ingest started.",
    logFile: path.basename(logFile),
    dir: resolved,
    type,
  };
}
