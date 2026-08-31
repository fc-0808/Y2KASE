/**
 * scripts/classify-folders.ts
 *
 * Receiving-dock pipeline: a messy dump of supplier product folders
 * (QQ / WeChat downloads) → classified, sidecared, and filed into the catalog
 * tree. Does NOT ingest — no R2, no Neon, no copy generation. Review the
 * resulting tree, then `npm run build:catalog`.
 *
 *   npm run catalog:classify -- --dir "D:\QQ-Downloads\供应商"
 *   npm run catalog:classify:apply -- --dir "D:\QQ-Downloads\供应商"
 *
 * Defaults: dir = LOCAL_CATALOG_ROOT, dest = same as dir (in-place filing).
 * Dry-run unless `--apply` (or CLASSIFY_APPLY=true).
 *
 * Per folder:
 *   1. Sample photos, run one Qwen 3.8 vision pass (product vs junk, type, IP)
 *   2. Plan a destination (Sanrio/…, AirPods/…, Others/, _review/, _rejected/)
 *   3. On --apply: write listing.json (productType + collections) and move
 *
 * Idempotent: matching image hashes + already at the planned path → skip.
 * Resumable: re-running with --apply continues where a previous run stopped.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { classifyIncomingFolder, visionModelName } from "../src/lib/ai";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import {
  inspectProductFolders,
  sampleEvenly,
} from "../src/lib/catalog/discover";
import {
  REJECTED_FOLDER,
  buildClassificationRecord,
  hashesMatch,
  isUnchangedClassification,
  mergeClassificationIntoListing,
  parseClassificationRecord,
  planFolderSort,
  type FolderSortPlan,
  type IncomingFolderVerdict,
} from "../src/lib/catalog/folder-sort";

const MAX_CLASSIFY_IMAGES = 4;
const WEBP_WIDTH = 1024;
const WEBP_QUALITY = 75;

function requireAnyEnv(...names: string[]): string {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  throw new Error(`Missing required env var: one of ${names.join(" / ")}`);
}

function parseArgs(): {
  dir: string;
  dest: string;
  apply: boolean;
  includeRejected: boolean;
} {
  const args = process.argv.slice(2);
  let dir =
    process.env.CLASSIFY_DIR ??
    process.env.LOCAL_CATALOG_ROOT ??
    "./bestListings";
  let dest = process.env.CLASSIFY_DEST ?? "";
  let apply =
    process.env.CLASSIFY_APPLY === "true" ||
    process.env.CLASSIFY_APPLY === "1";
  let includeRejected = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "--dir" || a === "--from") && args[i + 1]) dir = args[++i];
    else if ((a === "--dest" || a === "--to") && args[i + 1]) dest = args[++i];
    else if (a === "--apply") apply = true;
    else if (a === "--dry-run") apply = false;
    else if (a === "--include-rejected") includeRejected = true;
    else if (!a.startsWith("--")) dir = a;
  }

  if (!dest) dest = process.env.LOCAL_CATALOG_ROOT ?? dir;
  return { dir, dest, apply, includeRejected };
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function imageHashes(files: string[]): string[] {
  return files.map((file) => sha256(fs.readFileSync(file)));
}

function readListingObject(absFolder: string): Record<string, unknown> | null {
  for (const name of ["listing.json", "product.json"] as const) {
    try {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(path.join(absFolder, name), "utf8"),
      );
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* missing or unreadable — try the next name */
    }
  }
  return null;
}

function writeListing(absFolder: string, obj: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(absFolder, "listing.json"),
    `${JSON.stringify(obj, null, 2)}\n`,
    "utf8",
  );
}

function relFromRoot(absFolder: string, root: string): string {
  const rel = path.relative(root, absFolder);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "";
  return rel.replace(/\\/g, "/");
}

function existingLeavesIn(destRoot: string, category: string): Set<string> {
  const dir = path.join(destRoot, category);
  try {
    return new Set(
      fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name.toLowerCase()),
    );
  } catch {
    return new Set();
  }
}

function moveDir(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") throw err;
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}

async function framesFor(files: string[]): Promise<string[]> {
  const sampled = sampleEvenly(files, MAX_CLASSIFY_IMAGES);
  const urls: string[] = [];
  for (const file of sampled) {
    try {
      const buffer = await sharp(file)
        .rotate()
        .resize({ width: WEBP_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      urls.push(`data:image/webp;base64,${buffer.toString("base64")}`);
    } catch {
      /* unreadable frame (truncated QQ download) — skip it */
    }
  }
  return urls;
}

type Classified = {
  absPath: string;
  folderPath: string;
  sourceLeaf: string;
  hashes: string[];
  verdict: IncomingFolderVerdict;
  plan: FolderSortPlan;
  skipped: boolean;
  skipReason?: string;
};

async function main() {
  requireAnyEnv("VISION_API_KEY", "OPENAI_API_KEY");

  const { dir, dest, apply, includeRejected } = parseArgs();
  const resolvedDir = path.resolve(dir);
  const resolvedDest = path.resolve(dest);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${resolvedDir}`);
  }
  fs.mkdirSync(resolvedDest, { recursive: true });

  const discovery = inspectProductFolders(resolvedDir);
  if (discovery.unreadableDirectories.length > 0) {
    throw new Error(
      `Cannot safely scan ${resolvedDir}; ${discovery.unreadableDirectories.length} director${
        discovery.unreadableDirectories.length === 1 ? "y is" : "ies are"
      } unreadable: ${discovery.unreadableDirectories.slice(0, 5).join(", ")}`,
    );
  }
  const discovered = discovery.folders.filter((folder) => {
    if (includeRejected) return true;
    const top = folder.folderPath.split("/")[0];
    return top !== REJECTED_FOLDER;
  });
  if (discovered.length === 0 && discovery.ignoredImageCount > 0) {
    throw new Error(
      `No product galleries found. The only ${discovery.ignoredImageCount} image(s) are inside internal _originals/_removed folders. Select the parent output folder after variant generation has completed.`,
    );
  }
  if (discovered.length === 0) {
    throw new Error(
      `No product galleries found in ${resolvedDir}. A completed product folder must contain at least one JPG, PNG, WebP, or GIF directly inside it.`,
    );
  }

  const concurrency = Math.max(
    1,
    Number(process.env.CLASSIFY_CONCURRENCY ?? process.env.INGEST_CONCURRENCY) ||
      3,
  );
  const model = visionModelName();

  console.log(
    `\nFound ${discovered.length} product folder(s) in ${resolvedDir}\n` +
      `Destination: ${resolvedDest}\n` +
      `Model: ${model}\n` +
      `Mode: ${apply ? "APPLY (will move folders)" : "dry-run (pass --apply to move)"}\n` +
      `Concurrency: ${concurrency}\n` +
      (discovery.ignoredMediaDirectories.length > 0
        ? `Excluded ${discovery.ignoredMediaDirectories.length} internal _originals/_removed folder(s) (${discovery.ignoredImageCount} non-gallery image(s)).\n`
        : ""),
  );

  let filed = 0;
  let review = 0;
  let rejected = 0;
  let skipped = 0;
  let failed = 0;

  const classified = await mapWithConcurrency(
    discovered,
    concurrency,
    async (folder, i): Promise<Classified> => {
      const label = `[${i + 1}/${discovered.length}] ${folder.folderPath}`;
      const hashes = imageHashes(folder.imageFiles);
      const sourceLeaf = path.basename(folder.absPath);
      const currentRel = relFromRoot(folder.absPath, resolvedDest);
      const existing = readListingObject(folder.absPath);
      const previous = parseClassificationRecord(existing?._classification);

      console.log(`\n${label} — classify`);

      // Same photos as last time: reuse the sidecar and skip the paid vision
      // call. If the folder has since been moved (or never was), the apply
      // phase still files it using this verdict.
      if (previous && hashesMatch(previous.imageHashes, hashes)) {
        const stubVerdict: IncomingFolderVerdict = {
          isProduct: previous.isProduct,
          rejectReason: previous.rejectReason,
          productTypeId: previous.productType,
          brand: {
            brand: previous.brand,
            character: previous.character,
            brandId: previous.brandId,
            characterId: previous.characterId,
            confidence: previous.confidence,
            evidence: previous.evidence,
          },
          confidence: previous.confidence,
          evidence: previous.evidence,
          failed: false,
        };
        const plan = planFolderSort({
          verdict: stubVerdict,
          sourceLeaf,
        });
        if (
          isUnchangedClassification(
            previous,
            hashes,
            currentRel,
            plan.destRelative,
          )
        ) {
          console.log(`  skipped (already classified → ${currentRel})`);
          return {
            absPath: folder.absPath,
            folderPath: folder.folderPath,
            sourceLeaf,
            hashes,
            verdict: stubVerdict,
            plan,
            skipped: true,
            skipReason: "already classified",
          };
        }
        console.log(
          `  reused sidecar → ${plan.action} ${plan.destRelative} (no vision call)`,
        );
        return {
          absPath: folder.absPath,
          folderPath: folder.folderPath,
          sourceLeaf,
          hashes,
          verdict: stubVerdict,
          plan,
          skipped: false,
        };
      }

      const frames = await framesFor(folder.imageFiles);
      const verdict = await classifyIncomingFolder(
        frames,
        `${folder.folderPath} ${folder.categoryHint}`,
        (m) => console.log(`  ${m}`),
      );
      const plan = planFolderSort({ verdict, sourceLeaf });
      console.log(`  → ${plan.action} ${plan.destRelative}`);
      console.log(`    ${plan.reason}`);
      return {
        absPath: folder.absPath,
        folderPath: folder.folderPath,
        sourceLeaf,
        hashes,
        verdict,
        plan,
        skipped: false,
      };
    },
  );

  // Put-away is serial so two "1" folders cannot land on the same dest name.
  const occupied = new Map<string, Set<string>>();
  const leavesOf = (category: string, selfAbs: string): Set<string> => {
    let set = occupied.get(category);
    if (!set) {
      set = existingLeavesIn(resolvedDest, category);
      occupied.set(category, set);
    }
    // A folder already living in this category must not collide with itself.
    const rel = relFromRoot(selfAbs, resolvedDest);
    if (rel.split("/")[0] === category) {
      const next = new Set(set);
      next.delete(path.basename(selfAbs).toLowerCase());
      return next;
    }
    return set;
  };

  for (const [applyIndex, item] of classified.entries()) {
    if (item.skipped) {
      skipped++;
      continue;
    }

    const plan = planFolderSort({
      verdict: item.verdict,
      sourceLeaf: item.sourceLeaf,
      existingLeaves: leavesOf(item.plan.destCategory, item.absPath),
    });

    console.log(
      `\n[apply ${applyIndex + 1}/${classified.length}] ${item.folderPath} — ${plan.action}`,
    );

    if (plan.action === "file") filed++;
    else if (plan.action === "review") review++;
    else rejected++;

    if (!apply) {
      console.log(
        `  · dry-run ${plan.action} → ${plan.destRelative} (pass --apply to move)`,
      );
      continue;
    }

    try {
      const listing = mergeClassificationIntoListing(
        readListingObject(item.absPath),
        plan,
        buildClassificationRecord({
          model,
          plan,
          verdict: item.verdict,
          imageHashes: item.hashes,
        }),
      );
      writeListing(item.absPath, listing);

      const destAbs = path.join(resolvedDest, ...plan.destRelative.split("/"));
      const alreadyThere =
        path.resolve(item.absPath) === path.resolve(destAbs);

      if (!alreadyThere) {
        if (fs.existsSync(destAbs)) {
          throw new Error(`destination already exists: ${destAbs}`);
        }
        moveDir(item.absPath, destAbs);
        occupied.get(plan.destCategory)?.add(
          path.basename(destAbs).toLowerCase(),
        );
      }

      console.log(`  ✓ ${plan.action} → ${plan.destRelative}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ FAILED: ${msg}`);
      failed++;
      if (plan.action === "file") filed--;
      else if (plan.action === "review") review--;
      else rejected--;
    }
  }

  const reportDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    dir: resolvedDir,
    dest: resolvedDest,
    apply,
    model,
    filed,
    review,
    rejected,
    skipped,
    failed,
    folders: classified
      .filter((c) => !c.skipped)
      .map((c) => ({
        from: c.folderPath,
        action: c.plan.action,
        dest: c.plan.destRelative,
        type: c.plan.productTypeId,
        brand: c.verdict.brand.brand,
        character: c.verdict.brand.character,
        confidence: c.verdict.confidence,
        reason: c.plan.reason,
      })),
  };
  fs.writeFileSync(
    path.join(reportDir, "classify-last.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Done.  Created: ${filed}  Skipped: ${skipped}  Failed: ${failed}
  Filed: ${filed}  Review: ${review}  Rejected: ${rejected}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${
  apply
    ? `  Review _review/ then ingest with:\n  npm run build:catalog -- --dir "${resolvedDest}" --type auto\n`
    : `  Dry-run only. Re-run with --apply to write listing.json and move folders.\n`
}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
