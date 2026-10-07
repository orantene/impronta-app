import assert from "node:assert/strict";
import { test } from "node:test";

import { createLatestGuard, resolveTalentDraftStatus, saveStatusWords, statusWhileEditPending } from "./talent-draft-status";

test("add then undo (no net change) resolves to published", () => {
  assert.equal(resolveTalentDraftStatus({ unpublishedCount: 0, firstPublish: null }), "published");
});
test("changes or first publish resolve to draft", () => {
  assert.equal(resolveTalentDraftStatus({ unpublishedCount: 1, firstPublish: null }), "draft");
  assert.equal(resolveTalentDraftStatus({ unpublishedCount: 0, firstPublish: { pages: 1 } }), "draft");
});
test("unknown before the first load", () => {
  assert.equal(resolveTalentDraftStatus(null), "unknown");
});
test("save control agrees with the chip", () => {
  assert.equal(saveStatusWords("published", "saved"), "published");
  assert.equal(saveStatusWords("draft", "saved"), "draftSaved");
  assert.equal(saveStatusWords("unknown", "saved"), "draftSaved");
  assert.equal(saveStatusWords("published", "dirty"), "dirty");
});

test("an edit invalidates a stale published status until a fresh diff lands", () => {
  assert.equal(statusWhileEditPending("published", true), "unknown");
  assert.equal(saveStatusWords(statusWhileEditPending("published", true), "saved"), "draftSaved");
  // delete then undo (no net change): fresh diff says published again
  assert.equal(saveStatusWords(statusWhileEditPending("published", false), "saved"), "published");
  assert.equal(statusWhileEditPending("draft", true), "draft");
});
test("latest guard drops an older in-flight diff", () => {
  const g = createLatestGuard();
  const a = g.next();
  const b = g.next();
  assert.equal(g.isLatest(a), false);
  assert.equal(g.isLatest(b), true);
});
