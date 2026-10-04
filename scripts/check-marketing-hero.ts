import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { renderMarketingHeroCaption } from "../src/lib/marketing/hero-caption";
import {
  composeCatalogMarketingHero,
  marketingHeroCardLayout,
  prepareCatalogProduct,
} from "../src/lib/marketing/hero-compose";
import {
  MARKETING_HERO_CAPTION_BAND,
  MARKETING_HERO_OUTPUT,
  MARKETING_HERO_STYLES,
  marketingHeroCaption,
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

  const captionCards = marketingHeroCardLayout(4, { caption: true });
  for (const card of captionCards) {
    assert.ok(
      card.top + card.height <= MARKETING_HERO_CAPTION_BAND.top - 16,
      "topic caption must not cover the product cards",
    );
  }
  const topic = marketingHeroCaption({
    eyebrow: "NOW AVAILABLE",
    heading: "iPhone 18 Pro and Pro Max cases are ready.",
  });
  assert.ok(topic);
  const topicHero = await composeCatalogMarketingHero(
    sources,
    "pastel-flatlay",
    { captionPng: await renderMarketingHeroCaption(topic) },
  );
  const otherTopic = marketingHeroCaption({
    eyebrow: "BACK IN STOCK",
    heading: "The charm edit is available again.",
  });
  assert.ok(otherTopic);
  const otherHero = await composeCatalogMarketingHero(
    sources,
    "pastel-flatlay",
    { captionPng: await renderMarketingHeroCaption(otherTopic) },
  );
  assert.notEqual(
    createHash("sha256").update(topicHero).digest("hex"),
    createHash("sha256").update(otherHero).digest("hex"),
    "the hero caption must change when the campaign topic changes",
  );
  const topicInfo = await sharp(topicHero).metadata();
  assert.equal(topicInfo.width, MARKETING_HERO_OUTPUT.width);
  assert.equal(topicInfo.height, MARKETING_HERO_OUTPUT.height);
  assert.ok(topicHero.byteLength <= MARKETING_HERO_OUTPUT.maxBytes);

  const captionSample = await sharp(topicHero)
    .extract({
      left: MARKETING_HERO_OUTPUT.width - 48,
      top:
        MARKETING_HERO_CAPTION_BAND.top +
        MARKETING_HERO_CAPTION_BAND.height -
        28,
      width: 8,
      height: 8,
    })
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.ok(
    captionSample[0]! > 230 &&
      captionSample[1]! > 230 &&
      captionSample[2]! > 220,
    "topic band must stay a light caption panel, not a repainted product",
  );

  for (let index = 0; index < captionCards.length; index += 1) {
    const card = captionCards[index]!;
    const sample = await sharp(topicHero)
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
    const color = colors[index]!;
    if (color.dominant === "r") {
      assert.ok(r > g * 1.4 && r > b * 1.4, "caption layout must keep the red product");
    } else if (color.dominant === "g") {
      assert.ok(g > r * 1.4 && g > b * 1.4, "caption layout must keep the green product");
    } else if (color.dominant === "b") {
      assert.ok(b > r * 1.4 && b > g * 1.4, "caption layout must keep the blue product");
    } else {
      assert.ok(r > 140 && g > 110 && b < 120, "caption layout must keep the yellow product");
    }
  }

  console.log("✓ pixel-safe marketing hero composition checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
