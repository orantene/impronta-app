/**
 * Static assertions over `20261231357000_demo_nickname_host_aliases.sql`.
 * GRK-089 shorthand demo hosts must resolve via talent_site_subdomain_lookup.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations/20261231357000_demo_nickname_host_aliases.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("nickname aliases map GRK-089 hosts to featured demo slugs", () => {
  assert.match(MIGRATION, /'alba', 'alba-demo'/);
  assert.match(MIGRATION, /alba-nail-artist/);
  assert.match(MIGRATION, /'linh', 'linh-demo'/);
  assert.match(MIGRATION, /linh-tran/);
  assert.match(MIGRATION, /'sofia-nails', 'sofia-nails-demo'/);
  assert.match(MIGRATION, /camila-nails/);
});

test("nickname migration keeps prior design vanity aliases", () => {
  assert.match(MIGRATION, /maison-v2-demo/);
  assert.match(MIGRATION, /folio-demo/);
  assert.match(MIGRATION, /gridline-demo/);
});

test("lookup keeps anon EXECUTE and is_demo return shape", () => {
  assert.match(MIGRATION, /drop function if exists public\.talent_site_subdomain_lookup\(text\)/i);
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

test("platform_subdomain_label_taken reserves nickname labels", () => {
  assert.match(MIGRATION, /'alba', 'alba-demo'/);
  assert.match(MIGRATION, /'linh', 'linh-demo'/);
  assert.match(MIGRATION, /'sofia-nails', 'sofia-nails-demo'/);
  assert.match(
    MIGRATION,
    /grant execute on function public\.platform_subdomain_label_taken\(text, uuid, uuid\)\s*to authenticated, service_role/i,
  );
});
