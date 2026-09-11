import { test } from "node:test";
import assert from "node:assert/strict";
import { preflightBlocksPublish } from "./publish-preflight-gate";

test("warnings alone do not block publish", () => {
  const r = preflightBlocksPublish([{ severity: "warn", message: "Consider a longer title" }]);
  assert.equal(r.blocked, false);
});

test("any error severity blocks, naming the first issue", () => {
  const r = preflightBlocksPublish([
    { severity: "warn", message: "soft" },
    { severity: "error", message: "Missing alt text on hero." },
    { severity: "error", message: "Broken heading outline." },
  ]);
  assert.equal(r.blocked, true);
  if (r.blocked) {
    assert.match(r.message, /Missing alt text/);
    assert.match(r.message, /\+1 more/);
  }
});
