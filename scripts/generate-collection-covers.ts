/**
 * Generate branded "Shop the universe" cover images — one per collection — with
 * Kie.ai's Nano Banana Pro (Gemini 3 Pro Image), then downscale to web-ready
 * WebP and refresh the cover manifest.
 *
 *   npm run covers:generate            # generate any missing covers
 *   npm run covers:generate -- --force # regenerate every cover
 *   npm run covers:generate -- --only kawaii,y2k,sanrio
 *
 * Output: public/brand/collections/<slug>.webp
 * Manifest: src/lib/brand/collection-covers.ts (slugs that now have a cover)
 *
 * The prompts render a UNIFIED, on-brand look (kawaii + Y2K, glossy 3D, soft
 * pastel gradients in each collection's accent colour) so the rail reads as a
 * cohesive designer set rather than a grab-bag. Node-only; requires KIE_API_KEY.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  flattenTaxonomy,
  RAIL_HIDDEN_SLUGS,
} from "../src/lib/catalog/collections-config";

const KIE_BASE = "https://api.kie.ai";
const ASPECT = "16:9"; // landscape banner (CASETiFY / CaseBang style)
const RESOLUTION = "2K";
const OUT_WIDTH = 1024; // retina-crisp for a ~320px banner, tiny on disk as WebP
const OUT_DIR = path.join(process.cwd(), "public", "brand", "collections");
const MANIFEST = path.join(
  process.cwd(),
  "src",
  "lib",
  "brand",
  "collection-covers.ts",
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const FORCE = process.argv.includes("--force");
const ONLY = (arg("only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Per-collection pixel-art THEME — the flat 2D pixel scene + background palette
 * that surrounds the centered pixel wordmark. Combined with the shared directive
 * in `buildPrompt` so every card shares one cohesive "Y2K pixel digital" look:
 * a legible pixel-font name as the focal point, framed by clean pixel-art.
 * Slugs not listed fall back to a generic pixel theme built from the name.
 */
const THEMES: Record<string, string> = {
  sanrio:
    "a clean 2D pixel-art collage of cute Sanrio-style mascots (a white kitten, a purple bunny, a floppy-eared white puppy, a pink-hooded bunny) with little pixel stars and hearts, on a flat lavender pixel gradient background",
  "hello-kitty":
    "a detailed clean pixel-art white kitten face with a red bow, framed by small flat pixel-art apple stickers and pixel heart patterns, on a flat pink-and-red pixel pattern background",
  kuromi:
    "a clean pixel-art mischievous white bunny in a black jester hood with tiny pixel skulls and bats, on a flat purple-and-black pixel gradient background",
  "my-melody":
    "a clean pixel-art sweet white bunny in a pink hood with tiny pixel flowers, on a flat soft-pink pixel gradient background",
  cinnamoroll:
    "a clean pixel-art fluffy white puppy with long floppy ears among pixel clouds, on a flat sky-blue pixel gradient background",
  pompompurin:
    "a clean pixel-art golden puppy in a little brown beret with a pixel dish of pudding, on a flat cream-and-gold pixel gradient background",
  keroppi:
    "a clean pixel-art cheerful green frog with pixel lily pads and water droplets, on a flat green pixel gradient background",
  pochacco:
    "a clean pixel-art sporty white puppy with black ears and little pixel paw prints, on a flat blue-and-white pixel gradient background",
  "little-twin-stars":
    "a clean pixel-art pair of twin star children with crescent moons and pixel stars, on a flat pastel night-sky pixel gradient background",
  miffy:
    "a clean pixel-art white bunny with stylized pixel mushroom sprites, on a flat peach-and-white pixel gradient background",
  tamagotchi:
    "a clean pixel-art scene of several retro egg-shaped handheld virtual-pet devices, each little screen showing a different pixel pet, on a flat mint-green pixel gradient background",
  rilakkuma:
    "a clean pixel-art relaxed round brown bear lying back with a sleepy smile, next to a small pink baby bear and a tiny yellow chick, on a flat warm brown-and-cream pixel gradient background",
  chiikawa:
    "a clean pixel-art collage of small round fluffy creatures with big worried eyes — a tiny white spotted creature and a small rabbit-eared companion — with tiny pixel sparkles, on a flat soft-pink pixel gradient background",
  disney:
    "a clean pixel-art collage of a sparkling magic wand with a star tip, a jeweled crown, and a rainbow ribbon of confetti, on a flat royal-blue pixel gradient background",
  "toy-story":
    "a clean pixel-art collage of colorful wooden alphabet blocks, a spinning top, a bouncing rubber ball, and a rolling die, on a flat sky-blue pixel gradient background",
  monchhichi:
    "a clean pixel-art thumb-sucking monkey doll face with big round ears and a tiny pixel pacifier, on a flat dusty-rose pixel gradient background",
  magsafe:
    "a clean flat pixel-art MagSafe magnetic ring symbol next to a phone outline, built from iridescent pixel colors, on a flat iridescent-blue pixel gradient background",
};

function buildPrompt(name: string, slug: string): string {
  const theme = THEMES[slug] ?? `clean pixel-art motifs representing "${name}"`;
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .split("")
    .map((ch) => (ch === " " ? "(space)" : ch))
    .join("-");
  return [
    `A clean flat-design pixel-art category banner for a Gen-Z Y2K kawaii phone-case store — 2D pixel / 8-bit sprite illustration, crisp square pixels, limited retro palette, flat design. NOT 3D, NOT photographic, no glossy shading.`,
    `Centered on the banner, render the exact words "${name}" as one bold, legible pixelated bitmap wordmark (pixel / arcade font) — clearly the focal point.`,
    `Spell it letter-for-letter as ${letters} — every letter correct and clearly legible, with no missing, extra, doubled or swapped letters.`,
    `Pixel-art scene: ${theme}.`,
    `Arrange the pixel-art elements around the wordmark WITHOUT covering any letters, and keep generous negative space so the text stays perfectly legible.`,
    `Do NOT render any other text, letters, words, captions, labels, numbers or watermarks anywhere else in the image — only the "${name}" wordmark.`,
    `Cohesive iridescent pastel Y2K "pixel digital" look across the whole set. ${ASPECT} landscape, no outer border, no frame.`,
  ].join(" ");
}

async function kieCreateTask(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nano-banana-pro",
      input: {
        prompt,
        aspect_ratio: ASPECT,
        resolution: RESOLUTION,
        output_format: "png",
      },
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: { taskId?: string };
  } | null;
  if (!res.ok || json?.code !== 200 || !json.data?.taskId) {
    throw new Error(`createTask failed: ${json?.msg ?? `HTTP ${res.status}`}`);
  }
  return json.data.taskId;
}

async function kiePollResult(apiKey: string, taskId: string): Promise<string> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const res = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const json = (await res.json().catch(() => null)) as {
      data?: {
        state?: string;
        resultJson?: string;
        failCode?: string;
        failMsg?: string;
      };
    } | null;
    const data = json?.data;
    if (!data) continue;
    if (data.state === "success") {
      const parsed = data.resultJson
        ? (JSON.parse(data.resultJson) as { resultUrls?: string[] })
        : null;
      const url = parsed?.resultUrls?.[0];
      if (!url) throw new Error("succeeded but returned no result URL");
      return url;
    }
    if (data.state === "fail") {
      throw new Error(data.failMsg ?? data.failCode ?? "task failed");
    }
  }
  throw new Error("task timed out");
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function writeManifest(slugs: string[], version: string): void {
  const list = [...slugs].sort();
  const entries = list.map((s) => `  ${JSON.stringify(s)},`).join("\n");
  const body = `/**
 * Collection cover manifest — the set of collection slugs that have a
 * generated hero image at \`public/brand/collections/<slug>.webp\`.
 *
 * AUTO-GENERATED by \`scripts/generate-collection-covers.ts\` (Kie.ai Nano Banana
 * Pro). Do not edit by hand — re-run \`npm run covers:generate\` to refresh it.
 *
 * The \`CategoryRail\` reads this to decide whether to show a rich cover photo or
 * fall back to a clean on-brand gradient tile, so a missing image never 404s.
 */
export const COLLECTION_COVER_SLUGS: ReadonlySet<string> = new Set<string>([
${entries}
]);

/**
 * Cache-busting stamp, refreshed on every generation run. Because covers keep
 * stable filenames, this query param forces browsers to re-fetch the art
 * whenever it's regenerated instead of serving a stale cached image.
 */
export const COLLECTION_COVERS_VERSION = ${JSON.stringify(version)};

/** Public path to a collection's generated cover image (cache-busted). */
export function collectionCoverSrc(slug: string): string {
  return \`/brand/collections/\${slug}.webp?v=\${COLLECTION_COVERS_VERSION}\`;
}
`;
  fs.writeFileSync(MANIFEST, body);
}

async function main() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not set in .env.local.");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Purge covers for collections that are hidden from the rail, so the manifest
  // never references a tile we no longer show.
  for (const slug of RAIL_HIDDEN_SLUGS) {
    const f = path.join(OUT_DIR, `${slug}.webp`);
    if (fs.existsSync(f)) {
      fs.rmSync(f);
      console.log(`purged hidden cover: ${slug}`);
    }
  }

  let targets = flattenTaxonomy()
    .filter((n) => !RAIL_HIDDEN_SLUGS.has(n.slug))
    .map((n) => ({
      slug: n.slug,
      name: n.name,
    }));
  if (ONLY.length) targets = targets.filter((t) => ONLY.includes(t.slug));

  console.log(
    `\nGenerating covers for ${targets.length} collection(s) via Nano Banana Pro…\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, t] of targets.entries()) {
    const outFile = path.join(OUT_DIR, `${t.slug}.webp`);
    const label = `[${i + 1}/${targets.length}] ${t.slug}`;

    if (!FORCE && fs.existsSync(outFile)) {
      skipped++;
      console.log(`${label} — skip (exists)`);
      continue;
    }

    try {
      const prompt = buildPrompt(t.name, t.slug);
      const taskId = await kieCreateTask(apiKey, prompt);
      const url = await kiePollResult(apiKey, taskId);
      const bytes = await fetchBytes(url);
      await sharp(bytes)
        .resize({ width: OUT_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(outFile);
      created++;
      console.log(`${label} — ✓ saved`);
    } catch (err) {
      failed++;
      console.error(
        `${label} — ✗ ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Manifest reflects whatever is actually on disk (accurate after partial runs).
  const onDisk = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, ""));
  writeManifest(onDisk, Date.now().toString(36));

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  Done. Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`,
  );
  console.log(`  Covers on disk: ${onDisk.length} → ${OUT_DIR}`);
  console.log(`  Manifest: ${MANIFEST}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
