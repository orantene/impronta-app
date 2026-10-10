/**
 * Static assertions over `20261231357000_demo_nickname_host_aliases.sql`.
 *
 * QA nickname hosts (`alba-demo`, `linh-demo`, `sofia-nails-demo`) must resolve
 * via `talent_site_subdomain_lookup` to each featured demo — not via
 * `agency_domains` (which would mis-route).
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

test("QA nickname aliases map short labels to featured demo slugs", () => {
  assert.match(MIGRATION, /alba-demo/);
  assert.match(MIGRATION, /alba-nail-artist/);
  assert.match(MIGRATION, /linh-demo/);
  assert.match(MIGRATION, /linh-tran/);
  assert.match(MIGRATION, /sofia-nails-demo/);
  assert.match(MIGRATION, /sofia-rinaldi/);
  assert.match(MIGRATION, /design_alias as \(/i);
});

test("nickname migration keeps prior design vanity maps", () => {
  assert.match(MIGRATION, /maison-v2-demo/);
  assert.match(MIGRATION, /folio-demo/);
  assert.match(MIGRATION, /gridline-demo/);
  assert.match(MIGRATION, /mateo-ferrer/);
  assert.match(MIGRATION, /alex-trevino/);
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
