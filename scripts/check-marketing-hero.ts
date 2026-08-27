import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  composeCatalogMarketingHero,
  marketingHeroCardLayout,
  prepareCatalogProduct,
} from "../src/lib/marketing/hero-compose";
import {
  MARKETING_HERO_OUTPUT,
  MARKETING_HERO_STYLES,
} from "../src/lib/marketing/hero";

const colors = [
  { rgb: { r: 220, g: 45, b: 55 }, dominant: "r" as const },
  { rgb: { r: 45, g: 175, b: 75 }, dominant: "g" as const },
  { rgb: { r: 35, g: 105, b: 220 }, dominant: "b" as const },
  { rgb: { r: 235, g: 190, b: 35 }, dominant: "rg" as const },
];

async function main() {
  const whiteBackgroundProduct = await sharp({
    create: {
      width: 200,
      height: 300,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([
      {
        input: Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="200" height="300">
            <rect x="60" y="40" width="80" height="220" rx="20" fill="#e83e8c" />
            <rect x="80" y="110" width="40" height="80" rx="8" fill="#ffffff" />
          </svg>
        `),
      },
    ])
    .png()
    .toBuffer();
  const prepared = await prepareCatalogProduct(whiteBackgroundProduct);
  assert.equal(
    prepared.cutout,
    true,
    "edge-connected white catalogue background must be removed",
  );
  const preparedMetadata = await sharp(prepared.bytes).metadata();
  assert.ok(
    (preparedMetadata.width ?? 200) < 120,
    "transparent outer margin must be trimmed so the real product renders large",
  );
  const centre = await sharp(prepared.bytes)
    .ensureAlpha()
    .extract({
      left: Math.floor((preparedMetadata.width ?? 1) / 2),
      top: Math.floor((preparedMetadata.height ?? 1) / 2),
      width: 1,
      height: 1,
    })
    .raw()
    .toBuffer();
  assert.ok(
    centre[0]! > 240 &&
      centre[1]! > 240 &&
      centre[2]! > 240 &&
      centre[3]! > 240,
    "enclosed white product artwork must remain opaque",
  );

  const sources = await Promise.all(
    colors.map(({ rgb }) =>
      sharp({
        create: {
          width: 200,
          height: 300,
          channels: 3,
          background: rgb,
        },
      })
        .png()
        .toBuffer(),
    ),
  );

  const hero = await composeCatalogMarketingHero(
    sources,
    "pastel-flatlay",
  );
  const metadata = await sharp(hero).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, MARKETING_HERO_OUTPUT.width);
  assert.equal(metadata.height, MARKETING_HERO_OUTPUT.height);
  assert.ok(
    hero.byteLength <= MARKETING_HERO_OUTPUT.maxBytes,
    "email hero must stay within its hard byte budget",
  );

  const cards = marketingHeroCardLayout(4);
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]!;
    const sample = await sharp(hero)
      .extract({
        left: Math.round(card.left + card.width / 2) - 3,
        top: Math.round(card.top + card.height / 2) - 3,
        width: 6,
        height: 6,
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let r = 0;
    let g = 0;
    let b = 0;
    for (
      let offset = 0;
      offset < sample.data.length;
      offset += sample.info.channels
    ) {
      r += sample.data[offset]!;
      g += sample.data[offset + 1]!;
      b += sample.data[offset + 2]!;
    }
    const pixels = sample.data.length / sample.info.channels;
    r /= pixels;
    g /= pixels;
    b /= pixels;

    switch (colors[index]!.dominant) {
      case "r":
        assert.ok(
          r > g * 2 && r > b * 2,
          "red source must survive composition",
        );
        break;
      case "g":
        assert.ok(
          g > r * 2 && g > b * 2,
          "green source must survive composition",
        );
        break;
      case "b":
        assert.ok(
          b > r * 2 && b > g * 2,
          "blue source must survive composition",
        );
        break;
      default:
        assert.ok(
          r > 150 && g > 120 && b < 100,
          "yellow source must survive composition",
        );
    }
  }

  assert.throws(() => marketingHeroCardLayout(0), /requires 1–4 images/);
  assert.throws(() => marketingHeroCardLayout(5), /requires 1–4 images/);

  const styleRenders = await Promise.all(
    MARKETING_HERO_STYLES.map((style) =>
      composeCatalogMarketingHero([sources[0]!], style.id),
    ),
  );
  for (const rendered of styleRenders) {
    const info = await sharp(rendered).metadata();
    assert.equal(info.width, MARKETING_HERO_OUTPUT.width);
    assert.equal(info.height, MARKETING_HERO_OUTPUT.height);
    assert.ok(rendered.byteLength <= MARKETING_HERO_OUTPUT.maxBytes);
  }
  assert.equal(
    new Set(
      styleRenders.map((rendered) =>
        createHash("sha256").update(rendered).digest("hex"),
      ),
    ).size,
    MARKETING_HERO_STYLES.length,
    "every background style must produce a materially distinct render",
  );

  console.log("✓ pixel-safe marketing hero composition checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
