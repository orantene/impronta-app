/** TUL-626: feature ideas must not spend the support-ticket budget. Lane: test:auth-routing. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("feature requests use their own limiter, not the ticket one", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/support/feature-request-actions.ts"), "utf8");
  assert.ok(src.includes("checkFeatureRequestCreate("));
  assert.equal(src.includes("checkSupportTicketCreate"), false);
  const kv = readFileSync(join(process.cwd(), "src/lib/rate-limit-kv.ts"), "utf8");
  assert.ok(kv.includes('prefix: "rl:feature_request_create"'));
});
