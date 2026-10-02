import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DUPLICATE_PUBLISH_WINDOW_MS,
  isDuplicatePublish,
  publishContentHash,
} from "./publish-idempotency";
import { blankComments } from "../../quality/supabase-unchecked-read";

const NOW = Date.parse("2026-09-30T12:00:30Z");

test("F107: the content hash is stable across key order and differs on edits", () => {
  const a = publishContentHash("page:1", [{ id: "a", props: { x: 1, y: 2 } }]);
  const b = publishContentHash("page:1", [{ props: { y: 2, x: 1 }, id: "a" }]);
  assert.equal(a, b);
  assert.notEqual(a, publishContentHash("page:1", [{ id: "a", props: { x: 2, y: 2 } }]));
  assert.notEqual(a, publishContentHash("page:2", [{ id: "a", props: { x: 1, y: 2 } }]));
});

test("F107: same content hash, recent publish = duplicate (no draft_rev needed)", () => {
  const h = publishContentHash("page:1", []);
  assert.equal(isDuplicatePublish({ contentHash: h, at: "2026-09-30T12:00:10Z" }, h, NOW), true);
});

test("F107: changed content is a real publish", () => {
  const h = publishContentHash("page:1", [1]);
  const other = publishContentHash("page:1", [2]);
  assert.equal(isDuplicatePublish({ contentHash: h, at: "2026-09-30T12:00:10Z" }, other, NOW), false);
});

test("F107: an old publish of the same content never swallows a new one", () => {
  const h = publishContentHash("page:1", []);
  const old = new Date(NOW - DUPLICATE_PUBLISH_WINDOW_MS - 1000).toISOString();
  assert.equal(isDuplicatePublish({ contentHash: h, at: old }, h, NOW), false);
});

test("F107: entries with no hash (legacy) are never duplicates", () => {
  const h = publishContentHash("page:1", []);
  assert.equal(isDuplicatePublish(null, h, NOW), false);
  assert.equal(isDuplicatePublish({ contentHash: null, at: "2026-09-30T12:00:10Z" }, h, NOW), false);
});

test("F107: writers check the hash first and record it on the publish entry", () => {
  for (const [f, scope] of [
    ["src/lib/site-admin/builder-core/adapters/talent-page-actions.ts", "pageHash"],
    ["src/lib/site-admin/builder-core/adapters/talent-site-shell-actions.ts", "shellHash"],
  ] as const) {
    const src = blankComments(readFileSync(join(process.cwd(), f), "utf8"));
    assert.ok(src.indexOf("findDuplicatePublish(") < src.indexOf("delegateFirstPublish("), f);
    assert.ok(src.includes(`report: { contentHash: ${scope} }`), f);
    assert.ok(src.includes(`contentHash: ${scope}`), f);
  }
});
