/**
 * Static assertions over `20261231346000_client_account_foundation.sql`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = readFileSync(
  join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../supabase/migrations/20261231346000_client_account_foundation.sql",
  ),
  "utf8",
);

test("client_profiles gains consent + locale columns, opt-in defaults off", () => {
  assert.match(MIGRATION, /to_regclass\('public\.client_profiles'\)/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS preferred_locale text/);
});

test("client_auth_events shape, method check and index", () => {
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS public\.client_auth_events/);
  assert.match(MIGRATION, /user_id uuid NOT NULL REFERENCES auth\.users \(id\) ON DELETE CASCADE/);
  assert.match(MIGRATION, /host text NOT NULL/);
  assert.match(MIGRATION, /method IN \('email_code', 'google', 'password', 'sso'\)/);
  assert.match(MIGRATION, /\(user_id, created_at DESC\)/);
});

test("RLS on, owner select only, no write policy, no anon privileges", () => {
  assert.match(MIGRATION, /ALTER TABLE public\.client_auth_events ENABLE ROW LEVEL SECURITY/);
  assert.match(MIGRATION, /FOR SELECT\s+TO authenticated\s+USING \(user_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.doesNotMatch(MIGRATION, /FOR (INSERT|UPDATE|DELETE|ALL)/);
  assert.match(MIGRATION, /REVOKE ALL ON public\.client_auth_events FROM anon/);
});
