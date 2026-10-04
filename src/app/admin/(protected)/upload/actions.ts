"use server";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import {
  getProductType,
  listEnabledProductTypes,
} from "@/lib/catalog/product-types";
import type { CatalogJobKind } from "@/lib/catalog/job-types";
import {
  acquireCatalogJobLock,
  getActiveCatalogJob,
  releaseCatalogJobLock,
  updateCatalogJobLock,
} from "@/lib/catalog/job-lock";

function blockedJobState(kind: CatalogJobKind): {
  ok: false;
  blocked: true;
  message: string;
  logFile?: string;
  dir?: string;
  type?: string;
  kind?: CatalogJobKind;
  startedAt?: string;
} {
  const active = getActiveCatalogJob();
  const label = active?.kind === "classify" ? "classification" : "catalog ingest";
  return {
    ok: false,
    blocked: true,
    message: active
      ? `A ${label} is already running${active.dir ? ` (${active.dir})` : ""}.`
      : "Another catalog ingest or classification job is already running.",
    logFile: active?.logFile || undefined,
    dir: active?.dir,
    type: active?.type,
    kind: active?.kind ?? kind,
    startedAt: active?.startedAt,
  };
}

function monitorCatalogJob(
  child: ReturnType<typeof spawn>,
  stream: fs.WriteStream,
  lockFile: string,
): void {
  child.stdout?.pipe(stream, { end: false });
  child.stderr?.pipe(stream, { end: false });
  child.on("close", (code, signal) => {
    if (code && code !== 0) {
      stream.write(`\n[process exited with code ${code}]\n`);
    } else if (signal) {
      stream.write(`\n[process exited after signal ${signal}]\n`);
    }
    stream.end();
    releaseCatalogJobLock(lockFile);
  });
  child.on("error", (err) => {
    stream.write(`\n[spawn error] ${err.message}\n`);
  });
  stream.on("error", (err) => {
    console.error("[catalog-job] log stream error:", err);
  });
}

export type StartIngestState = {
  ok: boolean;
  message: string;
  /** True when the single-job lock is already held. */
  blocked?: boolean;
  /** Basename of the progress log (e.g. "ingest-123.log") for live tracking. */
  logFile?: string;
  /** Resolved folder + type, echoed back for the progress panel header. */
  dir?: string;
  type?: string;
  kind?: CatalogJobKind;
  startedAt?: string;
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
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Unauthorized." };
  }

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
  const lockFile = acquireCatalogJobLock(logDir, "ingest");
  if (!lockFile) return blockedJobState("ingest");
  const logName = `ingest-${Date.now()}.log`;
  const logFile = path.join(logDir, logName);
  const startedAt = new Date().toISOString();
  updateCatalogJobLock(lockFile, {
    kind: "ingest",
    logFile: logName,
    dir: resolved,
    type,
  });

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
  try {
    const child = spawn("npm", ["run", "build:catalog"], {
      cwd: process.cwd(),
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, INGEST_DIR: resolved, INGEST_PRODUCT_TYPE: type },
    });
    updateCatalogJobLock(lockFile, {
      kind: "ingest",
      childPid: child.pid,
      logFile: logName,
      dir: resolved,
      type,
    });
    monitorCatalogJob(child, stream, lockFile);
  } catch (err) {
    stream.end();
    releaseCatalogJobLock(lockFile);
    return {
      ok: false,
      message: `Could not start ingest: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  return {
    ok: true,
    message: "Ingest started.",
    logFile: logName,
    dir: resolved,
    type,
    kind: "ingest",
    startedAt,
  };
}

export type StartClassifyState = {
  ok: boolean;
  message: string;
  blocked?: boolean;
  logFile?: string;
  dir?: string;
  dest?: string;
  apply?: boolean;
  type?: string;
  kind?: CatalogJobKind;
  startedAt?: string;
};

/**
 * Kick off the pre-ingest folder classifier: QQ/WeChat supplier dumps →
 * brand/type folders with listing.json sidecars. Local-only, same spawn
 * pattern as {@link startIngest}. Dry-run unless `apply` is checked.
 */
export async function startClassify(
  _prev: StartClassifyState,
  formData: FormData,
): Promise<StartClassifyState> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Unauthorized." };
  }

  if (process.env.VERCEL) {
    return {
      ok: false,
      message:
        "Folder classification runs locally only. Run `npm run catalog:classify` on your machine.",
    };
  }

  const dir = String(formData.get("dir") ?? "").trim();
  const dest = String(formData.get("dest") ?? "").trim();
  const apply = String(formData.get("apply") ?? "") === "1";

  if (!dir) return { ok: false, message: "Enter a source folder path." };

  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    return { ok: false, message: `Folder not found: ${resolvedDir}` };
  }

  const resolvedDest = dest
    ? path.resolve(dest)
    : path.resolve(process.env.LOCAL_CATALOG_ROOT ?? "./bestListings");

  const logDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(logDir, { recursive: true });
  const lockFile = acquireCatalogJobLock(logDir, "classify");
  if (!lockFile) return blockedJobState("classify");
  const logName = `classify-${Date.now()}.log`;
  const logFile = path.join(logDir, logName);
  const startedAt = new Date().toISOString();
  const classifyType = apply ? "apply" : "dry-run";
  updateCatalogJobLock(lockFile, {
    kind: "classify",
    logFile: logName,
    dir: resolvedDir,
    type: classifyType,
  });

  const stream = fs.createWriteStream(logFile, { flags: "a" });
  try {
    const child = spawn("npm", ["run", "catalog:classify"], {
      cwd: process.cwd(),
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CLASSIFY_DIR: resolvedDir,
        CLASSIFY_DEST: resolvedDest,
        CLASSIFY_APPLY: apply ? "true" : "false",
      },
    });
    updateCatalogJobLock(lockFile, {
      kind: "classify",
      childPid: child.pid,
      logFile: logName,
      dir: resolvedDir,
      type: classifyType,
    });
    monitorCatalogJob(child, stream, lockFile);
  } catch (err) {
    stream.end();
    releaseCatalogJobLock(lockFile);
    return {
      ok: false,
      message: `Could not start classification: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  return {
    ok: true,
    message: apply ? "Classification started." : "Dry-run started.",
    logFile: logName,
    dir: resolvedDir,
    dest: resolvedDest,
    apply,
    type: classifyType,
    kind: "classify",
    startedAt,
  };
}

export type { ActiveCatalogJob } from "@/lib/catalog/job-types";
