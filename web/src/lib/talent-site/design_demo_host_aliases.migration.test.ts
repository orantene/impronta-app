/**
 * Static assertions over `20261231345000_design_demo_host_aliases.sql`.
 *
 * Finished-gallery design vanity hosts (`maison-v2-demo`, `folio-demo`,
 * `gridline-demo`) must resolve via `talent_site_subdomain_lookup` to each
 * design's featured demo — not via `agency_domains` (which would mis-route).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations/20261231345000_design_demo_host_aliases.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("design vanity aliases map finished designs to featured demo slugs", () => {
  assert.match(MIGRATION, /maison-v2-demo/);
  assert.match(MIGRATION, /alba-nail-artist/);
  assert.match(MIGRATION, /folio-demo/);
  assert.match(MIGRATION, /mateo-ferrer/);
  assert.match(MIGRATION, /gridline-demo/);
  assert.match(MIGRATION, /alex-trevino/);
  assert.match(MIGRATION, /design_alias as \(/i);
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

test("platform_subdomain_label_taken reserves design vanity labels", () => {
  assert.match(MIGRATION, /'maison-v2', 'maison-v2-demo'/);
  assert.match(MIGRATION, /'folio', 'folio-demo'/);
  assert.match(MIGRATION, /'gridline', 'gridline-demo'/);
  assert.match(
    MIGRATION,
    /grant execute on function public\.platform_subdomain_label_taken\(text, uuid, uuid\)\s*to authenticated, service_role/i,
  );
});
