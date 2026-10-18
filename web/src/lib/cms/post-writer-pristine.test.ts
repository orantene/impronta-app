/**
 * TUL-1249: which drafts count as "never written in".
 * Run: npx tsx --test src/lib/cms/post-writer-pristine.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isPristineDraft } from "./post-writer-status";

const base = {
  status: "draft",
  title: "Sin título",
  excerpt: null,
  blockCount: 0,
  scheduledPublishAt: null,
};

test("an untouched stored draft is pristine", () => {
  assert.equal(isPristineDraft(base), true);
  assert.equal(isPristineDraft({ ...base, title: "", excerpt: "  " }), true);
});

test("any real content or setting makes it the owner's work", () => {
  assert.equal(isPristineDraft({ ...base, title: "Mi viaje" }), false);
  assert.equal(isPristineDraft({ ...base, excerpt: "Hola" }), false);
  assert.equal(isPristineDraft({ ...base, blockCount: 1 }), false);
  assert.equal(isPristineDraft({ ...base, scheduledPublishAt: "2026-11-01T10:00:00Z" }), false);
  assert.equal(isPristineDraft({ ...base, metaTitle: "SEO" }), false);
  assert.equal(isPristineDraft({ ...base, coverImageUrl: "https://x/y.jpg" }), false);
  assert.equal(isPristineDraft({ ...base, categoryId: "c1" }), false);
});

test("a published post is never pristine", () => {
  assert.equal(isPristineDraft({ ...base, status: "published" }), false);
});
