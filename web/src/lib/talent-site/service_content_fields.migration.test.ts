import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SERVICE_CONTENT_COLUMNS, SERVICE_PRESENTATION_MODES } from "./service-content-fields";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const FILE = "20261231415800_service_content_fields.sql";
const sql = readFileSync(join(ROOT, "_pending_pm", FILE), "utf8");
const body = sql.replace(/--.*$/gm, "");

test("TUL-1272 C1 migration is HELD in _pending_pm, not in the applied folder", () => {
  assert.equal(readdirSync(ROOT).includes(FILE), false);
});

test("every content column is added with IF NOT EXISTS (idempotent, additive)", () => {
  for (const col of SERVICE_CONTENT_COLUMNS) {
    assert.match(body, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s`), col);
  }
  assert.doesNotMatch(body, /DROP COLUMN|DROP TABLE|ALTER COLUMN|^\s*UPDATE\b|DELETE FROM|INSERT INTO/im);
  assert.doesNotMatch(body, /\bGRANT\b|\bREVOKE\b|CREATE POLICY|DROP POLICY/i);
});

test("checks are guarded and indexes use IF NOT EXISTS so a second run is a no-op", () => {
  const adds = body.match(/ADD CONSTRAINT (\w+)/g) ?? [];
  assert.equal(adds.length, 3);
  for (const a of adds) {
    const name = a.replace("ADD CONSTRAINT ", "");
    assert.match(body, new RegExp(`conname = '${name}'`), name);
  }
  assert.equal((body.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g) ?? []).length, 0);
});

test("presentation check lists exactly the code's modes; slug unique per owner scope", () => {
  const modes = /presentation IN \(([^)]*)\)/.exec(body)?.[1].split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual(modes, [...SERVICE_PRESENTATION_MODES]);
  assert.match(body, /\(talent_profile_id, slug\)\s+WHERE owner_kind = 'talent' AND slug IS NOT NULL/);
  assert.match(body, /\(tenant_id, slug\)\s+WHERE owner_kind = 'workspace' AND slug IS NOT NULL/);
});
