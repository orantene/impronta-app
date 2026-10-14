import assert from "node:assert/strict";
import { test } from "node:test";

import { effectiveReviewDesign } from "./maison-review-effective";

const snap = (slug: string | null) => ({ theme_design_slug: slug });

test("live pending: Review names the pending design, flags the draft, Undo reverts to the live design", () => {
  const e = effectiveReviewDesign(
    { designSlug: "maison-v2", lookSlug: "sage" },
    {
      kind: "live_pending",
      source: "live_change",
      created_at: "2026-10-13T00:00:00Z",
      proposed: { designSlug: "folio", lookSlug: null, paletteKey: null, contentMode: "mine", demoSlug: "x" },
      liveBaseline: { theme_design_slug: "maison-v2" },
    },
    true,
  );
  assert.equal(e.designSlug, "folio");
  assert.equal(e.unpublishedDraft, true);
  assert.equal(e.undoKind, "live");
  assert.equal(e.undoRevertsToSlug, "maison-v2");
  assert.equal(e.contentMode, "mine");
});

test("never-published apply: row slug is the draft; Undo reverts to the snapshot design", () => {
  const e = effectiveReviewDesign(
    { designSlug: "folio", lookSlug: null },
    { source: "apply", created_at: "t", previous: snap("maison-v2"), applied: {} },
    false,
  );
  assert.equal(e.designSlug, "folio");
  assert.equal(e.unpublishedDraft, true);
  assert.equal(e.undoKind, "snapshot");
  assert.equal(e.undoRevertsToSlug, "maison-v2");
});

test("no pending: nothing flagged, no Undo", () => {
  const e = effectiveReviewDesign({ designSlug: "folio", lookSlug: null }, null, true);
  assert.equal(e.unpublishedDraft, false);
  assert.equal(e.undoKind, null);
});
