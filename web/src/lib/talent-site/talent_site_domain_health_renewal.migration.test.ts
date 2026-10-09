import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations/20261231357000_talent_site_domain_health_renewal.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("health/renewal migration adds registrar expiry + notice stamps on talent_site_domains", () => {
  assert.match(MIGRATION, /alter table public\.talent_site_domains/i);
  for (const col of [
    "registrar_expires_at",
    "renewal_notice_30d_sent_at",
    "renewal_notice_7d_sent_at",
    "breakage_notified_at",
  ]) {
    assert.match(
      MIGRATION,
      new RegExp(`add column if not exists ${col} timestamptz`, "i"),
      `missing column ${col}`,
    );
  }
});

test("health/renewal migration is additive (no drop / no RLS rewrite)", () => {
  assert.doesNotMatch(MIGRATION, /\bdrop column\b/i);
  assert.doesNotMatch(MIGRATION, /\bdrop table\b/i);
  assert.doesNotMatch(MIGRATION, /enable row level security/i);
});
