/**
 * Crop studio geometry, plus a Sharp render of a synthetic photo.
 *
 *   tsx scripts/check-crop-geometry.ts
 */
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  MIN_CROP_SIDE,
  CropGeometryError,
  fitAspect,
  frameSize,
  isNoop,
  isWholePhoto,
  moveRect,
  normaliseCrop,
  normaliseRotation,
  resizeRect,
  rotateRect,
  roundRect,
  type ImageFrame,
  type ImageRect,
} from "../src/lib/catalog/crop-geometry";
import { renderListingCrop } from "../src/lib/catalog/image-edit";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err);
  }
}

function inside(rect: ImageRect, frame: ImageFrame): void {
  assert.ok(rect.x >= -1e-6);
  assert.ok(rect.y >= -1e-6);
  assert.ok(rect.x + rect.w <= frame.w + 1e-6);
  assert.ok(rect.y + rect.h <= frame.h + 1e-6);
  assert.ok(rect.w > 0 && rect.h > 0);
}

async function main(): Promise<void> {
  await test("rotation coerces to quarter turns", () => {
    assert.equal(normaliseRotation(90), 90);
    assert.equal(normaliseRotation(450), 90);
    assert.equal(normaliseRotation(-90), 270);
    assert.equal(normaliseRotation(45), 0);
    assert.equal(normaliseRotation(Number.NaN), 0);
  });

  await test("frame size swaps on a quarter turn", () => {
    assert.deepEqual(frameSize({ width: 200, height: 100 }, 0), {
      width: 200,
      height: 100,
    });
    assert.deepEqual(frameSize({ width: 200, height: 100 }, 90), {
      width: 100,
      height: 200,
    });
    assert.deepEqual(frameSize({ width: 200, height: 100 }, 270), {
      width: 100,
      height: 200,
    });
  });

  await test("four clockwise turns restore the rect", () => {
    const frame = { w: 100, h: 200 };
    let rect = { x: 10, y: 20, w: 30, h: 40 };
    let current = frame;
    for (let i = 0; i < 4; i++) {
      const turned = rotateRect(rect, current, 1);
      rect = turned.rect;
      current = turned.frame;
    }
    assert.deepEqual(current, frame);
    assert.deepEqual(rect, { x: 10, y: 20, w: 30, h: 40 });
  });

  await test("clockwise then anticlockwise is identity", () => {
    const frame = { w: 100, h: 200 };
    const start = { x: 10, y: 20, w: 30, h: 40 };
    const cw = rotateRect(start, frame, 1);
    const back = rotateRect(cw.rect, cw.frame, -1);
    assert.deepEqual(back.frame, frame);
    assert.deepEqual(back.rect, start);
  });

  await test("move stays inside the frame", () => {
    const frame = { w: 100, h: 80 };
    const moved = moveRect({ x: 10, y: 10, w: 40, h: 30 }, frame, 1000, -1000);
    assert.deepEqual(moved, { x: 60, y: 0, w: 40, h: 30 });
  });

  await test("free resize moves the dragged edge", () => {
    const next = resizeRect(
      { x: 0, y: 0, w: 50, h: 50 },
      { w: 100, h: 100 },
      "e",
      80,
      10,
      MIN_CROP_SIDE,
      null,
    );
    assert.deepEqual(next, { x: 0, y: 0, w: 80, h: 50 });
  });

  await test("locked resize stays inside the frame", () => {
    const frame = { w: 100, h: 100 };
    const next = resizeRect(
      { x: 10, y: 10, w: 40, h: 40 },
      frame,
      "se",
      200,
      200,
      MIN_CROP_SIDE,
      1,
    );
    inside(next, frame);
    assert.ok(Math.abs(next.w - next.h) < 1e-6);
  });

  await test("aspect fit centres the largest matching rect", () => {
    const fitted = fitAspect(
      { x: 0, y: 0, w: 100, h: 50 },
      { w: 100, h: 50 },
      1,
    );
    assert.ok(Math.abs(fitted.w - fitted.h) < 1e-6);
    assert.ok(fitted.w <= 50);
    inside(fitted, { w: 100, h: 50 });
  });

  await test("round rect clamps a fractional overflow", () => {
    const snapped = roundRect(
      { x: -2.2, y: 0.4, w: 500, h: 10.2 },
      { w: 100, h: 80 },
    );
    assert.equal(snapped.left, 0);
    assert.equal(snapped.top, 0);
    assert.equal(snapped.width, 100);
    assert.ok(snapped.top + snapped.height <= 80);
  });

  await test("whole photo is a no-op only at rotation 0", () => {
    const frame = { w: 200, h: 100 };
    const full = { x: 0, y: 0, w: 200, h: 100 };
    assert.equal(isWholePhoto(full, frame, 0), true);
    assert.equal(isWholePhoto(full, frame, 90), false);
    const pixel = roundRect(full, frame);
    assert.equal(isNoop(pixel, { width: 200, height: 100 }, 0), true);
    assert.equal(isNoop(pixel, { width: 100, height: 200 }, 90), false);
  });

  await test("normaliseCrop clamps edges and rejects a tiny box", () => {
    const clamped = normaliseCrop(
      { left: -4, top: 1.2, width: 9999, height: 80 },
      { width: 400, height: 300 },
    );
    assert.equal(clamped.left, 0);
    assert.equal(clamped.top, 1);
    assert.equal(clamped.width, 400);
    assert.equal(clamped.height, 80);
    assert.throws(
      () =>
        normaliseCrop(
          { left: 0, top: 0, width: 10, height: 10 },
          { width: 1000, height: 1000 },
        ),
      CropGeometryError,
    );
  });

  await test("sharp crop extracts the requested rectangle", async () => {
    const src = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();
    const cropped = await renderListingCrop(src, {
      left: 10,
      top: 5,
      width: 80,
      height: 60,
      rotate: 0,
    });
    assert.equal(cropped.changed, true);
    assert.equal(cropped.width, 80);
    assert.equal(cropped.height, 60);
    const meta = await sharp(cropped.bytes).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 80);
    assert.equal(meta.height, 60);
  });

  await test("sharp rotate swaps the frame before extract", async () => {
    const src = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 20, g: 40, b: 180 },
      },
    })
      .png()
      .toBuffer();
    const turned = await renderListingCrop(src, {
      left: 0,
      top: 0,
      width: 100,
      height: 200,
      rotate: 90,
    });
    assert.equal(turned.changed, true);
    assert.equal(turned.width, 100);
    assert.equal(turned.height, 200);
  });

  await test("a full-frame request does not re-encode", async () => {
    const src = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .png()
      .toBuffer();
    const same = await renderListingCrop(src, {
      left: 0,
      top: 0,
      width: 80,
      height: 60,
      rotate: 0,
    });
    assert.equal(same.changed, false);
    assert.equal(same.bytes, src);
  });

  await test("a tiny crop is refused before encode", async () => {
    const src = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      () =>
        renderListingCrop(src, {
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          rotate: 0,
        }),
      CropGeometryError,
    );
  });

  if (failed > 0) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
