/**
 * Pixel-art themes for "Shop the universe" collection covers.
 *
 * Each theme is the scene + palette that frames a centred arcade wordmark.
 * Combined with {@link buildCollectionCoverPrompt} so every tile shares one
 * cohesive 2D pixel / 8-bit look instead of drifting into 3D or photography.
 *
 * Lives next to the generator (not in `src/`) so the storefront never ships
 * prompt text, while `scripts/check-collection-covers.ts` can still assert
 * that featured rail collections have a bespoke theme — the Originals tile
 * shipped as a blank gradient specifically because it was missing here.
 */
import { ORIGINALS_SLUG } from "../../src/lib/catalog/collections-config";

/** Landscape banner — matches the CategoryRail `aspect-video` frame. */
export const COLLECTION_COVER_ASPECT = "16:9";

/**
 * Per-collection pixel scene. Slugs not listed fall back to a generic motif
 * built from the collection name; featured rail tiles must not rely on that.
 */
export const COLLECTION_COVER_THEMES: Record<string, string> = {
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
  // House-brand shelf — clouds, bows, stars, hearts. Never a licensed face,
  // and never a blob-with-a-face (that reads as Chiikawa next to that tile).
  // Palette is the Originals accent (#7ec8ff) so the tile sits next to MagSafe
  // and Sanrio without cloning either (mint holographic vs lavender).
  [ORIGINALS_SLUG]:
    "a clean 2D pixel-art collage of ORIGINAL in-house kawaii motifs with no characters and no faces: fluffy white pixel clouds, pastel pink and baby-blue ribbon bows, four-point pixel sparkles, tiny pixel hearts and small pixel stars, on a flat baby-blue-to-periwinkle pixel gradient (accent #7ec8ff) with a soft pale-blue checker band like wrapping paper",
};

/**
 * Extra prompt clauses for collections whose default kawaii prior would leak
 * the wrong IP onto the tile. Originals is the important one: models love to
 * "help" a cute banner by dropping in a kitten with a bow.
 */
const THEME_EXTRAS: Record<string, string> = {
  [ORIGINALS_SLUG]:
    "Wordmark styling: title case like Sanrio/Miffy (not all-caps), thick dark navy pixel outline, iridescent baby-blue-to-lavender fill, light cyan outer glow. Absolutely no licensed characters, no animals, no creatures, no blobs with faces, no kittens with hair bows, no jester-hood bunnies, no named cartoon faces. Originals is the house-brand shelf: only original kawaii clouds, bows, stars and hearts.",
};

export function collectionCoverTheme(name: string, slug: string): string {
  return (
    COLLECTION_COVER_THEMES[slug] ??
    `clean pixel-art motifs representing "${name}"`
  );
}

export function hasBespokeCoverTheme(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(COLLECTION_COVER_THEMES, slug);
}

/** Full Nano Banana prompt for one collection cover. */
export function buildCollectionCoverPrompt(name: string, slug: string): string {
  const theme = collectionCoverTheme(name, slug);
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .split("")
    .map((ch) => (ch === " " ? "(space)" : ch))
    .join("-");
  const extra = THEME_EXTRAS[slug];
  return [
    `A clean flat-design pixel-art category banner for a Gen-Z Y2K kawaii phone-case store — 2D pixel / 8-bit sprite illustration, crisp square pixels, limited retro palette, flat design. NOT 3D, NOT photographic, no glossy shading.`,
    `Centered on the banner, render the exact words "${name}" as one bold, legible pixelated bitmap wordmark (pixel / arcade font) — clearly the focal point.`,
    `Spell it letter-for-letter as ${letters} — every letter correct and clearly legible, with no missing, extra, doubled or swapped letters.`,
    `Pixel-art scene: ${theme}.`,
    `Arrange the pixel-art elements around the wordmark WITHOUT covering any letters, and keep generous negative space so the text stays perfectly legible.`,
    `Do NOT render any other text, letters, words, captions, labels, numbers or watermarks anywhere else in the image — only the "${name}" wordmark.`,
    extra,
    `Cohesive iridescent pastel Y2K "pixel digital" look across the whole set. ${COLLECTION_COVER_ASPECT} landscape, no outer border, no frame.`,
  ]
    .filter(Boolean)
    .join(" ");
}
