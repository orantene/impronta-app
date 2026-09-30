import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DUPLICATE_PUBLISH_WINDOW_MS, isDuplicatePublish } from "./publish-idempotency";

const NOW = Date.parse("2026-09-30T12:00:30Z");

test("F104: same draft rev, recent publish = duplicate", () => {
  assert.equal(isDuplicatePublish({ draftRev: 7, at: "2026-09-30T12:00:10Z" }, 7, NOW), true);
});

test("F104: an edit since (rev moved) is a real publish", () => {
  assert.equal(isDuplicatePublish({ draftRev: 7, at: "2026-09-30T12:00:10Z" }, 8, NOW), false);
});

test("F104: an old publish at the same rev never swallows a new one", () => {
  const old = new Date(NOW - DUPLICATE_PUBLISH_WINDOW_MS - 1000).toISOString();
  assert.equal(isDuplicatePublish({ draftRev: 7, at: old }, 7, NOW), false);
});

test("F104: no history or unknown rev is not a duplicate", () => {
  assert.equal(isDuplicatePublish(null, 7, NOW), false);
  assert.equal(isDuplicatePublish({ draftRev: null, at: "2026-09-30T12:00:10Z" }, 7, NOW), false);
});

test("F104: both builder publish writers consult the idempotency check first", () => {
  for (const f of [
    "src/lib/site-admin/builder-core/adapters/talent-page-actions.ts",
    "src/lib/site-admin/builder-core/adapters/talent-site-shell-actions.ts",
  ]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.ok(src.indexOf("findDuplicatePublish(") > 0 && src.indexOf("findDuplicatePublish(") < src.indexOf("delegateFirstPublish("), f);
  }
});
