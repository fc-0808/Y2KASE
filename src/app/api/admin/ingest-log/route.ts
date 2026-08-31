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

const FILE_RE = /^(ingest|classify)-\d+\.log$/;

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
  let skipped = count(text, /skipped \(already (?:pushed|classified)/g);
  let failed = count(text, /✗ FAILED/g);
  let duplicates = count(text, /⚠ possible dup of #/g);
  let autoTyped = count(text, /· ai\]/g);
  let review = 0;
  let rejected = 0;

  const isClassify = file.startsWith("classify-");
  const isClassifyApply = isClassify && /Mode:\s+APPLY/.test(text);
  if (isClassify) {
    created = count(text, isClassifyApply ? /✓ file →/g : /→ file /g);
    review = count(text, isClassifyApply ? /✓ review →/g : /→ review /g);
    rejected = count(text, isClassifyApply ? /✓ reject →/g : /→ reject /g);
  }

  // Current item: the last "[i/N] label — …" header line.
  const headerRe = /\[(\d+)\/(\d+)\]\s+(.+?)\s+—/g;
  let m: RegExpExecArray | null;
  let classificationIndex = 0;
  let current = "";
  while ((m = headerRe.exec(text)) !== null) {
    classificationIndex = Number(m[1]);
    current = m[3].trim();
    if (!total) total = Number(m[2]);
  }
  let applyIndex = 0;
  if (isClassifyApply) {
    const applyHeaderRe = /\[apply (\d+)\/(\d+)\]\s+(.+?)\s+—/g;
    while ((m = applyHeaderRe.exec(text)) !== null) {
      applyIndex = Number(m[1]);
      current = m[3].trim();
      if (!total) total = Number(m[2]);
    }
  }
  const currentIndex = applyIndex || classificationIndex;

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
  const filedSummary = text.match(/Filed:\s+(\d+)\s+Review:\s+(\d+)\s+Rejected:\s+(\d+)/);
  if (filedSummary) {
    created = Number(filedSummary[1]);
    review = Number(filedSummary[2]);
    rejected = Number(filedSummary[3]);
  }

  // Detect a fatal crash. Most script errors include a JS stack, while shell
  // startup failures and non-zero exits use the sentinels written by the
  // parent action. Per-product "✗ FAILED" lines are recoverable and do not
  // count as a crashed run.
  const spawnError = text.match(/\[spawn error\]\s*(.+)$/m);
  const processExit = text.match(
    /\[process exited (with code \S+|after signal \S+)\]/,
  );
  const crashed =
    !done &&
    (/\n\s{2,}at\s+\S/.test(text) ||
      spawnError !== null ||
      processExit !== null);
  let errorMessage: string | undefined;
  if (crashed) {
    const em =
      text.match(/^\s*([A-Za-z]*Error:.*)$/m) ??
      text.match(/^(.*constraint failed.*)$/im);
    errorMessage =
      spawnError?.[1]?.trim() ??
      (em
        ? em[1].trim()
        : processExit
          ? `The background process exited ${processExit[1]}.`
          : `${isClassify ? "Classification" : "Ingest"} stopped unexpectedly — see the log above.`);
  }

  const processed = isClassify
    ? done
      ? created + skipped + failed + review + rejected
      : Math.max(created + skipped + failed + review + rejected, currentIndex)
    : created + skipped + failed;
  const progressTotal =
    isClassifyApply && !done ? total * 2 : total;
  const progressProcessed =
    isClassifyApply && !done
      ? applyIndex > 0
        ? total + applyIndex
        : classificationIndex
      : processed;
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
    progressTotal,
    progressProcessed,
    phase: applyIndex > 0 ? "apply" : isClassify ? "classify" : "ingest",
    created,
    skipped,
    failed,
    duplicates,
    autoTyped,
    review,
    rejected,
    currentIndex,
    current,
    tail,
  });
}
