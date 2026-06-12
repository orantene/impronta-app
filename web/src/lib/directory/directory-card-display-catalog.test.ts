import test from "node:test";
import assert from "node:assert/strict";

import { bKeyToAKey, bKindToValueType } from "@/lib/field-engine/read-source-directory-cards";

// NOTE (T3.2b): the `pickEffectiveDirectoryCardFieldRows` tenant-override merge
// helper was removed — the per-tenant `field_definitions.tenant_id` override leg
// is gone (0 prod override rows; visibility is gated on canonical System B). The
// three merge tests that exercised it were deleted along with the dead helper.

// ── T2.4 B-reader bridge helpers (pure, no DB) ─────────────────────────────

test("T2.4 bKeyToAKey: maps scalar B keys via NEW_TO_OLD_KEY", () => {
  // Scalar keys via the NEW_TO_OLD bridge
  assert.equal(bKeyToAKey("physical.height_cm"), "height_cm");
  assert.equal(bKeyToAKey("physical.body_type"), "body_type");
  assert.equal(bKeyToAKey("physical.hair_color"), "hair_color");
  assert.equal(bKeyToAKey("experience.level"), "experience_level");
  assert.equal(bKeyToAKey("media.website_url"), "website_url");
});

test("T2.4 bKeyToAKey: maps taxonomy direct-match B keys", () => {
  assert.equal(bKeyToAKey("fit_labels"), "fit_labels");
  assert.equal(bKeyToAKey("industries"), "industries");
  assert.equal(bKeyToAKey("tags"), "tags");
  assert.equal(bKeyToAKey("event_types"), "event_types");
  assert.equal(bKeyToAKey("languages"), "languages");
});

test("T2.4 bKeyToAKey: returns null for B-only keys (no legacy equivalent)", () => {
  // identity.gender is B-only (column-backed on talent_profiles.gender)
  assert.equal(bKeyToAKey("identity.gender"), null);
  // Unknown B keys
  assert.equal(bKeyToAKey("unknown.field"), null);
  assert.equal(bKeyToAKey("skills"), null); // deprecated in B, no bridge
});

test("T2.4 bKindToValueType: maps B kind to A value_type for card-visible fields", () => {
  assert.equal(bKindToValueType("number"), "number");
  assert.equal(bKindToValueType("multiselect"), "taxonomy_multi");
  assert.equal(bKindToValueType("chips"), "taxonomy_multi");
  assert.equal(bKindToValueType("select"), "taxonomy_single");
  assert.equal(bKindToValueType("text"), "text");
  assert.equal(bKindToValueType("textarea"), "textarea");
  assert.equal(bKindToValueType("toggle"), "boolean");
  assert.equal(bKindToValueType("date"), "date");
  // Unknown kind falls back to "text"
  assert.equal(bKindToValueType(null), "text");
  assert.equal(bKindToValueType("unknown"), "text");
});
