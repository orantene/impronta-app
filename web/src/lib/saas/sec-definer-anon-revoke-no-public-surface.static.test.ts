/**
 * Pins 20261231414000_sec_definer_anon_revoke_no_public_surface.sql (TUL-1013 re-audit).
 *
 * Staging showed anon could EXECUTE 26 SECURITY DEFINER functions: 9 on the
 * public surface and 17 not. This migration closes 9 signatures (8 names) that
 * nothing logged-out needs; the other 9 names are RLS policy helpers that anon
 * policies evaluate, recorded on POLICY_HELPER_FUNCTIONS with evidence.
 *
 * Run: npm run test:wt -- src/lib/saas/sec-definer-anon-revoke-no-public-surface.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { POLICY_HELPER_FUNCTIONS, PUBLIC_SURFACE_FUNCTIONS } from "./public-surface-functions";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "..", "supabase", "migrations");
const MIGRATION = "20261231414000_sec_definer_anon_revoke_no_public_surface.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8");

/** The four VOLATILE writers (three names, merge has two overloads). */
const WRITERS = ["guide_article_signal", "guide_search_miss", "merge_guest_session_to_client"] as const;
const STABLE_REVOKED = [
  "capacity_remaining_public",
  "is_booking_coordinator",
  "is_inquiry_coordinator",
  "is_super_admin",
  "resolve_public_tenant_by_slug",
] as const;
const REVOKED = [...WRITERS, ...STABLE_REVOKED];

test("the migration revokes anon AND PUBLIC from every listed function and keeps signed-in grants", () => {
  for (const n of REVOKED) assert.ok(sql.includes(`'${n}'`), `migration must revoke ${n}`);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon'/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role/);
  assert.ok(!/FROM PUBLIC, anon, authenticated/.test(sql), "signed-in callers keep authenticated");
});

test("the migration asserts its own outcome and the signature count", () => {
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.match(sql, /NOT has_function_privilege\('authenticated'/);
  assert.match(sql, /n < 9/, "8 names, 9 signatures (two merge overloads)");
});

test("nothing revoked is on the public surface or the policy-helper list", () => {
  for (const n of REVOKED) {
    assert.ok(!PUBLIC_SURFACE_FUNCTIONS.includes(n), `${n} is on PUBLIC_SURFACE_FUNCTIONS`);
    assert.ok(!POLICY_HELPER_FUNCTIONS.includes(n), `${n} is a policy helper anon needs`);
  }
});

test("the policy helpers anon keeps are listed, and the two lists do not overlap", () => {
  assert.deepEqual([...POLICY_HELPER_FUNCTIONS].sort(), [
    "is_active_staff_of_tenant",
    "is_agency_staff",
    "is_platform_admin",
    "is_staff_of_tenant",
    "is_talent_profile_owner",
    "talent_has_public_roster",
    "talent_is_site_visible_anywhere",
    "talent_profile_has_max",
    "talent_profile_has_pro_or_max",
  ]);
  for (const n of POLICY_HELPER_FUNCTIONS) assert.ok(!PUBLIC_SURFACE_FUNCTIONS.includes(n), n);
});

test("the allow-list names exactly the functions the app calls with the public client", () => {
  // Every rpc name reached by a createPublicSupabaseClient file must be on PUBLIC_SURFACE_FUNCTIONS,
  // and none of the revoked functions may be called by one.
  const SRC = join(HERE, "..", "..");
  const walk = (d: string, out: string[] = []): string[] => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(f.name) && !/\.test\./.test(f.name)) out.push(p);
    }
    return out;
  };
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!/createPublicSupabaseClient\(/.test(src)) continue;
    for (const n of REVOKED) {
      assert.ok(!new RegExp(`rpc\\(\\s*["']${n}["']`).test(src), `${file} calls ${n} from a file that builds an anon client`);
    }
  }
});

test("the four VOLATILE writers guard themselves: auth.uid() and a raise in the body, no truncate", () => {
  // Staging read-only check (2026-10-18): all four reference auth.uid(), raise an exception, none truncates.
  // Anon was reaching them only to be refused; with EXECUTE gone it does not reach them at all.
  // This pins the migration that REMOVES the door; the body guards are re-verified by check-anon-function-grants.mjs.
  assert.match(sql, /guide_article_signal/);
  assert.match(sql, /guide_search_miss/);
  assert.match(sql, /merge_guest_session_to_client/);
  assert.match(sql, /body requires auth\.uid\(\)/);
});

test("no later migration re-grants EXECUTE on a revoked function to anon or PUBLIC", () => {
  const later = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && f > MIGRATION);
  for (const f of later) {
    const body = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    for (const stmt of body.match(/GRANT\s+(EXECUTE|ALL)[\s\S]*?;/gi) ?? []) {
      if (!/\b(anon|PUBLIC)\b/i.test(stmt)) continue;
      for (const n of REVOKED) assert.ok(!new RegExp(`\\b${n}\\b`).test(stmt), `${f} re-grants ${n}:\n${stmt}`);
    }
  }
});

test("no later migration revokes anon from a policy helper without regranting it", () => {
  const later = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && f > MIGRATION);
  for (const f of later) {
    const body = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    for (const stmt of body.match(/REVOKE[\s\S]*?;/gi) ?? []) {
      if (!/\bFROM\b[^;]*\banon\b/i.test(stmt)) continue;
      for (const n of POLICY_HELPER_FUNCTIONS) {
        assert.ok(!new RegExp(`\\b${n}\\b`).test(stmt), `${f} revokes anon from policy helper ${n}: every logged-out read of its tables would fail`);
      }
    }
  }
});

test("anon-callable guard: the checker script reads the policy-helper list too", () => {
  const script = readFileSync(join(HERE, "..", "..", "..", "scripts", "check-anon-function-grants.mjs"), "utf8");
  assert.match(script, /POLICY_HELPER_FUNCTIONS/);
});
