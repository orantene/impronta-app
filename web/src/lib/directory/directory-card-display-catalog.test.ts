import test from "node:test";
import assert from "node:assert/strict";

import { pickEffectiveDirectoryCardFieldRows } from "@/lib/directory/directory-card-display-catalog";

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
