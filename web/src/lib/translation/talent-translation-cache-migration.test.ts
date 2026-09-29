import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const SQL = readFileSync(
  path.join(process.cwd(), "../supabase/migrations/20261231299530_talent_translation_cache.sql"),
  "utf8",
).toLowerCase();

test("talent_translation_cache: RLS is enabled", () => {
  assert.match(SQL, /alter table public\.talent_translation_cache enable row level security/);
});

test("talent_translation_cache: no policies (service-role only)", () => {
  assert.doesNotMatch(SQL, /create policy/);
  assert.doesNotMatch(SQL, /with check \(true\)/);
});

test("talent_translation_cache: anon and authenticated are revoked, never granted", () => {
  assert.match(SQL, /revoke all on table public\.talent_translation_cache from anon, authenticated/);
  assert.doesNotMatch(SQL, /\bgrant\b/);
});
