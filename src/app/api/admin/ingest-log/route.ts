/**
 * GET /api/admin/ingest-log?file=ingest-<ts>.log
 *
 * Reads a background ingest's progress log (written by build-catalog.ts to
 * ./data) and returns a parsed, structured snapshot for the live progress UI:
 * totals, per-state counts, the item currently being processed, a tail of the
 * raw log, and whether the run has finished.
 *
 * Admin-gated and local-only (the logs live on the machine running the ingest).
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_RE = /^ingest-\d+\.log$/;

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!FILE_RE.test(file)) {
    return NextResponse.json({ error: "Invalid log file." }, { status: 400 });
  }

  const abs = path.join(process.cwd(), "data", file);
  let text: string;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    // Process may not have written anything yet — treat as "starting".
    return NextResponse.json({ exists: false, done: false, tail: [] });
  }

  const totalMatch = text.match(/Found (\d+) product folder/);
  let total = totalMatch ? Number(totalMatch[1]) : 0;

  let created = count(text, /✓ #/g);
  let skipped = count(text, /skipped \(already pushed\)/g);
  let failed = count(text, /✗ FAILED/g);
  let duplicates = count(text, /⚠ possible dup of #/g);
  let autoTyped = count(text, /· ai\]/g);

  // Current item: the last "[i/N] label — …" header line.
  const headerRe = /\[(\d+)\/(\d+)\]\s+(.+?)\s+—/g;
  let m: RegExpExecArray | null;
  let currentIndex = 0;
  let current = "";
  while ((m = headerRe.exec(text)) !== null) {
    currentIndex = Number(m[1]);
    current = m[3].trim();
    if (!total) total = Number(m[2]);
  }

  // Final summary wins for authoritative counts when the run has completed.
  const done = /Done\.\s+Created:/.test(text);
  const summary = text.match(
    /Done\.\s+Created:\s+(\d+)\s+Skipped:\s+(\d+)\s+Failed:\s+(\d+)/,
  );
  if (summary) {
    created = Number(summary[1]);
    skipped = Number(summary[2]);
    failed = Number(summary[3]);
  }
  const dupSummary = text.match(/Possible duplicates:\s+(\d+)/);
  if (dupSummary) duplicates = Number(dupSummary[1]);
  const autoSummary = text.match(/AI-typed:\s+(\d+)/);
  if (autoSummary) autoTyped = Number(autoSummary[1]);

  // Detect a fatal crash: an uncaught error prints a JS stack trace and the run
  // never reaches "Done." (per-product failures are logged as "✗ FAILED" and
  // don't crash the process). When crashed, surface the error line so the UI
  // can stop polling and show it instead of spinning forever.
  const crashed = !done && /\n\s{2,}at\s+\S/.test(text);
  let errorMessage: string | undefined;
  if (crashed) {
    const em =
      text.match(/^\s*([A-Za-z]*Error:.*)$/m) ??
      text.match(/^(.*constraint failed.*)$/im);
    errorMessage = em
      ? em[1].trim()
      : "The ingest process stopped unexpectedly — see the log above.";
  }

  const processed = created + skipped + failed;
  const tail = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0)
    .slice(-16);

  return NextResponse.json({
    exists: true,
    done,
    crashed,
    errorMessage,
    total,
    processed,
    created,
    skipped,
    failed,
    duplicates,
    autoTyped,
    currentIndex,
    current,
    tail,
  });
}
