/**
 * Static assertions over `20261231343000_talent_demo_host_suffix.sql`.
 *
 * Demo public hosts are `{site_slug}-demo.<apex>`. The migration must keep the
 * lookup RPC public (anon EXECUTE) and must reserve the `-demo` host label in
 * the shared namespace predicate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations/20261231343000_talent_demo_host_suffix.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("talent_site_subdomain_lookup is dropped and recreated with is_demo", () => {
  assert.match(MIGRATION, /drop function if exists public\.talent_site_subdomain_lookup\(text\)/i);
  assert.match(
    MIGRATION,
    /create function public\.talent_site_subdomain_lookup\(p_slug text\)/i,
  );
  assert.match(
    MIGRATION,
    /returns table \(\s*talent_profile_id uuid,\s*site_slug text,\s*is_demo boolean\s*\)/i,
  );
  assert.match(
    MIGRATION,
    /grant execute on function public\.talent_site_subdomain_lookup\(text\) to anon, authenticated/i,
  );
  assert.match(
    MIGRATION,
    /comment on function public\.talent_site_subdomain_lookup\(text\) is[\s\S]*INTENTIONAL PUBLIC SURFACE/i,
  );
});

test("lookup resolves exact site_slug and {site_slug}-demo for is_demo profiles", () => {
  assert.match(MIGRATION, /lower\(ts\.site_slug\) = label\.v/i);
  assert.match(MIGRATION, /label\.v like '%-demo'/i);
  assert.match(MIGRATION, /left\(label\.v, char_length\(label\.v\) - 5\)/i);
  assert.match(MIGRATION, /tp\.is_demo = true/i);
  assert.match(MIGRATION, /ts\.site_published_at is not null/i);
});

test("platform_subdomain_label_taken reserves demo {base}-demo hosts", () => {
  assert.match(
    MIGRATION,
    /create or replace function public\.platform_subdomain_label_taken\(/i,
  );
  assert.match(MIGRATION, /v_label like '%-demo'/i);
  assert.match(MIGRATION, /tp\.is_demo = true/i);
  assert.match(
    MIGRATION,
    /revoke all on function public\.platform_subdomain_label_taken\(text, uuid, uuid\) from public/i,
  );
  assert.match(
    MIGRATION,
    /grant execute on function public\.platform_subdomain_label_taken\(text, uuid, uuid\)\s*to authenticated, service_role/i,
  );
});
