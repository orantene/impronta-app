/**
 * Pins 20261231390100_sec_addon_rls_view_invoker_definer_revokes.sql.
 *
 * Direction matters (incident 2026-09-03): the old guard only checked that we
 * did not over-revoke. This one checks the other way too: the functions this
 * migration closes must STAY closed. Any later migration that re-grants
 * EXECUTE on one of them to anon / authenticated / PUBLIC fails here.
 *
 * Run: npx tsx --test src/lib/saas/sec-rls-addon-definer-revoke.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SURFACE_FUNCTIONS } from "./public-surface-functions";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "..", "supabase", "migrations");
const MIGRATION = "20261231390100_sec_addon_rls_view_invoker_definer_revokes.sql";

/** SECURITY DEFINER RPCs with no anon/authenticated caller (no .rpc() in app
 * code, no policy, view or invoker-function reference on prod 2026-10-14). */
export const REVOKED_DEFINER_RPCS: readonly string[] = [
  "archive_inquiries_for_user",
  "bootstrap_profile_from_auth_email",
  "current_user_tenant_ids",
  "engine_caller_may_write_tenant_finances",
  "engine_cancel_inquiry",
  "inquiry_approval_summary",
  "media_grant_active",
  "pos_touch_device_session",
  "submit_own_talent_profile_for_review",
  "talent_onboarding_existing_profile",
  "talent_soft_delete_own_media",
  "toggle_inquiry_manual_unread",
  "toggle_inquiry_pin",
];

/** SECURITY DEFINER trigger functions. EXECUTE is never needed to fire a trigger. */
export const REVOKED_DEFINER_TRIGGERS: readonly string[] = [
  "_agency_taxonomy_settings_after_agency",
  "_sync_location_taxonomy_terms_trigger",
  "agencies_propagate_slug_to_domains",
  "agency_bookings_recompute_completed_bookings",
  "agency_domains_sync_tenant_slug",
  "booking_talent_recompute_completed_bookings",
  "ensure_talent_in_platform_hub",
  "guard_order_not_overcollected",
  "guard_profile_self_update",
  "handle_new_user",
  "inquiries_sync_coordinator_table",
  "inquiry_coordinators_sync_inquiry",
  "invalidate_talent_embedding_on_field_values_change",
  "invalidate_talent_embedding_on_profile_change",
  "invalidate_talent_embedding_on_taxonomy_change",
  "sync_agency_domain_slug",
  "sync_gender_presenting_label",
  "sync_location_country_defaults",
  "sync_talent_profile_canonical_locations",
  "talent_representation_requests_effectuate",
  "talent_reviews_recompute_trigger",
  "talent_reviews_verify_on_insert",
  "tpfv_record_history",
  "trg_agencies_publicly_listed",
  "trg_refresh_skill_metrics_for_booking",
  "trg_refresh_skill_metrics_for_booking_talent",
  "trg_roster_publicly_listed",
  "trg_sync_talent_height_gender",
  "trg_talent_profiles_publicly_listed",
];

const ALL = [...REVOKED_DEFINER_RPCS, ...REVOKED_DEFINER_TRIGGERS];
const sql = () => readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8");

test("migration revokes every listed function from anon, authenticated AND PUBLIC", () => {
  const s = sql();
  assert.match(s, /FROM PUBLIC, anon, authenticated/);
  for (const n of ALL) assert.ok(s.includes(`'${n}'`), `migration must revoke ${n}`);
  assert.match(s, /has_function_privilege\('anon'/, "must assert the outcome");
});

test("revoked set never overlaps the anon public surface", () => {
  for (const n of ALL) assert.ok(!PUBLIC_SURFACE_FUNCTIONS.includes(n), `${n} is a public-surface function`);
});

test("no later migration re-grants EXECUTE on a revoked function to an API role", () => {
  const later = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && f > MIGRATION);
  for (const f of later) {
    const body = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    for (const stmt of body.match(/GRANT\s+(EXECUTE|ALL)[\s\S]*?;/gi) ?? []) {
      if (!/\b(anon|authenticated|PUBLIC)\b/i.test(stmt)) continue;
      for (const n of ALL) {
        assert.ok(!new RegExp(`\\b${n}\\b`).test(stmt), `${f} re-grants ${n}:\n${stmt}`);
      }
    }
  }
});

test("addon group tables get RLS with owner-only policies, no anon policy", () => {
  const s = sql();
  for (const t of ["talent_addon_groups", "talent_addon_group_attachments"]) {
    assert.match(s, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
    assert.match(s, new RegExp(`ON public\\.${t}[\\s\\S]*?TO authenticated`));
  }
  assert.ok(!/TO anon/.test(s), "no anon policy: public site reads via service role");
  assert.match(s, /tp\.user_id = auth\.uid\(\)/);
});

test("talent line-item view is invoker and not writable by API roles", () => {
  const s = sql();
  assert.match(s, /ALTER VIEW public\.inquiry_offer_line_items_talent_view SET \(security_invoker = true\)/);
  assert.match(s, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.inquiry_offer_line_items_talent_view FROM anon, authenticated/);
});
