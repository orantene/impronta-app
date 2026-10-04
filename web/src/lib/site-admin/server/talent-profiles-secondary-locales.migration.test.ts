import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = readFileSync(
  join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../../supabase/migrations/20261231299510_talent_profiles_secondary_locales.sql",
  ),
  "utf8",
);

test("secondary_locales migration is additive with an empty-array default", () => {
  assert.match(
    MIGRATION,
    /alter table public\.talent_profiles\s+add column if not exists secondary_locales text\[\] not null default '\{\}'::text\[\]/i,
  );
  assert.match(MIGRATION, /comment on column public\.talent_profiles\.secondary_locales/i);
  assert.match(MIGRATION, /preferred_locale/);
  assert.doesNotMatch(MIGRATION, /\bdrop\b/i);
});
