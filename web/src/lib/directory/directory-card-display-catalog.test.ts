import test from "node:test";
import assert from "node:assert/strict";

import { pickEffectiveDirectoryCardFieldRows } from "@/lib/directory/directory-card-display-catalog";
import { bKeyToAKey, bKindToValueType } from "@/lib/field-engine/read-source-directory-cards";

type Row = Parameters<typeof pickEffectiveDirectoryCardFieldRows>[0][number];

function row(overrides: Partial<Row>): Row {
  return {
    id: "def-1",
    key: "skills",
    value_type: "chips",
    taxonomy_kind: null,
    sort_order: 10,
    label_en: "Skills",
    label_es: "Habilidades",
    tenant_id: null,
    card_visible: true,
    active: true,
    archived_at: null,
    internal_only: false,
    public_visible: true,
    profile_visible: true,
    ...overrides,
  };
}

test("directory card catalog: tenant-local row overrides canonical row by key", () => {
  const rows = [
    row({ id: "canon-skills", key: "skills", tenant_id: null }),
    row({ id: "tenant-skills", key: "skills", tenant_id: "tenant-1", card_visible: false }),
    row({ id: "canon-height", key: "height_cm", tenant_id: null, value_type: "number" }),
  ];

  const effective = pickEffectiveDirectoryCardFieldRows(rows, "tenant-1");
  const byKey = new Map(effective.map((r) => [r.key, r.id]));

  assert.equal(byKey.get("skills"), "tenant-skills");
  assert.equal(byKey.get("height_cm"), "canon-height");
});

test("directory card catalog: canonical rows are used when tenant override is absent", () => {
  const rows = [
    row({ id: "canon-fit", key: "fit_labels", tenant_id: null }),
    row({ id: "other-tenant-fit", key: "fit_labels", tenant_id: "tenant-2", card_visible: false }),
  ];

  const effective = pickEffectiveDirectoryCardFieldRows(rows, "tenant-1");
  assert.equal(effective.length, 1);
  assert.equal(effective[0]?.id, "canon-fit");
});

test("directory card catalog: rows from unrelated tenants are ignored", () => {
  const rows = [
    row({ id: "foreign-only", key: "eye_color", tenant_id: "tenant-9" }),
  ];
  const effective = pickEffectiveDirectoryCardFieldRows(rows, "tenant-1");
  assert.deepEqual(effective, []);
});

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
