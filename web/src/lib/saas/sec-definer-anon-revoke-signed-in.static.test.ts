/**
 * Pins 20261231390200_sec_definer_anon_revoke_signed_in_rpcs.sql.
 *
 * These SECURITY DEFINER RPCs DO have .rpc() callers, but every caller is a
 * signed-in session client or the service-role client (public /contact and
 * /directory submit via createServiceRoleClient). No logged-out page calls them
 * with an anon key, so anon + PUBLIC lose EXECUTE; authenticated keeps it.
 * This test fails if a later migration re-grants EXECUTE to anon or PUBLIC.
 *
 * Run: npx tsx --test src/lib/saas/sec-definer-anon-revoke-signed-in.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SURFACE_FUNCTIONS } from "./public-surface-functions";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "..", "supabase", "migrations");
const MIGRATION = "20261231390200_sec_definer_anon_revoke_signed_in_rpcs.sql";

export const ANON_REVOKED_DEFINER_RPCS: readonly string[] = [
  "engine_add_requirement_group",
  "engine_add_secondary_coordinator",
  "engine_assign_participant_to_group",
  "engine_convert_to_booking",
  "engine_promote_to_primary",
  "engine_remove_requirement_group",
  "engine_remove_secondary_coordinator",
  "engine_update_requirement_group",
  "inquiry_audit_emit",
  "inquiry_audit_emit_field",
  "record_phase5_audit",
  "set_primary_agency_domain",
];

const sql = () => readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8");

test("migration revokes every listed function from PUBLIC and anon, keeps authenticated", () => {
  const s = sql();
  assert.match(s, /FROM PUBLIC, anon'/);
  assert.ok(!/FROM PUBLIC, anon, authenticated/.test(s), "signed-in callers need authenticated");
  assert.match(s, /GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role/);
  for (const n of ANON_REVOKED_DEFINER_RPCS) assert.ok(s.includes(`'${n}'`), `migration must revoke ${n}`);
  assert.match(s, /has_function_privilege\('anon'/, "must assert anon is closed");
  assert.match(s, /NOT has_function_privilege\('authenticated'/, "must assert authenticated still open");
});

test("revoked set never overlaps the anon public surface", () => {
  for (const n of ANON_REVOKED_DEFINER_RPCS) {
    assert.ok(!PUBLIC_SURFACE_FUNCTIONS.includes(n), `${n} is a public-surface function`);
  }
});

test("no later migration re-grants EXECUTE on a revoked function to anon or PUBLIC", () => {
  const later = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && f > MIGRATION);
  for (const f of later) {
    const body = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    for (const stmt of body.match(/GRANT\s+(EXECUTE|ALL)[\s\S]*?;/gi) ?? []) {
      if (!/\b(anon|PUBLIC)\b/i.test(stmt)) continue;
      for (const n of ANON_REVOKED_DEFINER_RPCS) {
        assert.ok(!new RegExp(`\\b${n}\\b`).test(stmt), `${f} re-grants ${n}:\n${stmt}`);
      }
    }
  }
});
