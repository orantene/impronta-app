import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations/20261231282000_talent_site_domain_requires_max.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("the custom-domain lookup is re-created with the same signature", () => {
  assert.match(
    MIGRATION,
    /create or replace function public\.talent_site_domain_lookup\(p_host text\)/i,
  );
  assert.match(MIGRATION, /returns table \(\s*talent_profile_id uuid,\s*site_slug text,\s*domain text\s*\)/i);
  assert.match(MIGRATION, /language sql/i);
  assert.match(MIGRATION, /security definer/i);
  assert.match(MIGRATION, /set search_path to 'public'/i);
});

test("a custom domain now requires the talent to hold Max (Web Office)", () => {
  assert.match(
    MIGRATION,
    /and public\.talent_profile_has_max\(d\.talent_profile_id\)/i,
    "the lookup must reuse the existing talent_profile_has_max helper",
  );
});

test("the pre-existing predicates all survive, so nothing else widens", () => {
  for (const predicate of [
    /lower\(d\.domain\) = lower\(p_host\)/i,
    /d\.status = 'active'/i,
    /tp\.is_publicly_hidden = false/i,
    /ts\.site_published_at is not null/i,
  ]) {
    assert.match(MIGRATION, predicate, `missing predicate ${predicate}`);
  }
});

test("execute stays granted to the anon + authenticated API roles", () => {
  // The public host resolver calls this through the anon client; dropping the
  // grant would 404 every custom domain, Max or not.
  assert.match(
    MIGRATION,
    /grant execute on function public\.talent_site_domain_lookup\(text\) to anon, authenticated;/i,
  );
});

test("the subdomain path is untouched: no other function is redefined", () => {
  // Statement starts only, so the prose in the header comment does not count.
  const created = MIGRATION.match(/^create (or replace )?function/gim) ?? [];
  assert.equal(created.length, 1, "exactly one function is re-created");
});

test("migration is additive and idempotent: no drops, no DML, no table changes", () => {
  assert.doesNotMatch(MIGRATION, /drop table/i);
  assert.doesNotMatch(MIGRATION, /drop column/i);
  assert.doesNotMatch(MIGRATION, /drop function/i);
  assert.doesNotMatch(MIGRATION, /\bdelete from\b/i);
  assert.doesNotMatch(MIGRATION, /\binsert into\b/i);
  assert.doesNotMatch(MIGRATION, /\bupdate public\./i);
  assert.doesNotMatch(MIGRATION, /alter table/i);
});

test("the statement is wrapped in a transaction", () => {
  assert.match(MIGRATION, /^begin;/im);
  assert.match(MIGRATION, /^commit;/im);
});
