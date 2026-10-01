/**
 * Thumbnail cost gate — the free path may run only when both the classifier
 * and the backdrop probe agree, and a failing product may not be re-billed
 * forever.
 *
 *   tsx scripts/check-thumbnail-route.ts
 */
import assert from "node:assert/strict";
import sharp from "sharp";

import { probePlainBackdrop } from "../src/lib/catalog/thumbnail-backdrop";
import { normalizeThumbnail } from "../src/lib/catalog/normalize-thumbnail";
import {
  RETRIES_EXHAUSTED_MARK,
  forceGenerativeThumbnails,
  localFrameReason,
  nextAutoFailureReason,
  prefersLocalFraming,
  thumbnailEngine,
  type FramingScore,
} from "../src/lib/catalog/thumbnail-route";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

const tests: [string, () => void | Promise<void>][] = [];

const clean = (score: number): FramingScore => ({
  score,
  category: "clean_product",
  cleanProductShot: true,
});

async function canvas(
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
  layers: {
    w: number;
    h: number;
    color: { r: number; g: number; b: number };
    left: number;
    top: number;
  }[] = [],
): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background },
  });
  if (layers.length === 0) return base.png().toBuffer();
  const inputs = await Promise.all(
    layers.map(async (layer) => ({
      input: await sharp({
        create: {
          width: layer.w,
          height: layer.h,
          channels: 3,
          background: layer.color,
        },
      })
        .png()
        .toBuffer(),
      left: layer.left,
      top: layer.top,
    })),
  );
  return base.composite(inputs).png().toBuffer();
}

const PINK = { r: 255, g: 80, b: 160 };
const WHITE = { r: 255, g: 255, b: 255 };
const PAPER = { r: 250, g: 250, b: 250 };

test("paper-white product shot is trimmable", async () => {
  const buf = await canvas(400, 500, WHITE, [
    { w: 160, h: 280, color: PINK, left: 120, top: 110 },
  ]);
  const probe = await probePlainBackdrop(buf);
  assert.equal(probe.trimmable, true, JSON.stringify(probe));
});

test("off-white paper is trimmable", async () => {
  const buf = await canvas(400, 500, PAPER, [
    { w: 160, h: 280, color: PINK, left: 120, top: 110 },
  ]);
  const probe = await probePlainBackdrop(buf);
  assert.equal(probe.trimmable, true, JSON.stringify(probe));
});

test("blank paper is not a product", async () => {
  const probe = await probePlainBackdrop(await canvas(400, 500, WHITE));
  assert.equal(probe.trimmable, false);
});

test("a dark seamless backdrop is not trimmed locally", async () => {
  const buf = await canvas(400, 500, { r: 12, g: 12, b: 12 }, [
    { w: 160, h: 280, color: PINK, left: 120, top: 110 },
  ]);
  const probe = await probePlainBackdrop(buf);
  assert.equal(probe.trimmable, false);
});

test("a tinted sweep is not paper white", async () => {
  const buf = await canvas(400, 500, { r: 255, g: 228, b: 236 }, [
    { w: 160, h: 280, color: PINK, left: 120, top: 110 },
  ]);
  const probe = await probePlainBackdrop(buf);
  assert.equal(probe.trimmable, false, JSON.stringify(probe));
});

test("a colored band through the border is a scene", async () => {
  const buf = await canvas(400, 500, WHITE, [
    { w: 400, h: 80, color: { r: 34, g: 68, b: 170 }, left: 0, top: 0 },
    { w: 140, h: 220, color: PINK, left: 130, top: 160 },
  ]);
  const probe = await probePlainBackdrop(buf);
  assert.equal(probe.trimmable, false, JSON.stringify(probe));
});

test("a large soft shadow stays on the paid path", async () => {
  const buf = await canvas(400, 500, WHITE, [
    { w: 300, h: 220, color: { r: 208, g: 208, b: 208 }, left: 50, top: 240 },
    { w: 100, h: 140, color: PINK, left: 150, top: 60 },
  ]);
  const probe = await probePlainBackdrop(buf);
  assert.equal(probe.trimmable, false, JSON.stringify(probe));
  assert.ok(probe.shadow > 0.055, `shadow ${probe.shadow}`);
});

test("a trimmable shot still lands on the standard canvas", async () => {
  const buf = await canvas(400, 500, WHITE, [
    { w: 160, h: 280, color: PINK, left: 120, top: 110 },
  ]);
  const out = await normalizeThumbnail(buf);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1280);
});

test("garbage bytes are not trimmable", async () => {
  const probe = await probePlainBackdrop(Buffer.from("not an image"));
  assert.equal(probe.trimmable, false);
});

test("local framing requires a clean product AND a trimmable backdrop", () => {
  assert.equal(prefersLocalFraming(clean(0.91)), true);
  assert.equal(prefersLocalFraming(clean(0.79)), false);
  assert.equal(
    prefersLocalFraming({
      score: 0.95,
      category: "hand_held",
      cleanProductShot: false,
    }),
    false,
  );
  assert.equal(
    prefersLocalFraming({
      score: 0.95,
      category: "hand_held",
      cleanProductShot: true,
    }),
    false,
  );

  assert.equal(
    thumbnailEngine({ score: clean(0.9), backdropTrimmable: true }),
    "local",
  );
  assert.equal(
    thumbnailEngine({ score: clean(0.9), backdropTrimmable: false }),
    "generative",
  );
  assert.equal(
    thumbnailEngine({
      score: { score: 0.2, category: "hand_held", cleanProductShot: false },
      backdropTrimmable: true,
    }),
    "generative",
  );
  assert.equal(
    thumbnailEngine({
      score: clean(0.95),
      backdropTrimmable: true,
      forceGenerative: true,
    }),
    "generative",
  );
  assert.equal(thumbnailEngine({ score: undefined, backdropTrimmable: true }), "generative");
});

test("the force flag is exactly the string true", () => {
  const previous = process.env.THUMBNAIL_FORCE_GENERATIVE;
  process.env.THUMBNAIL_FORCE_GENERATIVE = "true";
  assert.equal(forceGenerativeThumbnails(), true);
  process.env.THUMBNAIL_FORCE_GENERATIVE = "false";
  assert.equal(forceGenerativeThumbnails(), false);
  delete process.env.THUMBNAIL_FORCE_GENERATIVE;
  assert.equal(forceGenerativeThumbnails(), false);
  if (previous === undefined) delete process.env.THUMBNAIL_FORCE_GENERATIVE;
  else process.env.THUMBNAIL_FORCE_GENERATIVE = previous;
});

test("automatic failures exhaust instead of retrying forever", () => {
  const previous = process.env.THUMBNAIL_MAX_ATTEMPTS;
  process.env.THUMBNAIL_MAX_ATTEMPTS = "2";

  const first = nextAutoFailureReason(null, "KIE task timed out.", false);
  assert.match(first, /\[attempt 1\/2\]/);
  assert.equal(first.includes(RETRIES_EXHAUSTED_MARK), false);

  const second = nextAutoFailureReason(first, first, false);
  assert.equal(second.includes(RETRIES_EXHAUSTED_MARK), true);
  assert.equal(/\[attempt \d+\/\d+\]/.test(second), false);

  const stuck = nextAutoFailureReason(second, "KIE task timed out.", false);
  assert.equal(stuck.includes(RETRIES_EXHAUSTED_MARK), true);

  const permanent = nextAutoFailureReason(
    null,
    "This product has no photos to work from.",
    true,
  );
  assert.equal(permanent.includes(RETRIES_EXHAUSTED_MARK), true);
  assert.equal(/\[attempt /.test(permanent), false);

  if (previous === undefined) delete process.env.THUMBNAIL_MAX_ATTEMPTS;
  else process.env.THUMBNAIL_MAX_ATTEMPTS = previous;
});

test("local reason keeps the vision note", () => {
  assert.equal(
    localFrameReason("clean product on white"),
    "clean product on white Framed locally from the clean shot — no generative edit.",
  );
  assert.match(localFrameReason("unscored"), /Framed locally/);
  assert.match(localFrameReason("  "), /Framed locally/);
});

async function main(): Promise<void> {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(err instanceof Error ? err.stack : err);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} thumbnail-route check(s) failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`Thumbnail route invariants passed (${passed}).`);
}

main();
