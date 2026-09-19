/**
 * Pin-card overlay must rasterize real letters, not SVG tofu squares.
 *
 *   npx tsx scripts/check-pin-card.ts
 */
import assert from "node:assert/strict";
import sharp from "sharp";
import { composePinCard } from "../src/lib/social/pin-card";
import { pinOverlayLines } from "../src/lib/social/pinterest-strategy";

async function main() {
  const title = "Rilakkuma patchwork phone case with beaded strap";
  const lines = pinOverlayLines(title);
  assert.ok(lines[0]?.includes("Rilakkuma"));
  assert.doesNotMatch(lines.join(" "), /□|&#/);

  const source = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#88ccff" },
  })
    .png()
    .toBuffer();

  const card = await composePinCard({ sourceImage: source, overlayTitle: title });
  assert.equal(card.contentType, "image/jpeg");

  const meta = await sharp(card.buffer).metadata();
  assert.equal(meta.width, 1000);
  assert.equal(meta.height, 1500);

  // Caption band is the bottom ~236px. Real letters put dark ink on white;
  // a missing-font tofu field still has ink, but an empty/failed overlay
  // would be almost uniformly pale pink (the canvas) or pure white.
  const band = await sharp(card.buffer)
    .extract({ left: 40, top: 1220, width: 920, height: 236 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = band.data;
  let dark = 0;
  for (let i = 0; i < px.length; i += 3) {
    const r = px[i] ?? 0;
    const g = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    if (r + g + b < 220 * 3) dark += 1;
  }
  const pixels = (px.length / 3) | 0;
  assert.ok(
    dark > pixels * 0.02,
    `overlay band has too little ink (${dark}/${pixels}) — letters missing?`,
  );

  console.log("pin-card: overlay letters rasterized");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
