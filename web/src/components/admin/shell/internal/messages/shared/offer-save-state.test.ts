import assert from "node:assert/strict";
import { test } from "node:test";

import { classifySaveError, canSendOffer, type OfferSaveState } from "./offer-save-state";

test("classifySaveError buckets the auth message the pipeline returns", () => {
  const c = classifySaveError("You must be signed in.");
  assert.equal(c.kind, "auth");
  assert.equal(c.retryable, true);
});

test("classifySaveError is case + wrapping insensitive", () => {
  assert.equal(classifySaveError("Error: LINE_ITEM_TALENT_REQUIRED").kind, "line_talent_required");
  assert.equal(classifySaveError("engine: version_conflict on offer").kind, "conflict");
  assert.equal(classifySaveError("Too many saves — rate_limited").kind, "rate_limited");
});

test("classifySaveError distinguishes not-editable / empty / not-found", () => {
  assert.equal(classifySaveError("offer_not_editable").kind, "not_editable");
  assert.equal(classifySaveError("post_booking_immutable").kind, "not_editable");
  assert.equal(classifySaveError("empty_offer").kind, "empty");
  assert.equal(classifySaveError("Offer not found in this workspace.").kind, "not_found");
});

test("classifySaveError falls back to unknown (retryable) on empty / novel", () => {
  assert.equal(classifySaveError("").kind, "unknown");
  assert.equal(classifySaveError(null).kind, "unknown");
  assert.equal(classifySaveError("kaboom 502").kind, "unknown");
  assert.equal(classifySaveError("kaboom").retryable, true);
});

const saved = (n = 0): OfferSaveState => ({ status: "saved", at: n });

test("canSendOffer blocks while saving / on error / when empty", () => {
  assert.equal(canSendOffer({ state: { status: "saving" }, editorLineCount: 3, editorTotal: 100, lastSavedLineCount: 3, lastSavedTotal: 100 }).ok, false);
  assert.equal(canSendOffer({ state: { status: "error", cls: classifySaveError("x"), rawError: "x" }, editorLineCount: 3, editorTotal: 100, lastSavedLineCount: 3, lastSavedTotal: 100 }).ok, false);
  assert.equal(canSendOffer({ state: saved(), editorLineCount: 0, editorTotal: 0, lastSavedLineCount: 0, lastSavedTotal: 0 }).ok, false);
});

test("canSendOffer blocks when the editor drifted from the last save", () => {
  // Edited a line after saving: counts match but total moved.
  const r = canSendOffer({ state: saved(), editorLineCount: 3, editorTotal: 3800, lastSavedLineCount: 3, lastSavedTotal: 3200 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reasonKey, /Unsaved$/);
});

test("canSendOffer allows a clean saved state that matches the editor", () => {
  assert.equal(canSendOffer({ state: saved(), editorLineCount: 3, editorTotal: 3800, lastSavedLineCount: 3, lastSavedTotal: 3800 }).ok, true);
});
