import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SERVICE_CONTENT_COLUMNS, SERVICE_CONTENT_DB_COLUMNS, SERVICE_PRESENTATION_MODES } from "./service-content-fields";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
// 415800 was superseded by 418800 (per-locale slugs in offering_slugs) and removed; this is the file that adds the columns.
const FILE = "20261231418800_offering_slugs_supersedes_415800_tul1324.sql";
const sql = readFileSync(join(ROOT, "_pending_pm", FILE), "utf8");
const body = sql.replace(/--.*$/gm, "");

test("the superseded 415800 migration is gone and the live one is HELD in _pending_pm", () => {
  assert.equal(existsSync(join(ROOT, "_pending_pm", "20261231415800_service_content_fields.sql")), false);
  assert.equal(readdirSync(ROOT).includes(FILE), false);
  assert.ok(readdirSync(join(ROOT, "_pending_pm")).includes(FILE));
});

test("the code reads exactly the columns the migration adds (slug and slug_history live in offering_slugs)", () => {
  assert.deepEqual(
    [...SERVICE_CONTENT_DB_COLUMNS],
    SERVICE_CONTENT_COLUMNS.filter((c) => c !== "slug" && c !== "slug_history"),
  );
  assert.ok(!(SERVICE_CONTENT_DB_COLUMNS as readonly string[]).includes("slug"));
  assert.ok(!(SERVICE_CONTENT_DB_COLUMNS as readonly string[]).includes("slug_history"));
  assert.doesNotMatch(body, /ADD COLUMN IF NOT EXISTS slug\b|slug_history/);
});

test("every content column is added with IF NOT EXISTS (idempotent, additive)", () => {
  for (const col of SERVICE_CONTENT_DB_COLUMNS) {
    assert.match(body, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s`), col);
  }
  assert.doesNotMatch(body, /DROP COLUMN|ALTER COLUMN|^\s*UPDATE\b|DELETE FROM|INSERT INTO/im);
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

test("presentation check lists exactly the code's modes", () => {
  const modes = /presentation IN \(([^)]*)\)/.exec(body)?.[1].split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual(modes, [...SERVICE_PRESENTATION_MODES]);
});
