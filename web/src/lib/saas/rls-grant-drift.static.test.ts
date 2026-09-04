/**
 * rls-grant-drift.static.test.ts — pin the two grant-drift classes that have
 * each already cost this repo a real hole.
 *
 * CLASS 1 — "revoked anon, thought it was closed".
 * `CREATE FUNCTION` grants EXECUTE to PUBLIC by default, and PUBLIC is a
 * SEPARATE grant from any role grant. `REVOKE ... FROM anon` therefore does
 * nothing while the PUBLIC entry survives. 20261117000000 made exactly this
 * mistake on the media predicates and the audit recorded the hole as closed;
 * 20261120000000 had to reopen and actually fix it. Any migration that revokes
 * a function must name PUBLIC.
 *
 * CLASS 2 — "revoked an RLS policy predicate".
 * A function referenced from a USING / WITH CHECK clause is evaluated as the
 * QUERYING role. Revoking EXECUTE from anon/authenticated does not harden the
 * policy, it makes every query against that table fail with "permission denied
 * for function". `is_staff_of_tenant` alone is a predicate in 181 live
 * policies, so revoking it is a platform-wide outage, not a fix. These names
 * must never appear on the left of a REVOKE.
 *
 * Technique: readFileSync over supabase/migrations + assert on statement shape.
 * Deterministic, no DB connection, tsc-clean. Does NOT fix — it fails loudly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SURFACE_FUNCTIONS } from "./public-surface-functions";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "..", "supabase", "migrations");

const REVOKE_MIGRATION = "20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs.sql";
const VIEW_MIGRATION = "20261125000000_restore_view_invoker_and_matview_grants.sql";

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

/**
 * Functions that are RLS policy predicates in the live schema. Revoking EXECUTE
 * on any of these from an API role breaks RLS evaluation on every table whose
 * policy references it. The count is the number of live policies referencing
 * that predicate at the time 20261124000000 was authored.
 */
const POLICY_PREDICATES: ReadonlyArray<readonly [string, number]> = [
  ["is_staff_of_tenant", 181],
  ["is_active_staff_of_tenant", 19],
  ["is_talent_profile_owner", 9],
  ["is_inquiry_coordinator", 6],
  ["talent_is_site_visible_anywhere", 4],
  ["is_booking_coordinator", 3],
  ["talent_profile_has_max", 3],
  ["talent_has_public_roster", 1],
];

/** Functions the app reaches with an anon-key client. Revoking anon blanks them. */
// Moved to its own module so the DB-backed complement check
// (scripts/check-anon-function-grants.mjs) reads the SAME list. Two copies of a
// security boundary is two boundaries, and they drift.

test("every function REVOKE in the hardening migration names PUBLIC", () => {
  const sql = readMigration(REVOKE_MIGRATION);
  const revokes = sql.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) ?? [];

  assert.ok(
    revokes.length > 20,
    `expected the hardening migration to revoke many functions, found ${revokes.length}`,
  );

  for (const stmt of revokes) {
    assert.match(
      stmt,
      /FROM\s+PUBLIC\b/,
      `REVOKE without PUBLIC is a no-op while the default PUBLIC grant survives:\n${stmt}`,
    );
  }
});

test("the two originally-drifted service-role RPCs are revoked from PUBLIC", () => {
  const sql = readMigration(REVOKE_MIGRATION);

  for (const fn of ["rotate_unsubscribe_token", "find_auth_user_identity_by_email"]) {
    const stmt = (sql.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) ?? []).find((s) =>
      s.includes(`public.${fn}(`),
    );
    assert.ok(stmt, `expected a REVOKE for public.${fn}`);
    assert.match(stmt, /FROM\s+PUBLIC,\s*anon,\s*authenticated/, `${fn} must lose all three API grants`);
  }
});

test("engine_emit_notification loses every API grant", () => {
  // Read in full during the audit: four NULL checks then INSERT INTO
  // public.notifications. No auth.uid(), no tenant check. SECURITY DEFINER, so
  // it bypasses RLS. Anonymous execute = forge a notification to any user.
  const sql = readMigration(REVOKE_MIGRATION);
  const stmt = (sql.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) ?? []).find((s) =>
    s.includes("public.engine_emit_notification("),
  );
  assert.ok(stmt, "expected a REVOKE for public.engine_emit_notification");
  assert.match(stmt, /FROM\s+PUBLIC,\s*anon,\s*authenticated/);
});

test("no RLS policy predicate loses its role grant", () => {
  // `REVOKE ... FROM PUBLIC` on a predicate is CORRECT and already used by
  // 20260615025530: it drops the implicit PUBLIC grant while an explicit
  // `GRANT EXECUTE ... TO authenticated` keeps the querying role working.
  // What must never happen is stripping `anon` / `authenticated` without
  // re-granting — that is what turns RLS evaluation into a permission error.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

  for (const file of files) {
    const sql = readMigration(file);
    const revokes = sql.match(/REVOKE[\s\S]*?;/g) ?? [];

    for (const stmt of revokes) {
      const strippedRoles = /\bFROM\b[^;]*\b(anon|authenticated)\b/.test(stmt);
      if (!strippedRoles) continue;

      for (const [predicate, policyCount] of POLICY_PREDICATES) {
        if (!new RegExp(`\\bpublic\\.${predicate}\\s*\\(`).test(stmt)) continue;

        const regranted = new RegExp(
          `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${predicate}\\s*\\([^)]*\\)\\s*TO\\b`,
        ).test(sql);

        assert.ok(
          regranted,
          `${file} revokes ${predicate} from a role without re-granting it. That predicate ` +
            `appears in ~${policyCount} live RLS policies, and policy predicates are ` +
            `evaluated as the QUERYING role — so this does not harden anything, it makes ` +
            `every query on those tables fail with "permission denied for function".\n${stmt}`,
        );
      }
    }
  }
});

test("anon-key public surfaces keep their EXECUTE grant", () => {
  const sql = readMigration(REVOKE_MIGRATION);
  const revokes = sql.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) ?? [];

  for (const fn of PUBLIC_SURFACE_FUNCTIONS) {
    const offending = revokes.find((s) => new RegExp(`\\bpublic\\.${fn}\\s*\\(`).test(s));
    assert.ok(
      !offending,
      `${fn} is called with createPublicSupabaseClient (anon key). Revoking it blanks ` +
        `that surface for logged-out visitors.\n${offending ?? ""}`,
    );
  }
});

test("the hardening migration asserts its own outcome", () => {
  const sql = readMigration(REVOKE_MIGRATION);
  // db:push must not be able to silently succeed against a schema where the
  // revoke did not take. Both halves are required: has_table_privilege reports
  // GRANTS and ignores RLS, so neither check alone proves the table is closed.
  assert.match(sql, /RAISE EXCEPTION/, "migration must fail loudly on a bad outcome");
  assert.match(sql, /has_function_privilege\(\s*'anon'/, "must assert anon lost EXECUTE");
  assert.match(sql, /has_function_privilege\(\s*'service_role'/, "must assert service_role kept EXECUTE");
  assert.match(sql, /relrowsecurity/, "must assert RLS is actually enabled, not just that grants are gone");
});

test("view migration restores invoker without touching the talent line-item view", () => {
  const sql = readMigration(VIEW_MIGRATION);

  assert.match(
    sql,
    /ALTER VIEW public\.talent_skills_resolved SET \(security_invoker = on\)/,
    "talent_skills_resolved must be flipped back to invoker",
  );
  // 20260615194712 excluded this view by name: it is the talent-self path to a
  // talent's own offer line-item costs. Flipping it to invoker blanks that UI.
  assert.ok(
    !/ALTER VIEW public\.inquiry_offer_line_items_talent_view SET \(security_invoker/.test(sql),
    "inquiry_offer_line_items_talent_view must stay SECURITY DEFINER",
  );
  // The public directory reads this matview with the anon key.
  assert.match(
    sql,
    /GRANT SELECT ON public\.talent_discover_index TO anon/,
    "anon must keep SELECT on the discover catalog or the public directory goes blank",
  );
});
