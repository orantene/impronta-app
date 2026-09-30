import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { talentPublishedSnapshotResult } from "./talent-published-snapshot";
import { editorT } from "../../../components/edit-chrome/editor-i18n";

test("F95: a talent page with no live body is a normal first publish, not an error", () => {
  const r = talentPublishedSnapshotResult({ blocks_published: [], published_at: null });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.hasPublishedSnapshot, false);
    assert.equal(r.publishedBuilderTree, null);
  }
  const r2 = talentPublishedSnapshotResult({ blocks_published: null, published_at: null });
  assert.equal(r2.ok, true);
});

test("F95: a live body is returned for the real diff", () => {
  const r = talentPublishedSnapshotResult({
    blocks_published: [{ id: "a" }],
    published_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.hasPublishedSnapshot, true);
    assert.equal(r.publishedAt, "2026-01-01T00:00:00Z");
  }
});

test("F95: first-publish copy exists in EN and ES", () => {
  const key = "First publish: your whole site goes live";
  assert.equal(editorT(key, "en"), key);
  assert.equal(editorT(key, "es"), "Primera publicación: todo tu sitio sale en vivo");
  const src = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/publish-drawer.tsx"),
    "utf8",
  );
  assert.ok(src.includes(`t("${key}")`));
});

test("F95: the snapshot action falls back to talent_pages when no agency scope", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/site-admin/edit-mode/publish-diff-action.ts"),
    "utf8",
  );
  assert.match(src, /from\("talent_pages"\)/);
  assert.doesNotMatch(src, /Pick an agency workspace first/);
});
