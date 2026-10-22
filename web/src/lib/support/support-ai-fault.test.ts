import assert from "node:assert/strict";
import { test } from "node:test";
import { supportAiForcedError } from "./support-ai-fault";

test("forced AI error is on only for the flag outside production", () => {
  assert.equal(supportAiForcedError({ SUPPORT_AI_FORCE_ERROR: "1", VERCEL_ENV: "preview" }), true);
  assert.equal(supportAiForcedError({ SUPPORT_AI_FORCE_ERROR: "1" }), true);
  assert.equal(supportAiForcedError({ SUPPORT_AI_FORCE_ERROR: "1", VERCEL_ENV: "production" }), false);
  assert.equal(supportAiForcedError({ VERCEL_ENV: "preview" }), false);
  assert.equal(supportAiForcedError({ SUPPORT_AI_FORCE_ERROR: "0" }), false);
});
