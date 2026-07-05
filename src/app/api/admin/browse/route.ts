/**
 * GET /api/admin/browse?path=<abs>&inspect=1
 *
 * Server-side folder picker for the ingest UI. Lists the immediate
 * subdirectories of a path on the machine running the app, so an admin can
 * browse to a catalog folder instead of typing its path. With `inspect=1` it
 * also reports how many product folders / images the pipeline would discover
 * there, giving a confidence preview before ingesting.
 *
 * Local-only by design (mirrors the ingest itself): disabled on Vercel, where
 * there is no persistent local filesystem to browse. Admin-gated.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { discoverProductFolders } from "@/lib/catalog/discover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = { name: string; path: string };

/** Available Windows drive roots (C:\, D:\ …); ["/"] elsewhere. */
function rootEntries(): Entry[] {
  if (process.platform !== "win32") return [{ name: "/", path: "/" }];
  const drives: Entry[] = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try {
      if (fs.existsSync(root)) drives.push({ name: root, path: root });
    } catch {
      /* not present */
    }
  }
  return drives.length > 0 ? drives : [{ name: "C:\\", path: "C:\\" }];
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "Folder browsing is only available when running locally." },
      { status: 400 },
    );
  }

  const pathParam = req.nextUrl.searchParams.get("path");
  const inspect = req.nextUrl.searchParams.get("inspect") === "1";

  // No path → show drive roots (the starting point of the tree).
  if (!pathParam) {
    return NextResponse.json({
      path: null,
      parent: null,
      entries: rootEntries(),
    });
  }

  const abs = path.resolve(pathParam);
  let entries: Entry[];
  try {
    entries = fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: path.join(abs, e.name) }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
  } catch {
    return NextResponse.json(
      { error: `Can't read folder: ${abs}` },
      { status: 403 },
    );
  }

  const parent = path.dirname(abs);
  const result: {
    path: string;
    parent: string | null;
    entries: Entry[];
    summary?: { productFolders: number; imageCount: number };
  } = {
    path: abs,
    parent: parent !== abs ? parent : null,
    entries,
  };

  if (inspect) {
    try {
      const folders = discoverProductFolders(abs);
      result.summary = {
        productFolders: folders.length,
        imageCount: folders.reduce((n, f) => n + f.imageFiles.length, 0),
      };
    } catch {
      result.summary = { productFolders: 0, imageCount: 0 };
    }
  }

  return NextResponse.json(result);
}
