import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = readFileSync(
  join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../supabase/migrations/20261231299520_talent_content_i18n_columns.sql",
  ),
  "utf8",
);

const COLUMNS: readonly (readonly [string, string])[] = [
  ["talent_faq_items", "question_i18n"],
  ["talent_faq_items", "answer_i18n"],
  ["talent_offering_variants", "label_i18n"],
  ["talent_offering_addons", "label_i18n"],
  ["talent_addon_groups", "name_i18n"],
  ["talent_offerings", "category_i18n"],
  ["talent_pages", "title_i18n"],
  ["talent_pages", "meta_title_i18n"],
  ["talent_pages", "meta_description_i18n"],
];

test("every content i18n column is added, idempotent, jsonb not null default {}", () => {
  for (const [table, column] of COLUMNS) {
    const block = new RegExp(
      `ALTER TABLE public\\.${table}[^;]*ADD COLUMN IF NOT EXISTS ${column} jsonb NOT NULL DEFAULT '\\{\\}'::jsonb`,
    );
    assert.match(MIGRATION, block, `${table}.${column}`);
  }
});

test("the migration is additive only (no drop, no backfill, no rewrite)", () => {
  const sql = MIGRATION.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.doesNotMatch(sql, /ALTER COLUMN/i);
});
