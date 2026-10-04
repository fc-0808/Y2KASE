import fs from "node:fs";
import path from "node:path";
import type { ActiveCatalogJob, CatalogJobKind } from "./job-types";

const CATALOG_JOB_LOCK = "catalog-job.lock";
const LOG_RE = /^(ingest|classify)-(\d+)\.log$/;
/** A lock with no child yet is only "starting" for this long. After that it is stale. */
const STARTING_WINDOW_MS = 20_000;
/** Match a log created just before or after the lock timestamp. */
const LOG_MATCH_WINDOW_MS = 120_000;
/** Keep a finished run on the upload page for this long after its log stops growing. */
const RECENT_FINISHED_MS = 30 * 60 * 1000;

type CatalogJobLock = {
  kind: CatalogJobKind;
  parentPid: number;
  childPid?: number;
  startedAt: string;
  logFile?: string;
  dir?: string;
  type?: string;
};

export function catalogLogDir(): string {
  return path.resolve(process.cwd(), "data");
}

function lockPath(logDir = catalogLogDir()): string {
  return path.join(logDir, CATALOG_JOB_LOCK);
}

function processIsRunning(pid: number | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * parentPid is the long-lived Next.js server, so it stays alive after a job
 * exits. Only the spawned child (or a brief window before its pid is written)
 * means a job is actually running.
 */
function lockIsHeld(existing: Partial<CatalogJobLock>): boolean {
  if (existing.childPid) return processIsRunning(existing.childPid);
  if (!processIsRunning(existing.parentPid)) return false;
  const started = Date.parse(existing.startedAt ?? "");
  if (!Number.isFinite(started)) return false;
  return Date.now() - started < STARTING_WINDOW_MS;
}

function resolveLogFile(
  logDir: string,
  lock: Partial<CatalogJobLock>,
  kind: CatalogJobKind,
): string {
  if (lock.logFile && LOG_RE.test(lock.logFile)) return lock.logFile;

  let names: string[] = [];
  try {
    names = fs.readdirSync(logDir);
  } catch {
    return "";
  }

  const started = Date.parse(lock.startedAt ?? "");
  let best: { name: string; delta: number } | null = null;
  for (const name of names) {
    const match = name.match(LOG_RE);
    if (!match || match[1] !== kind) continue;
    const ts = Number(match[2]);
    if (!Number.isFinite(ts)) continue;
    const delta = Number.isFinite(started) ? Math.abs(ts - started) : 0;
    if (Number.isFinite(started) && delta > LOG_MATCH_WINDOW_MS) continue;
    if (!best || delta < best.delta) best = { name, delta };
  }
  return best?.name ?? "";
}

/** True when the job log was written recently, even if the pid check is wrong. */
function logIsFresh(logDir: string, existing: Partial<CatalogJobLock>): boolean {
  const kind: CatalogJobKind | null =
    existing.kind === "classify" || existing.kind === "ingest"
      ? existing.kind
      : null;
  if (!kind) return false;
  const logFile = resolveLogFile(logDir, existing, kind);
  if (!logFile) return false;
  try {
    const modified = fs.statSync(path.join(logDir, logFile)).mtimeMs;
    return Date.now() - modified < 3 * 60 * 1000;
  } catch {
    return false;
  }
}

function jobIsActive(logDir: string, existing: Partial<CatalogJobLock>): boolean {
  return lockIsHeld(existing) || logIsFresh(logDir, existing);
}

function readLock(logDir: string): Partial<CatalogJobLock> | null {
  try {
    return JSON.parse(
      fs.readFileSync(lockPath(logDir), "utf8"),
    ) as Partial<CatalogJobLock>;
  } catch {
    return null;
  }
}

export function acquireCatalogJobLock(
  logDir: string,
  kind: CatalogJobKind,
): string | null {
  const file = lockPath(logDir);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, "wx");
      const lock: CatalogJobLock = {
        kind,
        parentPid: process.pid,
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(fd, JSON.stringify(lock), "utf8");
      fs.closeSync(fd);
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const existing = readLock(logDir);
      if (existing && jobIsActive(logDir, existing)) return null;

      try {
        fs.unlinkSync(file);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function updateCatalogJobLock(
  lockFile: string,
  fields: {
    kind: CatalogJobKind;
    childPid?: number;
    logFile?: string;
    dir?: string;
    type?: string;
  },
): void {
  let startedAt = new Date().toISOString();
  let previous: Partial<CatalogJobLock> | null = null;
  try {
    previous = JSON.parse(fs.readFileSync(lockFile, "utf8")) as Partial<CatalogJobLock>;
    if (previous.startedAt) startedAt = previous.startedAt;
  } catch {
    // A missing lock body still gets replaced with the live job metadata.
  }
  const lock: CatalogJobLock = {
    kind: fields.kind,
    parentPid: process.pid,
    childPid: fields.childPid ?? previous?.childPid,
    startedAt,
    logFile: fields.logFile ?? previous?.logFile,
    dir: fields.dir ?? previous?.dir,
    type: fields.type ?? previous?.type,
  };
  fs.writeFileSync(lockFile, JSON.stringify(lock), "utf8");
}

export function releaseCatalogJobLock(lockFile: string): void {
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // Already removed or unavailable; a stale lock is recovered next start.
  }
}

function readHead(abs: string): string {
  let fd: number | null = null;
  try {
    fd = fs.openSync(abs, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore a close failure after a short header read.
      }
    }
  }
}

function parseHeader(text: string, kind: CatalogJobKind): { dir: string; type: string } {
  const dir = text.match(/Found \d+ product folder\(s\) in (.+)/)?.[1]?.trim() ?? "";
  if (kind === "classify") {
    const apply = /Mode:\s+APPLY/.test(text);
    return { dir, type: apply ? "apply" : "dry-run" };
  }
  if (/Product type:\s+AI auto-detect/.test(text)) return { dir, type: "auto" };
  const typed = text.match(/Product type:\s+.+\(([^)]+)\)/);
  return { dir, type: typed?.[1]?.trim() || "auto" };
}

/** The job currently holding the catalog lock, or null if the lock is free or stale. */
export function getActiveCatalogJob(): ActiveCatalogJob | null {
  const logDir = catalogLogDir();
  const file = lockPath(logDir);
  if (!fs.existsSync(file)) return null;

  const existing = readLock(logDir);
  if (!existing) return null;
  if (!jobIsActive(logDir, existing)) {
    releaseCatalogJobLock(file);
    return null;
  }

  const kind: CatalogJobKind | null =
    existing.kind === "classify" || existing.kind === "ingest"
      ? existing.kind
      : null;
  if (!kind) return null;

  const startedAt =
    existing.startedAt ?? fs.statSync(file).mtime.toISOString();
  const logFile = resolveLogFile(logDir, { ...existing, startedAt }, kind);
  const header = logFile
    ? parseHeader(readHead(path.join(logDir, logFile)), kind)
    : { dir: "", type: "" };

  return {
    kind,
    logFile,
    dir: existing.dir || header.dir,
    type:
      existing.type ||
      header.type ||
      (kind === "classify" ? "dry-run" : "auto"),
    startedAt,
    running: true,
  };
}

function readTail(abs: string): string {
  let fd: number | null = null;
  try {
    const size = fs.statSync(abs).size;
    const len = Math.min(4096, size);
    fd = fs.openSync(abs, "r");
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, Math.max(0, size - len));
    return buf.toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore a close failure after a short tail read.
      }
    }
  }
}

function logIsSettled(text: string): boolean {
  return (
    /Done\.\s+Created:/.test(text) ||
    /\[process exited/.test(text) ||
    /\[spawn error\]/.test(text)
  );
}

/**
 * The running job, or the newest finished run from the last half hour so a
 * refresh still shows the summary after the lock is released.
 */
export function getDisplayedCatalogJob(): ActiveCatalogJob | null {
  const active = getActiveCatalogJob();
  if (active) return active;

  const logDir = catalogLogDir();
  let names: string[] = [];
  try {
    names = fs.readdirSync(logDir);
  } catch {
    return null;
  }

  let best: { name: string; mtimeMs: number } | null = null;
  for (const name of names) {
    if (!LOG_RE.test(name)) continue;
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(path.join(logDir, name)).mtimeMs;
    } catch {
      continue;
    }
    if (Date.now() - mtimeMs > RECENT_FINISHED_MS) continue;
    if (!best || mtimeMs > best.mtimeMs) best = { name, mtimeMs };
  }
  if (!best) return null;

  const abs = path.join(logDir, best.name);
  if (!logIsSettled(readTail(abs))) return null;

  const kind: CatalogJobKind = best.name.startsWith("classify-")
    ? "classify"
    : "ingest";
  const header = parseHeader(readHead(abs), kind);
  const ts = Number(best.name.match(LOG_RE)?.[2]);
  return {
    kind,
    logFile: best.name,
    dir: header.dir,
    type: header.type || (kind === "classify" ? "dry-run" : "auto"),
    startedAt: Number.isFinite(ts)
      ? new Date(ts).toISOString()
      : new Date(best.mtimeMs).toISOString(),
    running: false,
  };
}
