import test from "node:test";
import assert from "node:assert/strict";
import { isCodeSourceRequested } from "./theme-preview-source";

test("source=code needs the param and (platform admin or dev)", () => {
  assert.equal(isCodeSourceRequested("code", { isPlatformAdmin: true, nodeEnv: "production" }), true);
  assert.equal(isCodeSourceRequested("CODE", { isPlatformAdmin: false, nodeEnv: "development" }), true);
  assert.equal(isCodeSourceRequested("code", { isPlatformAdmin: false, nodeEnv: "production" }), false);
  assert.equal(isCodeSourceRequested(undefined, { isPlatformAdmin: true }), false);
  assert.equal(isCodeSourceRequested("live", { isPlatformAdmin: true }), false);
});
