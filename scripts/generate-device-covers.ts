/**
 * Generate branded "Shop by device" banners — one per Apple device — with
 * Kie.ai's Nano Banana Pro (Gemini 3 Pro Image), matching the collection-cover
 * style (centered wordmark + themed art), then downscale to web-ready WebP and
 * refresh the device-cover manifest.
 *
 *   npm run devices:generate            # generate any missing banners
 *   npm run devices:generate -- --force # regenerate every banner
 *
 * Output: public/brand/device-covers/<id>.webp
 * Manifest: src/lib/brand/device-covers.ts
 *
 * Node-only; requires KIE_API_KEY.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DEVICE_FAMILIES } from "../src/lib/catalog/devices";

const KIE_BASE = "https://api.kie.ai";
const ASPECT = "16:9";
const RESOLUTION = "2K";
const OUT_WIDTH = 1024;
const OUT_DIR = path.join(process.cwd(), "public", "brand", "device-covers");
const MANIFEST = path.join(
  process.cwd(),
  "src",
  "lib",
  "brand",
  "device-covers.ts",
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FORCE = process.argv.includes("--force");

/** The 6 devices shown in the homepage "Shop by device" grid (Apple family). */
const DEVICE_IDS = DEVICE_FAMILIES.flatMap((f) => f.devices)
  .slice(0, 6)
  .map((d) => d.id);

/** Themed scene + soft accent colour per device (kawaii Y2K, banner style). */
const DEVICE_META: Record<string, { theme: string; accent: string }> = {
  iphone: {
    theme:
      "a cute pastel smartphone wearing a kawaii phone case, floating hearts and sparkles",
    accent: "#ff8fb1",
  },
  airpods: {
    theme:
      "cute pastel wireless earbuds in an open charging case, little music notes and sparkles",
    accent: "#a78bfa",
  },
  macbook: {
    theme:
      "a cute pastel laptop covered in kawaii stickers, hearts and sparkles",
    accent: "#74c7ff",
  },
  "apple-watch": {
    theme:
      "a cute pastel smartwatch with a colourful band and a little heart on the screen, sparkles",
    accent: "#7fe3c4",
  },
  ipad: {
    theme:
      "a cute pastel tablet with a stylus and doodled hearts, sparkles",
    accent: "#ffd76b",
  },
  "apple-accessories": {
    theme:
      "an assortment of cute pastel tech accessories — chargers, cables and phone charms, sparkles",
    accent: "#ff7eb6",
  },
};

function buildPrompt(label: string, id: string): string {
  const meta = DEVICE_META[id] ?? {
    theme: `cute kawaii tech items representing "${label}"`,
    accent: "#ff3ea5",
  };
  const letters = label
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .split("")
    .map((ch) => (ch === " " ? "(space)" : ch))
    .join("-");
  return [
    `A polished landscape category banner for a Gen-Z kawaii + Y2K phone-case store.`,
    `The ONLY text in the whole image is one large, bold, decorative logo-style wordmark, perfectly centered and clearly the focal point, reading exactly: "${label}".`,
    `Spell it letter-for-letter as ${letters} — every letter correct and clearly legible, with no missing, extra, doubled or swapped letters.`,
    `Theme and background: ${meta.theme}, in a soft, glossy palette built around the accent colour ${meta.accent}.`,
    `Place a few themed decorative elements around the wordmark WITHOUT covering any letters, and keep generous negative space so the text stays perfectly legible.`,
    `Do NOT render any other text, letters, words, captions, labels, numbers or watermarks anywhere else in the image — only the "${label}" wordmark.`,
    `Style: clean, high-end, cohesive with a matching set of sibling banners. ${ASPECT} landscape, no outer border.`,
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

function writeManifest(ids: string[], version: string): void {
  const list = [...ids].sort();
  const entries = list.map((s) => `  ${JSON.stringify(s)},`).join("\n");
  const body = `/**
 * Device cover manifest — the set of device ids that have a generated hero
 * banner at \`public/brand/device-covers/<id>.webp\`.
 *
 * AUTO-GENERATED by \`scripts/generate-device-covers.ts\` (Kie.ai Nano Banana
 * Pro). Do not edit by hand — re-run \`npm run devices:generate\` to refresh it.
 *
 * The homepage "Shop by device" grid reads this to show a rich banner, falling
 * back to a clean gradient tile so a missing image never 404s.
 */
export const DEVICE_COVER_IDS: ReadonlySet<string> = new Set<string>([
${entries}
]);

/**
 * Cache-busting stamp, refreshed on every generation run so browsers re-fetch
 * covers when the art changes (the filenames stay stable).
 */
export const DEVICE_COVERS_VERSION = ${JSON.stringify(version)};

/** Public path to a device's generated cover banner (cache-busted). */
export function deviceCoverSrc(id: string): string {
  return \`/brand/device-covers/\${id}.webp?v=\${DEVICE_COVERS_VERSION}\`;
}
`;
  fs.writeFileSync(MANIFEST, body);
}

async function main() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not set in .env.local.");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const byId = new Map(
    DEVICE_FAMILIES.flatMap((f) => f.devices).map((d) => [d.id, d]),
  );
  const targets = DEVICE_IDS.map((id) => ({
    id,
    label: byId.get(id)?.label ?? id,
  }));

  console.log(
    `\nGenerating banners for ${targets.length} device(s) via Nano Banana Pro…\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, t] of targets.entries()) {
    const outFile = path.join(OUT_DIR, `${t.id}.webp`);
    const label = `[${i + 1}/${targets.length}] ${t.id}`;

    if (!FORCE && fs.existsSync(outFile)) {
      skipped++;
      console.log(`${label} — skip (exists)`);
      continue;
    }

    try {
      const taskId = await kieCreateTask(apiKey, buildPrompt(t.label, t.id));
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

  const onDisk = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, ""));
  writeManifest(onDisk, Date.now().toString(36));

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  Done. Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`,
  );
  console.log(`  Banners on disk: ${onDisk.length} → ${OUT_DIR}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
