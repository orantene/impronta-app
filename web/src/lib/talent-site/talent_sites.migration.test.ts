import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations/20261001000000_talent_sites.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("talent_sites migration defines storage, helpers, RLS, and public RPC", () => {
  assert.match(MIGRATION, /create table public\.talent_sites/i);
  assert.match(MIGRATION, /create table public\.talent_site_revisions/i);
  assert.match(MIGRATION, /is_talent_profile_owner/i);
  assert.match(MIGRATION, /talent_profile_has_max/i);
  assert.match(MIGRATION, /talent_public_site_for_profile_code/i);
  assert.match(
    MIGRATION,
    /grant execute on function public\.talent_public_site_for_profile_code\(text\) to anon, authenticated/i,
  );
  assert.match(MIGRATION, /security definer/i);
  assert.match(MIGRATION, /talent_sites_owner_select/i);
  assert.match(MIGRATION, /talent_site_revisions_owner_insert/i);
});
