import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The closed list of TUL-1324 (a), restated: this PR must not depend on it (no stacking).
const CLOSED_WORDS = ["services", "tours", "menu", "classes", "spaces"];

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const FILE = "20261231418800_offering_slugs_supersedes_415800_tul1324.sql";
const sql = readFileSync(join(ROOT, "_pending_pm", FILE), "utf8");
const body = sql.replace(/--.*$/gm, "");

test("held in _pending_pm, well formed, and says it supersedes 415800", () => {
  assert.equal(readdirSync(ROOT).includes(FILE), false);
  assert.ok(readdirSync(join(ROOT, "_pending_pm")).includes(FILE));
  assert.match(FILE, /^\d{14}_[a-z0-9_]+\.sql$/);
  assert.match(sql, /SUPERSEDES 20261231415800_service_content_fields\.sql/);
  // No dependence on 415800 still existing (the PM removes it) or on version order.
});

test("no slug columns on talent_offerings; the table carries per-locale slugs and history", () => {
  assert.doesNotMatch(body, /ADD COLUMN IF NOT EXISTS slug\b|slug_history/);
  assert.match(body, /CREATE TABLE IF NOT EXISTS public\.offering_slugs/);
  assert.match(body, /UNIQUE INDEX IF NOT EXISTS offering_slugs_scope_locale_slug_uniq\s+ON public\.offering_slugs \(owner_scope, locale, slug\)/);
  assert.match(body, /\(offering_id, locale\)\s+WHERE is_current/);
});

test("service role only: RLS on, no policies, anon and authenticated revoked", () => {
  assert.match(body, /ENABLE ROW LEVEL SECURITY/);
  assert.match(body, /REVOKE ALL ON public\.offering_slugs FROM anon, authenticated/);
  assert.doesNotMatch(body, /CREATE POLICY|GRANT /i);
});

test("additive and idempotent: no destructive statements, no backfill", () => {
  assert.doesNotMatch(body, /DROP |DELETE FROM|TRUNCATE|^\s*UPDATE\b|INSERT INTO/im);
  assert.equal((body.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g) ?? []).length, 0);
});

test("the word check lists exactly the code's closed list; rollback is in the header", () => {
  const m = /catalog_path_word IN \(([^)]*)\)/.exec(body);
  assert.deepEqual(
    m?.[1].split(",").map((s) => s.trim().replace(/'/g, "")),
    CLOSED_WORDS,
  );
  assert.match(sql, /-- Rollback[\s\S]*DROP TABLE IF EXISTS public\.offering_slugs/);
});
