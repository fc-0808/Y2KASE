/**
 * Proof-of-concept: SELECT + normalize consistent product thumbnails.
 *
 *   npm run catalog:normalize-thumbs -- --limit 20
 *
 * NON-DESTRUCTIVE by design. For each product it:
 *   1. Scores EVERY gallery image with AI vision for thumbnail suitability
 *      (clean product-only shot beats hand-held / propped / lifestyle shots —
 *      the durable fix, because background removal can't strip a hand that is
 *      holding the product).
 *   2. Selects the highest-scoring image as the hero.
 *   3. If that image is clean enough, normalizes it (background removed, real
 *      product centered on uniform white with a soft shadow).
 *   4. If NO image clears the bar, flags the product "needs a clean photo"
 *      instead of fabricating one.
 *
 * Writes AFTER previews + a visual review contact sheet to
 * ./normalized-thumbnails/. It never writes to the DB or R2 — validate quality
 * on real products first (Photoroom's first 10 calls are free).
 *
 * Flags:
 *   --limit <n>       products to process (default 20)
 *   --threshold <f>   min suitability score to auto-normalize (default 0.6)
 *   --padding <f>     canvas padding fraction 0–0.4 (default 0.08)
 *   --size <px>       output square edge (default 1200)
 *   --no-shadow       disable the soft drop-shadow
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import {
  classifyThumbnailSuitability,
  type ThumbnailScore,
} from "../src/lib/ai";
import { composeOnCanvas } from "../src/lib/catalog/normalize-thumbnail";
import { removeHandsOnWhite } from "../src/lib/catalog/ai-cleanup";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const LIMIT = Number(arg("limit") ?? 20);
const THRESHOLD = Number(arg("threshold") ?? 0.6);
const PADDING = arg("padding") ? Number(arg("padding")) : undefined;
const SIZE = arg("size") ? Number(arg("size")) : undefined;
const OUT_DIR = path.join(process.cwd(), "normalized-thumbnails");

type Candidate = { url: string; score: ThumbnailScore; chosen: boolean };
type Result = {
  slug: string;
  title: string;
  currentUrl: string;
  candidates: Candidate[];
  status: "normalized" | "flagged";
  afterFile?: string;
  note: string;
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  if (!process.env.KIE_API_KEY && !process.env.GEMINI_API_KEY) {
    throw new Error(
      "No cleanup engine configured. Set KIE_API_KEY (Nano Banana Pro) in .env.local.",
    );
  }

  const products = await db.query.products.findMany({
    columns: { slug: true, title: true },
    with: {
      images: {
        columns: { url: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
    },
    limit: LIMIT,
  });

  const withImages = products.filter((p) => p.images.length > 0);

  // Score every image across all products in one pass (batched internally).
  const items = withImages.flatMap((p) =>
    p.images.map((img, idx) => ({
      filename: `${p.slug}##${idx}`,
      imageUrl: img.url,
    })),
  );
  console.log(
    `\nScoring ${items.length} image(s) across ${withImages.length} product(s) for thumbnail suitability…\n`,
  );
  const scores = await classifyThumbnailSuitability(items);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const results: Result[] = [];
  let normalized = 0;
  let flagged = 0;
  let failed = 0;

  for (const [i, p] of withImages.entries()) {
    const label = `[${i + 1}/${withImages.length}] ${p.slug}`;

    const candidates: Candidate[] = p.images.map((img, idx) => ({
      url: img.url,
      score: scores[`${p.slug}##${idx}`] ?? {
        score: 0,
        category: "busy",
        cleanProductShot: false,
        reason: "unscored",
      },
      chosen: false,
    }));

    // Best = highest suitability score.
    const best = candidates.reduce((a, b) => (b.score.score > a.score.score ? b : a));
    best.chosen = true;

    if (best.score.score < THRESHOLD) {
      flagged++;
      results.push({
        slug: p.slug,
        title: p.title,
        currentUrl: p.images[0]!.url,
        candidates,
        status: "flagged",
        note: `No image scored ≥ ${THRESHOLD} (best ${best.score.score.toFixed(2)}, ${best.score.category}). Needs a clean product photo.`,
      });
      console.log(`${label} — FLAGGED (best ${best.score.score.toFixed(2)})`);
      continue;
    }

    try {
      const referenceUrls = [
        best.url,
        ...candidates.filter((c) => c !== best).map((c) => c.url),
      ];
      const cleaned = await removeHandsOnWhite(referenceUrls);
      const after = await composeOnCanvas(cleaned, {
        padding: PADDING,
        width: SIZE,
      });

      const afterFile = `${p.slug}.after.webp`;
      fs.writeFileSync(path.join(OUT_DIR, afterFile), after);
      normalized++;
      results.push({
        slug: p.slug,
        title: p.title,
        currentUrl: p.images[0]!.url,
        candidates,
        status: "normalized",
        afterFile,
        note: `Selected image scored ${best.score.score.toFixed(2)} (${best.score.category}).`,
      });
      console.log(`${label} — normalized (score ${best.score.score.toFixed(2)})`);
    } catch (err) {
      failed++;
      results.push({
        slug: p.slug,
        title: p.title,
        currentUrl: p.images[0]!.url,
        candidates,
        status: "flagged",
        note: `Normalization failed: ${err instanceof Error ? err.message : err}`,
      });
      console.error(`${label} — FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  writeContactSheet(results);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Done. Normalized: ${normalized}  Flagged: ${flagged}  Failed: ${failed}`);
  console.log(`  Review: ${path.join(OUT_DIR, "index.html")}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

/** Visual review: per product, all candidates (scored) + selected/normalized. */
function writeContactSheet(rows: Result[]) {
  const cards = rows
    .map((r) => {
      const candidateThumbs = r.candidates
        .map(
          (c) => `
        <div class="cand ${c.chosen ? "chosen" : ""}" title="${escapeHtml(c.score.reason)}">
          <img src="${escapeAttr(c.url)}" alt="" loading="lazy" />
          <span class="badge">${c.score.score.toFixed(2)}</span>
          <span class="cat">${c.score.category}</span>
        </div>`,
        )
        .join("");

      const afterBlock =
        r.status === "normalized" && r.afterFile
          ? `<div class="after ok"><span>after</span><img src="./${encodeURIComponent(r.afterFile)}" alt="" /></div>`
          : `<div class="after flagged"><span>needs a clean photo</span><div class="warn">⚠</div></div>`;

      return `
    <figure class="card">
      <figcaption>${escapeHtml(r.title)}</figcaption>
      <div class="row">
        <div class="current"><span>current</span><img src="${escapeAttr(r.currentUrl)}" alt="" loading="lazy" /></div>
        ${afterBlock}
      </div>
      <p class="note ${r.status}">${escapeHtml(r.note)}</p>
      <div class="cands">${candidateThumbs}</div>
    </figure>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Thumbnail selection & normalization review</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #faf7fb; color: #34203b; }
  h1 { font-size: 1.25rem; }
  .legend { color: #6b5570; font-size: 13px; max-width: 60ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.25rem; margin-top: 1rem; }
  .card { margin: 0; background: #fff; border: 1px solid #f1d3ec; border-radius: 16px; padding: 12px; box-shadow: 0 10px 30px -22px rgba(120,60,120,.5); }
  figcaption { font-size: 12px; font-weight: 700; margin-bottom: 8px; line-height: 1.3; height: 2.6em; overflow: hidden; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .row > div { position: relative; }
  .row span { position: absolute; top: 6px; left: 6px; z-index: 1; font-size: 10px; font-weight: 800; text-transform: uppercase; background: rgba(0,0,0,.55); color: #fff; padding: 2px 6px; border-radius: 999px; }
  .row img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #fff; border-radius: 10px; display: block; border: 1px solid #eee; }
  .after.flagged { display: grid; place-items: center; aspect-ratio: 1; background: #fff5f8; border: 1px dashed #ff9ac6; border-radius: 10px; }
  .after.flagged .warn { font-size: 40px; }
  .note { font-size: 11px; margin: 8px 0 4px; }
  .note.flagged { color: #c0356f; font-weight: 700; }
  .note.normalized { color: #4a7a53; }
  .cands { display: flex; gap: 6px; flex-wrap: wrap; }
  .cand { position: relative; width: 64px; }
  .cand img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 2px solid transparent; display: block; }
  .cand.chosen img { border-color: #ff3ea5; }
  .cand .badge { position: absolute; bottom: 2px; right: 2px; font-size: 9px; font-weight: 800; background: rgba(0,0,0,.6); color: #fff; padding: 1px 4px; border-radius: 6px; }
  .cand .cat { position: absolute; top: 2px; left: 2px; font-size: 8px; background: rgba(255,255,255,.85); padding: 0 3px; border-radius: 4px; }
</style>
</head>
<body>
  <h1>Thumbnail selection & normalization — ${rows.length} product(s)</h1>
  <p class="legend"><strong>Current</strong> = today's thumbnail (position 0). <strong>After</strong> = the AI-selected cleanest shot, background removed and centered on white. The strip shows every candidate image with its suitability score (pink border = selected). Flagged products had no shot clean enough — they need a better source photo rather than a fabricated one.</p>
  <div class="grid">
${cards}
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
