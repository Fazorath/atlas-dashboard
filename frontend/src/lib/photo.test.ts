// Run with: node --test src/lib/photo.test.ts
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { PhotoUnsupportedError, pollInterval, shrink } from "./photo.ts";

const g = globalThis as any;
afterEach(() => {
  delete g.createImageBitmap;
  delete g.document;
});

const original = new Blob(["raw bytes with GPS"], { type: "image/jpeg" });

function stubCanvas(toBlobResult: Blob | null) {
  g.createImageBitmap = async () => ({ width: 4800, height: 3200, close() {} });
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob: (cb: (b: Blob | null) => void) => cb(toBlobResult),
  };
  g.document = { createElement: () => canvas };
  return canvas;
}

test("refuses instead of sending the original when decoding fails", async () => {
  g.createImageBitmap = async () => {
    throw new Error("cannot decode HEIC");
  };
  await assert.rejects(shrink(original), PhotoUnsupportedError);
});

test("refuses when the canvas cannot encode", async () => {
  stubCanvas(null);
  await assert.rejects(shrink(original), PhotoUnsupportedError);
});

test("returns the re-encoded blob, scaled to 2400px, never the original", async () => {
  const out = new Blob(["clean"], { type: "image/jpeg" });
  const canvas = stubCanvas(out);
  const got = await shrink(original);
  assert.equal(got, out);
  assert.notEqual(got, original);
  assert.equal(canvas.width, 2400);
  assert.equal(canvas.height, 1600);
});

test("closes the bitmap after a successful shrink", async () => {
  const canvas = stubCanvas(new Blob(["clean"], { type: "image/jpeg" }));
  let closed = 0;
  g.createImageBitmap = async () => ({ width: 100, height: 100, close: () => closed++ });
  await shrink(original);
  assert.equal(closed, 1);
  assert.equal(canvas.width, 100);
});

test("closes the bitmap when encoding fails", async () => {
  stubCanvas(null);
  let closed = 0;
  g.createImageBitmap = async () => ({ width: 100, height: 100, close: () => closed++ });
  await assert.rejects(shrink(original), PhotoUnsupportedError);
  assert.equal(closed, 1);
});

test("polls every 5 s only while a read is reading", () => {
  assert.equal(pollInterval([{ status: "reading" }, { status: "ready" }]), 5_000);
  assert.equal(pollInterval([{ status: "ready" }, { status: "failed" }]), false);
  assert.equal(pollInterval([]), false);
  assert.equal(pollInterval(undefined), false);
});
