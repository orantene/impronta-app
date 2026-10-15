import assert from "node:assert/strict";
import { test } from "node:test";
import { previewScale } from "./MyWebsiteCard";

test("previewScale fits the real box on a 390px screen", () => {
  assert.equal(previewScale(560, 300, 1280), 300 / 1280);
  assert.equal(previewScale(280, 300, 390), 280 / 390);
  assert.equal(previewScale(560, null, 1280), 560 / 1280);
});
