import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveTalentDraftStatus, saveStatusWords } from "./talent-draft-status";

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
