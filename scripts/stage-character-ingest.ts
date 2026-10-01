/**
 * Stage the Miffy + Sanrio character folders the operator asked to upload,
 * after dropping listings that are already in the catalogue or repeated
 * inside the batch (same supplier name, same image bytes, or the same
 * primary photo).
 *
 *   npx tsx scripts/stage-character-ingest.ts
 *
 * Prints the staging directory. Ingest that directory with:
 *   npm run build:catalog -- --dir "<staging>" --type auto --skip-duplicates
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { inspectProductFolders } from "../src/lib/catalog/discover";
import { classifyBrandContext } from "../src/lib/catalog/brands";
import { fingerprintFromBuffer, isNearDuplicate } from "../src/lib/catalog/phash";
import {
  loadDuplicateIndex,
  nearestInIndex,
} from "../src/lib/catalog/duplicates";
import { db } from "../src/lib/db";
import { products } from "../src/lib/db/schema";

const ROOTS: { character: string; dir: string }[] = [
  {
    character: "Miffy",
    dir: "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\Miffy",
  },
  {
    character: "Cinnamoroll",
    dir: "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\Sanrio\\Cinnamoroll",
  },
  {
    character: "Hello Kitty",
    dir: "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\Sanrio\\Hello Kitty",
  },
  {
    character: "My Melody",
    dir: "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\Sanrio\\My Melody",
  },
  {
    character: "Pochacco",
    dir: "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\Sanrio\\Pochacco",
  },
  {
    character: "Pompompurin",
    dir: "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\Sanrio\\Pompompurin",
  },
];

const STAGING = path.join(os.tmpdir(), "y2kase-character-ingest");
const WEBP_MAX_WIDTH = 1200;
const WEBP_QUALITY = 82;

type Candidate = {
  character: string;
  absPath: string;
  folderName: string;
  imageFiles: string[];
  videoFiles: string[];
  key: string;
  suffix: string;
};

function norm(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function suffixOf(folderName: string): string {
  const parts = folderName.split("__");
  return (parts[parts.length - 1] ?? folderName).replace(/\s+/g, " ").trim();
}

function isBareNumber(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/**
 * Supplier dumps repeat one design under several shop prefixes, and the
 * shared tail is the listing name. A bare number such as "6" is not a name:
 * other brands were ingested from folders called "6", and matching on it
 * would treat a Miffy folder as a Stitch case.
 */
function listingKey(character: string, folderName: string): string {
  if (isBareNumber(folderName)) return `${character}/${folderName}`;
  const suffix = suffixOf(folderName);
  if (isBareNumber(suffix)) return `${character}/${norm(folderName)}`;
  return `${character}/${norm(suffix)}`;
}

function alreadyInCatalog(c: Candidate, sourceKeys: Set<string>): boolean {
  if (isBareNumber(c.folderName)) {
    return sourceKeys.has(norm(`${c.character}/${c.folderName}`));
  }
  if (isBareNumber(c.suffix)) return false;
  return sourceKeys.has(norm(c.suffix));
}

function fileHash(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const h of small) if (large.has(h)) n += 1;
  return n;
}

function sameGallery(a: Set<string>, b: Set<string>): boolean {
  const shared = sharedCount(a, b);
  const smaller = Math.min(a.size, b.size);
  if (smaller === 0) return false;
  return shared >= 4 || (shared >= 3 && shared / smaller >= 0.5);
}

async function primaryFingerprint(file: string): Promise<string | null> {
  const buf = await sharp(file)
    .resize({ width: WEBP_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return fingerprintFromBuffer(buf);
}

function prefer(a: Candidate, b: Candidate): Candidate {
  if (a.imageFiles.length !== b.imageFiles.length) {
    return a.imageFiles.length > b.imageFiles.length ? a : b;
  }
  return a.absPath.length <= b.absPath.length ? a : b;
}

async function main() {
  const live = await db.query.products.findMany({
    columns: { id: true, sourceFolder: true, title: true },
  });
  const sourceKeys = new Set(
    live
      .map((p) => p.sourceFolder)
      .filter((s): s is string => Boolean(s))
      .map(norm),
  );

  const candidates: Candidate[] = [];
  for (const root of ROOTS) {
    const report = inspectProductFolders(root.dir);
    if (report.unreadableDirectories.length > 0) {
      throw new Error(
        `Unreadable directories under ${root.dir}: ${report.unreadableDirectories.join(", ")}`,
      );
    }
    for (const folder of report.folders) {
      const folderName = path.basename(folder.absPath);
      candidates.push({
        character: root.character,
        absPath: folder.absPath,
        folderName,
        imageFiles: folder.imageFiles,
        videoFiles: folder.videoFiles,
        key: listingKey(root.character, folderName),
        suffix: /^\d+$/.test(folderName) ? folderName : suffixOf(folderName),
      });
    }
  }

  const pochaccoDir =
    "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\Sanrio\\Pochacco";
  const pochaccoArchive =
    "C:\\Users\\w088s\\OneDrive\\Documents\\E-Commerce\\Etsy\\Listings\\History\\_Unassigned\\0501_normalListings\\48";
  if (
    inspectProductFolders(pochaccoDir).folders.length === 0 &&
    fs.existsSync(pochaccoArchive)
  ) {
    const archived = inspectProductFolders(pochaccoArchive);
    const folder = archived.folders[0];
    if (folder) {
      candidates.push({
        character: "Pochacco",
        absPath: folder.absPath,
        folderName: "48",
        imageFiles: folder.imageFiles,
        videoFiles: folder.videoFiles,
        key: "Pochacco/48",
        suffix: "48",
      });
      console.log(
        "Pochacco folder is empty; using the archived listing History/_Unassigned/0501_normalListings/48",
      );
    }
  }

  const byKey = new Map<string, Candidate>();
  const skippedName: string[] = [];
  for (const c of candidates) {
    if (alreadyInCatalog(c, sourceKeys)) {
      skippedName.push(`${c.character} / ${c.folderName} — already listed`);
      continue;
    }
    const prev = byKey.get(c.key);
    byKey.set(c.key, prev ? prefer(prev, c) : c);
  }
  for (const c of candidates) {
    const kept = byKey.get(c.key);
    if (
      kept &&
      kept.absPath !== c.absPath &&
      !alreadyInCatalog(c, sourceKeys)
    ) {
      skippedName.push(
        `${c.character} / ${c.folderName} — same listing as ${path.basename(kept.absPath)}`,
      );
    }
  }

  let pool = [...byKey.values()];

  const hashes = new Map<string, Set<string>>();
  for (const c of pool) {
    hashes.set(c.absPath, new Set(c.imageFiles.map(fileHash)));
  }
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const unite = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (sameGallery(hashes.get(a.absPath)!, hashes.get(b.absPath)!)) {
        unite(a.absPath, b.absPath);
      }
    }
  }
  const galleries = new Map<string, Candidate>();
  const skippedBytes: string[] = [];
  for (const c of pool) {
    const root = find(c.absPath);
    const prev = galleries.get(root);
    if (!prev) {
      galleries.set(root, c);
      continue;
    }
    const winner = prefer(prev, c);
    galleries.set(root, winner);
    const loser = winner === c ? prev : c;
    skippedBytes.push(
      `${loser.character} / ${loser.folderName} — same photos as ${winner.folderName}`,
    );
  }
  pool = [...galleries.values()];

  const index = await loadDuplicateIndex();
  const skippedVisual: string[] = [];
  const fingerprinted: { candidate: Candidate; phash: string }[] = [];
  for (const c of pool) {
    const primary = c.imageFiles[0];
    const phash = primary ? await primaryFingerprint(primary) : null;
    if (!phash) {
      fingerprinted.push({ candidate: c, phash: "" });
      continue;
    }
    const brand = classifyBrandContext([c.character, c.folderName, c.absPath]);
    const hit = nearestInIndex(index, {
      phash,
      title: c.suffix,
      brandName: brand.brand,
      characterName: brand.character ?? c.character,
    });
    if (hit) {
      skippedVisual.push(
        `${c.character} / ${c.folderName} — matches #${hit.id} ${hit.title} (${hit.confidence})`,
      );
      continue;
    }
    fingerprinted.push({ candidate: c, phash });
  }

  const kept: Candidate[] = [];
  const skippedBatchVisual: string[] = [];
  for (const item of fingerprinted) {
    const twin = kept.find(
      (k) =>
        item.phash &&
        fingerprinted.find((f) => f.candidate === k)?.phash &&
        isNearDuplicate(
          item.phash,
          fingerprinted.find((f) => f.candidate === k)!.phash,
        ),
    );
    if (twin) {
      skippedBatchVisual.push(
        `${item.candidate.character} / ${item.candidate.folderName} — same primary photo as ${twin.folderName}`,
      );
      continue;
    }
    kept.push(item.candidate);
  }

  const catalogPath = path.resolve(
    process.env.CATALOG_DB_PATH ?? "./data/catalog.db",
  );
  const catalog = fs.existsSync(catalogPath)
    ? new Database(catalogPath)
    : null;
  const historical = catalog
    ? (catalog.prepare("SELECT folder_path, status, neon_id FROM catalog_products").all() as {
        folder_path: string;
        status: string;
        neon_id: number | null;
      }[])
    : [];

  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });

  const staged: { rel: string; from: string; candidate: Candidate }[] = [];
  for (const c of kept) {
    const wanted = isBareNumber(c.folderName)
      ? `${c.character}/${c.folderName}`
      : isBareNumber(c.suffix)
        ? `${c.character}/${c.folderName}`
        : c.suffix;
    const prior = historical.find((h) => norm(h.folder_path) === norm(wanted));
    let rel = prior?.folder_path ?? wanted;
    rel = rel.replace(/[<>:"|?*]/g, "_");
    if (prior?.status === "pushed" && prior.neon_id != null) {
      const row = await db.query.products.findFirst({
        where: eq(products.id, prior.neon_id),
        columns: { id: true },
      });
      if (!row) {
        catalog
          ?.prepare("DELETE FROM catalog_products WHERE folder_path = ?")
          .run(prior.folder_path);
        console.log(
          `cleared stale catalog row ${prior.folder_path} (product #${prior.neon_id} is gone)`,
        );
      }
    }
    staged.push({ rel, from: c.absPath, candidate: c });
  }
  catalog?.close();

  const manifestPath = path.join(os.tmpdir(), "y2kase-ingest-manifest.json");
  const manifest = staged.map((s) => {
    const parts = s.rel.split("/").filter(Boolean);
    return {
      folderPath: s.rel,
      absPath: s.from,
      categoryHint:
        parts.length >= 2 ? parts.slice(0, -1).join(" / ") : s.candidate.character,
      imageFiles: s.candidate.imageFiles,
      videoFiles: s.candidate.videoFiles,
    };
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  console.log(`\nScanned ${candidates.length} product folders`);
  console.log(`Staging ${staged.length} new folders at ${STAGING}\n`);
  for (const s of staged) console.log(`  + ${s.rel}`);
  const planPath = path.join(STAGING, "_plan.txt");
  const plan = [
    `Staging ${staged.length} folders`,
    ...staged.map((s) => `KEEP\t${s.rel}\t${s.from}`),
    "",
    ...skippedName.map((line) => `SKIP name\t${line}`),
    ...skippedBytes.map((line) => `SKIP bytes\t${line}`),
    ...skippedVisual.map((line) => `SKIP visual\t${line}`),
    ...skippedBatchVisual.map((line) => `SKIP batch\t${line}`),
  ].join("\n");
  fs.writeFileSync(planPath, plan, "utf8");
  console.log(`\nManifest: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
