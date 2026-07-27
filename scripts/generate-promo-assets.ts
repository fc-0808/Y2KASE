/**
 * Generate one-off marketing / promo card artwork with Kie.ai's Nano Banana Pro
 * (Gemini 3 Pro Image), then downscale to a web-ready WebP.
 *
 *   npm run promos:generate                    # generate any missing assets
 *   npm run promos:generate -- --force         # regenerate everything
 *
 * Output: public/brand/<key>.webp
 *
 * Unlike the collection/device banners these are hand-authored editorial
 * visuals, so each one is an explicit entry in PROMO_ASSETS below.
 *
 * An asset may declare `productReferences`, in which case real catalog photos
 * are attached as image-to-image references. Nano Banana Pro is
 * subject-preserving, so the promo art then features OUR actual cases (correct
 * prints, charms and colours) and stays photographic — matching the other
 * editorial cards instead of drifting into a different illustration style.
 *
 * Node-only; requires KIE_API_KEY (and DATABASE_URL when using references).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { db } from "../src/lib/db";

const KIE_BASE = "https://api.kie.ai";
/** Used when an asset doesn't declare its own aspect ratio. */
const DEFAULT_ASPECT = "16:9";
const RESOLUTION = "2K";
const OUT_WIDTH = 1280;
const OUT_DIR = path.join(process.cwd(), "public", "brand");
/** Nano Banana Pro accepts at most 8 reference images. */
const MAX_REFERENCES = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FORCE = process.argv.includes("--force");

type PromoAsset = {
  /** The instruction sent to Nano Banana Pro. */
  prompt: string;
  /** How many real catalog photos to attach as subject references. */
  productReferences?: number;
  /** Frame shape, matched to the slot the art renders in. */
  aspect?: string;
};

/**
 * Editorial promo assets, keyed by output filename (without extension).
 *
 * IMPORTANT: these images sit behind an overlaid white heading, sub-copy and
 * button anchored to the BOTTOM-LEFT of the card, under a dark bottom gradient.
 * Every prompt therefore reserves that corner as calm negative space so the
 * overlaid type stays legible — the subject lives in the upper/right area.
 */
const PROMO_ASSETS: Record<string, PromoAsset> = {
  "promo-bundle": {
    productReferences: 4,
    prompt: [
      "Using the supplied product photos as the REAL products, create ONE premium editorial promo photograph for a Gen-Z kawaii / Y2K phone-case brand.",
      "Scene: a tidy overhead flat-lay of these four phone cases, arranged in a gentle overlapping fan on a soft pastel surface,",
      "styled with a few delicate props (a sheer ribbon, tiny pearls, a couple of soft petals) in airy natural light with a dreamy pastel bokeh.",
      "Keep each case's printed artwork, colours, charms and shape 100% faithful to the reference photos — do NOT restyle, recolour or invent designs.",
      "Composition: place the cases across the UPPER-RIGHT two thirds; keep the LEFT THIRD and the BOTTOM STRIP soft, clean and softly out of focus,",
      "because white headline text is overlaid there.",
      "Palette: soft pink, lilac and pearl — a dreamy, expensive-looking Y2K kawaii editorial.",
      "Absolutely NO text, letters, words, numbers, logos, price tags or watermarks anywhere in the image.",
      "Photographic high-end product editorial, 16:9 landscape, no border, no frame.",
    ].join(" "),
  },

  /**
   * The "Join the Y2KASE Club" membership band visual. Unlike the promo card
   * above this one is NOT overlaid with text, so it can be centred and framed —
   * it renders inside a white-bordered rounded card beside the copy.
   */
  "club-hero": {
    productReferences: 4,
    aspect: "4:3",
    prompt: [
      "Using the supplied product photos as the REAL products, create ONE premium editorial photograph for a Gen-Z kawaii / Y2K phone-case brand's membership club.",
      "Scene: a celebratory flat-lay of these phone cases arranged in a gentle overlapping fan,",
      "styled with soft pastel gift ribbon, a scatter of confetti, tiny pearls and a few holographic sparkles,",
      "on a dreamy pink-and-lilac gradient surface with soft natural light and airy bokeh.",
      "Keep each case's printed artwork, colours, charms and shape 100% faithful to the reference photos — do NOT restyle, recolour or invent designs.",
      "Composition: centred and balanced with generous margins; the cases are clearly the hero and nothing is cropped at the edges.",
      "Palette: soft pink, lilac, pearl and holographic — dreamy and expensive-looking, designed to sit on a pink-to-lavender gradient background.",
      "Absolutely NO text, letters, words, numbers, logos or watermarks anywhere in the image.",
      "Photographic high-end product editorial, 4:3, no border, no frame.",
    ].join(" "),
  },
};

/**
 * Pick distinct hero photos from the live catalog to use as subject references.
 * Featured products first — they're the merchandised, best-shot items.
 */
async function catalogReferenceImages(count: number): Promise<string[]> {
  const rows = await db.query.products.findMany({
    where: (p, { eq }) => eq(p.status, "active"),
    columns: { id: true },
    with: {
      images: {
        columns: { url: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
    orderBy: (p, { desc }) => [desc(p.featured), desc(p.id)],
    limit: 60,
  });

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const url = row.images[0]?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= Math.min(count, MAX_REFERENCES)) break;
  }
  return urls;
}

async function kieCreateTask(
  apiKey: string,
  prompt: string,
  imageInput: string[],
  aspect: string,
): Promise<string> {
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
        ...(imageInput.length > 0 ? { image_input: imageInput } : {}),
        aspect_ratio: aspect,
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

async function main() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not set in .env.local.");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const entries = Object.entries(PROMO_ASSETS);
  console.log(
    `\nGenerating ${entries.length} promo asset(s) via Nano Banana Pro…\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, [key, asset]] of entries.entries()) {
    const outFile = path.join(OUT_DIR, `${key}.webp`);
    const label = `[${i + 1}/${entries.length}] ${key}`;

    if (!FORCE && fs.existsSync(outFile)) {
      skipped++;
      console.log(`${label} — skip (exists)`);
      continue;
    }

    try {
      const references = asset.productReferences
        ? await catalogReferenceImages(asset.productReferences)
        : [];
      if (asset.productReferences && references.length === 0) {
        throw new Error("no catalog reference photos found");
      }
      if (references.length > 0) {
        console.log(`${label} — using ${references.length} catalog reference(s)`);
      }

      const taskId = await kieCreateTask(
        apiKey,
        asset.prompt,
        references,
        asset.aspect ?? DEFAULT_ASPECT,
      );
      const url = await kiePollResult(apiKey, taskId);
      const bytes = await fetchBytes(url);
      await sharp(bytes)
        .resize({ width: OUT_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(outFile);
      created++;
      console.log(`${label} — ✓ saved → ${outFile}`);
    } catch (err) {
      failed++;
      console.error(
        `${label} — ✗ ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  Done. Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`,
  );
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
