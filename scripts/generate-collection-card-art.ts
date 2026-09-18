/**
 * Generate the BACKGROUND artwork for the /collections "Characters & brands"
 * cards with Nano Banana Pro, then flatten it to a measured legibility budget
 * and refresh the manifest.
 *
 *   npm run cards:generate                 # generate any missing card art
 *   npm run cards:generate:force           # regenerate every card (calls the API)
 *   npm run cards:reprocess                # re-derive from cached originals, free
 *   npx tsx scripts/generate-collection-card-art.ts --only sanrio
 *
 * Output:   public/brand/collection-cards/<slug>.webp
 * Originals: .cache/collection-card-art/<slug>.png  (gitignored)
 * Manifest: src/lib/brand/collection-card-art.ts
 *
 * ── Why this is a SEPARATE asset family from `covers:generate` ───────────────
 * `public/brand/collections/<slug>.webp` already exists, but those are homepage
 * rail *banners*: 16:9, saturated, and with the collection name baked into the
 * art as a big pixel wordmark. Dropping one behind a card whose own heading
 * already says "Sanrio" would print the name twice and bury the text under
 * high-contrast art. Backgrounds have inverted requirements, so they get their
 * own set:
 *
 *   covers (foreground)          card art (background)
 *   ──────────────────────       ──────────────────────
 *   wordmark is the subject      no text at all
 *   centred focal composition    even all-over field, crops from any edge
 *   saturated, high contrast     pale, contrast-capped, sits under body copy
 *
 * ── Why the palette ignores each brand's accent colour ──────────────────────
 * Miffy is orange and Tamagotchi is teal, but every card shares one soft
 * pink/lavender/blue pastel palette taken from the site's own design tokens, so
 * the row reads as one calm surface that blends into the page. Brand identity is
 * carried by the accent rule along the card's top edge and by the pixel motifs
 * in the art — not by flooding the card with a competing hue.
 *
 * Node-only; requires KIE_API_KEY in .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { flattenTaxonomy } from "../src/lib/catalog/collections-config";
import { generateImage, requireKieApiKey } from "./lib/nano-banana";

/** Landscape source art; the cards crop it with `object-cover`. */
const ASPECT = "16:9";
const OUT_WIDTH = 1024;

/**
 * How many mascots the print should lay across its full width. Six keeps each
 * sprite ~170px in the 1024px asset, which still reads as a character after a
 * card downscales it to a third of that. See the `Scale:` prompt clause.
 */
const SPRITES_ACROSS = 6;
const OUT_DIR = path.join(
  process.cwd(),
  "public",
  "brand",
  "collection-cards",
);
const MANIFEST = path.join(
  process.cwd(),
  "src",
  "lib",
  "brand",
  "collection-card-art.ts",
);

/**
 * Untouched model output, cached (and gitignored) so the post-processing knobs
 * below can be re-tuned with `--reprocess` without paying for a new generation.
 * Acquiring the art and processing it are separate concerns; conflating them
 * makes every tweak to the legibility budget cost real money and, worse, hand
 * back different art mid-review.
 */
const RAW_DIR = path.join(process.cwd(), ".cache", "collection-card-art");

// ── Legibility budget ───────────────────────────────────────────────────────
// The prompt asks for pale art, but a generative model is not a contrast
// guarantee: one unlucky sample comes back punchy and ships behind body copy.
// So the ceiling is enforced arithmetically after download (see `quieten`).

/**
 * Luminance FLOOR, 0–255. ~214 is "pale wallpaper on white". Art that already
 * measures brighter than this is left alone (beyond {@link MIN_VEIL}); only art
 * that comes back too dark gets washed up to meet it.
 */
const MIN_LUMA = 214;
/**
 * Always wash the art at least this much, even when it is already pale. Kept
 * small: the mascots have to stay recognisable through it, and {@link MIN_LUMA}
 * is what actually guarantees the contrast floor.
 */
const MIN_VEIL = 0.04;
/** Never wash past this, or the motifs disappear entirely. */
const MAX_VEIL = 0.78;
/** Pull the colour punch down before veiling, so pastels stay pastel. */
const SATURATION = 0.82;

const FORCE = process.argv.includes("--force");
/** Re-derive the shipped WebP from cached model output; never calls the API. */
const REPROCESS = process.argv.includes("--reprocess");
/**
 * `--only` accepts a comma list or, on shells that split commas (PowerShell),
 * the rest of argv until the next flag. Both become a slug set.
 */
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  if (i === -1) return [] as string[];
  const collected: string[] = [];
  for (const token of process.argv.slice(i + 1)) {
    if (token.startsWith("--")) break;
    collected.push(token);
  }
  return collected
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
})();

type BrandArt = {
  /**
   * The brand's mascots as a repeating print — what we actually want on the card.
   *
   * Characters are described by their PHYSICAL APPEARANCE rather than by name
   * ("a white kitten with a red bow", not "Hello Kitty"). This is the phrasing
   * that `generate-collection-covers.ts` already ships with, and it matters for
   * two reasons: the gateway's safety filter rejects prompts that lean on
   * licensed character names, and a described sprite keeps the output in our own
   * pixel style instead of trying to reproduce someone's exact character sheet.
   */
  cast: string;
  /**
   * Character-free motif field, used only when the `cast` prompt is rejected.
   * See {@link attemptPrompts} — the filter is stochastic, so we need somewhere
   * to land rather than shipping a blank card.
   */
  motifs: string;
};

const BRAND_ART: Record<string, BrandArt> = {
  sanrio: {
    cast: "cute Sanrio-style pixel mascots repeating across the whole field — a white kitten with a red bow, a white bunny in a black jester hood, a white bunny in a pink hood, a fluffy white puppy with long floppy ears, a golden puppy in a little brown beret, and a cheerful green frog — interleaved with tiny pixel bows, hearts, stars and strawberries",
    motifs:
      "tiny pixel ribbon bows, pixel hearts, four-point pixel sparkles, small pixel strawberries, little five-petal pixel flowers and small pixel stars",
  },
  miffy: {
    cast: "a simple Miffy-style pixel bunny repeating across the whole field — a small white rabbit with long straight upright ears, two dot eyes and a tiny x-shaped mouth, drawn with a bold minimal outline — interleaved with small round-petal pixel flowers, little pixel clouds and tiny pixel hearts",
    motifs:
      "tiny pixel bunny-ear silhouettes, small round-petal pixel flowers, simple little pixel crosses, and small soft pixel clouds",
  },
  tamagotchi: {
    cast: "retro Tamagotchi-style pixel virtual pets repeating across the whole field — small egg-shaped handheld devices with a dot-matrix screen and three buttons, together with the little 8-bit blob pets themselves (a round chick, a small dinosaur, a smiling blob with a tail) — interleaved with tiny pixel hearts, d-pad buttons and sparkles",
    motifs:
      "tiny pixel egg-shaped handheld virtual-pet outlines, small dot-matrix screen squares, little pixel d-pad buttons, pixel hearts, and simple 8-bit blob pets",
  },
  rilakkuma: {
    cast: "a relaxed round brown pixel bear with a cream muzzle and a sleepy smile, a smaller white pixel bear with pink blush, and a tiny round yellow pixel chick, repeating across the whole field — interleaved with tiny pixel honey pots, clovers, stars and hearts",
    motifs:
      "tiny pixel bear silhouettes, little pixel honey pots, four-leaf pixel clovers, small pixel stars and soft pixel hearts",
  },
  disney: {
    cast: "kawaii pixel mascots loosely suggesting a classic cartoon studio crew — a round-eared black-and-white mouse, a round-eared mouse with a polka-dot bow, a small blue alien with huge black eyes and tall notched ears, and a round yellow bear in a little red shirt — interleaved with tiny pixel stars, sparkles and bows",
    motifs:
      "tiny pixel magic wands with star tips, jeweled pixel crowns, rainbow pixel ribbons, four-point sparkles and small pixel stars",
  },
  "toy-story": {
    cast: "a wrapping-paper print of generic toybox pixel figures — a lanky cowboy doll in a brown hat, a bulky astronaut action figure in a clear dome helmet, and a cowgirl doll with a yarn-loop ponytail — interleaved with tiny pixel wooden alphabet blocks, bouncing balls, stars and rockets",
    motifs:
      "tiny pixel cowboy hats, space helmets, bouncing rubber balls, spinning tops, toy rockets and little pixel stars",
  },
  monchhichi: {
    cast: "a cute round monkey doll with big ears, a tuft of hair and a tiny thumb near its mouth, repeating across the whole field as a kawaii pixel print — interleaved with tiny pixel bows, hearts, stars and pacifiers",
    motifs:
      "tiny pixel monkey-ear silhouettes, little pixel bows, hearts, stars and tiny round pixel pacifiers",
  },
  chiikawa: {
    cast: "tiny round anxious pixel creatures repeating across the whole field — a small white spotted bean-shaped animal with big worried eyes, a round cat-like friend with dark ears, and a rabbit-eared companion — interleaved with tiny pixel sparkles, tears-of-joy droplets and hearts",
    motifs:
      "tiny pixel bean-shaped creature outlines, little pixel sparkles, hearts and small round-petal flowers",
  },
  peanuts: {
    cast: "a simple white pixel beagle with black ears and a tiny round yellow bird, repeating across the whole field — interleaved with tiny pixel doghouses, hearts, stars and woodstock-style dashes",
    motifs:
      "tiny pixel beagle silhouettes, little red pixel doghouses, small yellow bird shapes, hearts and stars",
  },
  "crayon-shin-chan": {
    cast: "a cheeky little pixel kid with short spiky hair and a mischievous grin in a simple red shirt, repeating as a kawaii wrapping-paper print — interleaved with tiny pixel crayons, action stars and hearts",
    motifs:
      "tiny pixel crayons, action-line bursts, small stars, hearts and simple kid-doodle flowers",
  },
  pokemon: {
    cast: "cute pocket-monster pixel creatures repeating across the whole field — a round yellow mouse with long black-tipped ears and red cheek circles, a brown fox-like creature with a cream ruff, and a large sleepy teal-blue bear — interleaved with tiny pixel lightning bolts, stars and pokeball-like two-tone spheres",
    motifs:
      "tiny two-tone pixel spheres, little lightning bolts, four-point sparkles, stars and simple monster silhouettes",
  },
  "spongebob-squarepants": {
    cast: "kawaii underwater pixel cartoons repeating across the whole field — a square yellow sponge with holes and a wide smile, and a round pink starfish with green spots — interleaved with tiny pixel bubbles, starfish, pineapple silhouettes and hearts",
    motifs:
      "tiny pixel bubbles, starfish, pineapple silhouettes, waves, hearts and small sea-flower shapes",
  },
  "care-bears": {
    cast: "round pastel pixel teddy bears with simple tummy badges repeating across the whole field — interleaved with tiny pixel rainbows, hearts, clovers, stars and clouds",
    motifs:
      "tiny pixel rainbows, hearts, clovers, stars, clouds and round bear silhouettes",
  },
};

/** Compose the full prompt around one brand's subject field. */
function buildPrompt(field: string): string {
  return [
    // What it is — framed as a background from the first sentence, because the
    // model weights the opening clause heavily.
    "A seamless decorative BACKGROUND print for a rounded UI card on a Gen-Z Y2K kawaii phone-case website.",

    // Medium.
    "Style: flat 2D pixel-art / 8-bit sprite illustration — crisp square pixels, hard pixel edges, a visible pixel grid, a limited retro palette, and ordered dithering where colours blend. Nostalgic 90s handheld sprite work with a clean, modern, uncluttered layout. NOT 3D, NOT photographic, no glossy or airbrushed shading, no drop shadows.",

    // Palette. The base is quoted from the site's own design tokens so the card
    // blends into the page; the sprites are allowed their identifying hues,
    // because a mascot flattened into one pastel is no longer recognisable.
    "Palette: soft high-key pastels throughout. Background base of blush pink #ffe0f3, bubblegum #ffd9ee, soft lilac #f3e0ff, lavender #e6d9ff, pale periwinkle #e0ecff and baby blue #dbeeff over an almost-white warm pink #fdf3fb, with a gentle iridescent pink to lavender to blue holographic wash matching the site's hero backdrop. The mascot sprites may keep their own identifying colours — a red bow, a green frog, a golden puppy — but rendered in soft muted pastel tones. Nothing neon, nothing dark, nothing high-contrast.",

    // Composition — crop-safe at any card height, and scaled so the mascots
    // survive the card's downscale.
    `Composition: an evenly repeating all-over PRINT of ${field}, laid out like kawaii wrapping paper or a sticker sheet. NO hero character, NO single large subject, NO scene, NO horizon line, NO vignette, and no sprite larger than the others — the image must still look correct when cropped from any edge or to any aspect ratio.`,

    // Sprite SCALE, stated as an explicit count. This is load-bearing: asked only
    // for "small" sprites, the model returns ~10 columns of confetti, and a card
    // renders the 1024px print at roughly a third of its size, so a 65px mascot
    // lands at ~20px and is unrecognisable. Naming the count pins the scale.
    `Scale: lay out only about ${SPRITES_ACROSS} mascots across the full width of the image — each main mascot roughly one ${SPRITES_ACROSS}th of the image width, big and chunky and instantly recognisable, with generous near-white breathing space between them. Fill the gaps with much smaller pixel accents. Do NOT shrink the mascots into fine confetti or a dense busy texture.`,

    // The legibility instruction (belt; `quieten` is the braces).
    "Tone: soft, gentle and low-contrast — a pastel character print, not a poster. The sprites should read clearly but stay quiet: this artwork sits BEHIND dark body text and small labels and must never compete with them.",

    // Hard negatives.
    "Absolutely NO text, letters, words, numbers, captions, labels, logos, signatures or watermarks anywhere in the image.",
    `No frame, no border, no rounded corners and no outer edge treatment in the artwork itself. ${ASPECT} landscape.`,
  ].join(" ");
}

/**
 * The prompt attempts for one brand, in order.
 *
 * The character print is tried TWICE before falling back to the character-free
 * motif field. That is not superstition: the gateway's safety filter is
 * stochastic about mascot descriptions — Sanrio was rejected outright on one run
 * and sailed through on the next from an equivalent prompt — so a single flag
 * must not cost us the artwork we actually want. Retrying the preferred prompt
 * is strictly better than immediately settling for the lesser one.
 */
function attemptPrompts(name: string, slug: string): string[] {
  const art = BRAND_ART[slug];
  const preferred = buildPrompt(
    art?.cast ??
      `small pixel mascots and motifs loosely suggesting "${name}", interleaved with pixel hearts and four-point sparkles`,
  );
  const fallback = buildPrompt(
    art?.motifs ??
      `tiny simple pixel motifs loosely suggesting "${name}", plus pixel hearts and four-point pixel sparkles`,
  );
  return [preferred, preferred, fallback];
}

/** Mean luminance (0–255) of an image's RGB channels. */
async function meanLuma(image: Buffer): Promise<number> {
  const { channels } = await sharp(image).stats();
  const [r, g, b] = channels;
  return 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
}

/**
 * Bring one generated image under the legibility budget, deterministically.
 *
 * Compositing white at alpha `a` maps every channel mean `L` to
 * `L(1-a) + 255a`, so the veil that lands exactly on {@link MIN_LUMA} can be
 * solved for instead of searched for:
 *
 *     a = (floor - measured) / (255 - measured)
 *
 * One measurement, one composite, no iteration — and the shipped asset's
 * contrast is a property we computed rather than one we hoped the prompt bought.
 * Already-pale art solves to a negative `a` and simply clamps to {@link MIN_VEIL}.
 */
async function quieten(
  raw: Buffer,
): Promise<{ webp: Buffer; before: number; after: number; veil: number }> {
  // Flatten onto white first: these are opaque backgrounds, and a stray alpha
  // channel would otherwise skew both the stats and the composite.
  const base = await sharp(raw)
    .flatten({ background: "#ffffff" })
    .resize({ width: OUT_WIDTH, withoutEnlargement: true })
    .modulate({ saturation: SATURATION })
    .png()
    .toBuffer({ resolveWithObject: true });

  const before = await meanLuma(base.data);
  const solved = (MIN_LUMA - before) / (255 - before);
  const veil = Math.min(MAX_VEIL, Math.max(MIN_VEIL, solved));

  const webp = await sharp(base.data)
    .composite([
      {
        input: {
          create: {
            width: base.info.width,
            height: base.info.height,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: veil },
          },
        },
        blend: "over",
      },
    ])
    .webp({ quality: 82 })
    .toBuffer();

  return { webp, before, after: await meanLuma(webp), veil };
}

function writeManifest(slugs: string[], version: string): void {
  const entries = [...slugs]
    .sort()
    .map((s) => `  ${JSON.stringify(s)},`)
    .join("\n");

  fs.writeFileSync(
    MANIFEST,
    `/**
 * Collection card-art manifest — the set of collection slugs that have generated
 * background artwork at \`public/brand/collection-cards/<slug>.webp\`.
 *
 * AUTO-GENERATED by \`scripts/generate-collection-card-art.ts\` (Kie.ai Nano
 * Banana Pro). Do not edit by hand — re-run \`npm run cards:generate\`.
 *
 * This is the BACKGROUND set, distinct from \`collection-covers.ts\`: text-free,
 * contrast-capped art that sits behind the card copy. The /collections brand
 * cards read this to decide whether to render artwork or stay on the plain card
 * surface, so a missing file degrades gracefully instead of 404-ing.
 */
export const COLLECTION_CARD_ART_SLUGS: ReadonlySet<string> = new Set<string>([
${entries}
]);

/**
 * Cache-busting stamp, refreshed on every generation run. Filenames are stable,
 * so this query param is what forces browsers to re-fetch regenerated art.
 */
export const COLLECTION_CARD_ART_VERSION = ${JSON.stringify(version)};

/** Public path to a collection's card background (cache-busted). */
export function collectionCardArtSrc(slug: string): string {
  return \`/brand/collection-cards/\${slug}.webp?v=\${COLLECTION_CARD_ART_VERSION}\`;
}
`,
  );
}

async function main() {
  // `--reprocess` never touches the network, so it must not demand a key.
  const apiKey = REPROCESS ? "" : requireKieApiKey();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  // Only top-level BRANDS get card art — they are exactly the nodes the
  // /collections "Characters & brands" grid renders as cards. Character children
  // (Hello Kitty, Kuromi, …) appear there as plain text chips, not cards.
  let targets = flattenTaxonomy()
    .filter((n) => n.kind === "brand")
    .map((n) => ({ slug: n.slug, name: n.name }));
  if (ONLY.length) targets = targets.filter((t) => ONLY.includes(t.slug));

  if (ONLY.length && targets.length === 0) {
    console.error(
      `No matching brands for --only ${JSON.stringify(ONLY)}. ` +
        `Known brand slugs: ${flattenTaxonomy()
          .filter((n) => n.kind === "brand")
          .map((n) => n.slug)
          .join(", ")}`,
    );
  }

  console.log(
    `\nGenerating card backgrounds for ${targets.length} brand(s) via Nano Banana Pro…\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, t] of targets.entries()) {
    const outFile = path.join(OUT_DIR, `${t.slug}.webp`);
    const rawFile = path.join(RAW_DIR, `${t.slug}.png`);
    const label = `[${i + 1}/${targets.length}] ${t.slug}`;
    let raw: Buffer | null = null;

    if (REPROCESS) {
      if (!fs.existsSync(rawFile)) {
        skipped++;
        console.log(`${label} — skip (--reprocess, no cached original)`);
        continue;
      }
      raw = fs.readFileSync(rawFile);
      console.log(`${label} — reprocessing cached original (no API call)`);
    } else {
      if (!FORCE && fs.existsSync(outFile)) {
        skipped++;
        console.log(`${label} — skip (exists)`);
        continue;
      }

      const attempts = attemptPrompts(t.name, t.slug);
      let lastError: unknown;

      for (const [attempt, prompt] of attempts.entries()) {
        try {
          raw = await generateImage(apiKey, {
            prompt,
            aspectRatio: ASPECT,
            resolution: "2K",
          });
          if (attempt > 0) {
            console.log(
              `${label} — attempt ${attempt + 1}/${attempts.length} succeeded` +
                (attempt === attempts.length - 1
                  ? " (character print rejected, used the motif fallback)"
                  : " (retried after a rejection)"),
            );
          }
          break;
        } catch (err) {
          lastError = err;
          console.warn(
            `${label} — attempt ${attempt + 1}/${attempts.length} failed: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (!raw) {
        failed++;
        console.error(
          `${label} — ✗ all ${attempts.length} attempts failed. Last error: ` +
            `${lastError instanceof Error ? lastError.message : String(lastError)}`,
        );
        continue;
      }

      // Bank the untouched original before touching it, so a later tuning pass
      // can re-derive from exactly this art via `--reprocess`.
      fs.writeFileSync(rawFile, raw);
    }

    const { webp, before, after, veil } = await quieten(raw);
    fs.writeFileSync(outFile, webp);
    created++;
    console.log(
      `${label} — ✓ saved  luma ${before.toFixed(1)} → ${after.toFixed(1)} ` +
        `(floor ${MIN_LUMA}, veil ${(veil * 100).toFixed(0)}%, ` +
        `${(webp.byteLength / 1024).toFixed(0)} KB)`,
    );
  }

  // The manifest reflects what is actually on disk, so it stays accurate even
  // after a partial or failed run.
  const onDisk = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, ""));
  writeManifest(onDisk, Date.now().toString(36));

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  Done. Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`,
  );
  console.log(`  Card art on disk: ${onDisk.length} → ${OUT_DIR}`);
  console.log(`  Manifest: ${MANIFEST}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
