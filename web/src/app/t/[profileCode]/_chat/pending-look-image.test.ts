import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingLookImage,
  lookImageDataUrlToFile,
  peekPendingLookImage,
  PENDING_LOOK_IMAGE_MAX_CHARS,
  setPendingLookImage,
  takePendingLookImage,
} from "./pending-look-image";

test("accepts a small PNG data URL and take clears it", () => {
  clearPendingLookImage();
  const url = "data:image/png;base64,iVBORw0KGgo=";
  setPendingLookImage(url);
  assert.equal(peekPendingLookImage(), url);
  assert.equal(takePendingLookImage(), url);
  assert.equal(peekPendingLookImage(), null);
});

test("refuses SVG and oversized payloads", () => {
  clearPendingLookImage();
  setPendingLookImage("data:image/svg+xml;base64,PHN2Zy8+");
  assert.equal(peekPendingLookImage(), null);
  setPendingLookImage(`data:image/png;base64,${"A".repeat(PENDING_LOOK_IMAGE_MAX_CHARS)}`);
  assert.equal(peekPendingLookImage(), null);
});

test("lookImageDataUrlToFile builds a PNG File", () => {
  // 1x1 transparent PNG
  const url =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const file = lookImageDataUrlToFile(url, "look.png");
  assert.ok(file);
  assert.equal(file!.type, "image/png");
  assert.equal(file!.name, "look.png");
  assert.ok(file!.size > 0);
});
