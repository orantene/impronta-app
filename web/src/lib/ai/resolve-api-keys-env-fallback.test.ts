import assert from "node:assert/strict";
import { test } from "node:test";

import { envFallbackAllowed } from "./resolve-api-keys";

test("TUL-750: dev boxes and preview deploys (staging) may fall back to the platform env key", () => {
  assert.equal(envFallbackAllowed({ NODE_ENV: "development" }), true);
  assert.equal(envFallbackAllowed({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
});

test("TUL-750: production keeps agency mode = DB key only", () => {
  assert.equal(envFallbackAllowed({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
  assert.equal(envFallbackAllowed({}), false);
});
