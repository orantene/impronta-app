/**
 * TUL-1269 M1 (package E6, CALCULATION): workspace members cannot change their
 * own plan tier, seat limit, lifecycle status, Stripe payout account or
 * entitlements. Only the service role (webhooks, server actions after their own
 * role check) and platform admins can.
 *
 * Pins the HELD migration
 *   supabase/migrations/_pending_pm/20261231418100_plan_tier_entitlements_platform_only.sql
 *
 * Run: npx tsx --test src/lib/billing/plan-tier-entitlements-platform-only.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(
  HERE, "..", "..", "..", "..", "supabase", "migrations", "_pending_pm",
  "20261231418100_plan_tier_entitlements_platform_only.sql",
);
const sql = readFileSync(FILE, "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const PROTECTED = [
  "plan_tier",
  "talent_seat_limit",
  "status",
  "suspended_at",
  "suspended_reason",
  "stripe_account_id",
  "stripe_account_platform",
  "stripe_account_status",
  "stripe_charges_enabled",
  "stripe_payouts_enabled",
  "stripe_details_submitted",
  "stripe_account_synced_at",
];

function triggerFn(): string {
  const start = code.indexOf("CREATE OR REPLACE FUNCTION public.agencies_protect_platform_columns()");
  assert.ok(start >= 0, "trigger function must be defined");
  return code.slice(start, code.indexOf("$$;", start));
}

test("every platform-owned agencies column is compared OLD vs NEW", () => {
  const b = triggerFn();
  for (const col of PROTECTED) {
    assert.match(b, new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}\\b`), col);
  }
});

test("the guard fires only for direct client sessions that are not platform admins", () => {
  const b = triggerFn();
  // SECURITY INVOKER on purpose: current_user is the caller's role for a direct
  // PostgREST write, and the owner inside SECURITY DEFINER RPCs (plan override
  // reconcile) and for the service role, which keep working.
  assert.match(b, /SECURITY INVOKER/);
  assert.match(b, /current_user IN \('authenticated', 'anon'\)/);
  assert.match(b, /NOT public\.is_platform_admin\(\)/);
  assert.match(b, /RAISE EXCEPTION[\s\S]*USING ERRCODE = '42501'/);
});

test("the trigger is BEFORE UPDATE FOR EACH ROW on agencies", () => {
  assert.match(code, /DROP TRIGGER IF EXISTS agencies_protect_platform_columns ON public\.agencies;/);
  assert.match(
    code,
    /CREATE TRIGGER agencies_protect_platform_columns\s+BEFORE UPDATE ON public\.agencies\s+FOR EACH ROW EXECUTE FUNCTION public\.agencies_protect_platform_columns\(\);/,
  );
});

test("agency_entitlements: staff read, platform-admin-only writes", () => {
  assert.match(code, /DROP POLICY IF EXISTS agency_entitlements_tenant_staff ON public\.agency_entitlements;/);
  assert.match(
    code,
    /CREATE POLICY agency_entitlements_staff_read ON public\.agency_entitlements\s+FOR SELECT\s+USING \(public\.is_staff_of_tenant\(tenant_id\)\);/,
  );
  assert.match(
    code,
    /CREATE POLICY agency_entitlements_platform_admin_write ON public\.agency_entitlements\s+FOR ALL TO authenticated\s+USING\s+\(public\.is_platform_admin\(\)\)\s+WITH CHECK \(public\.is_platform_admin\(\)\);/,
  );
  assert.doesNotMatch(code, /CREATE POLICY agency_entitlements_tenant_staff /);
});

test("the file is held, transactional, and carries rollback + a rolled-back harness", () => {
  assert.match(code, /^BEGIN;/m);
  assert.match(code, /^COMMIT;/m);
  assert.match(sql, /^-- ROLLBACK\b/m);
  assert.match(sql, /SET LOCAL ROLE authenticated/);
  assert.match(sql, /request\.jwt\.claims/);
});
