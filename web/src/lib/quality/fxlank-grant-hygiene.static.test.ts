/**
 * Static guard for TUL-514 fxlank-only grant hygiene SQL.
 * Run: npx tsx --test src/lib/quality/fxlank-grant-hygiene.static.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WEB_ROOT } from "./supabase-unchecked-read";

const SQL_PATH = join(WEB_ROOT, "..", "supabase", "manual_fxlank_grant_hygiene.sql");
const SQL = readFileSync(SQL_PATH, "utf8");

const NAMES = [
  "acceptance_summary_for_offer",
  "allocate_media_gallery_sort_order",
  "cms_page_revisions_trim",
  "cms_section_revisions_trim",
  "engine_emit_event",
  "engine_emit_notification",
  "engine_emit_system_event",
  "engine_inquiry_group_shortfall",
  "engine_load_commission_context",
  "engine_send_offer",
  "engine_submit_approval",
  "engine_workspace_base_fee_inputs",
  "ensure_country",
  "find_auth_user_identity_by_email",
  "generate_profile_code",
  "guest_submit_inquiry",
  "increment_ai_usage_monthly",
  "is_cross_tenant_inquiry",
  "lineup_status_summary",
  "list_table_columns",
  "match_talent_embeddings",
  "media_asset_presentable_on_tenant",
  "media_assets_presentable_on_tenant",
  "media_assets_watermark_required_on_tenant",
  "media_grant_active",
  "owning_parties_for_inquiry",
  "pending_exclusivity_prompts_for_talent",
  "recompute_talent_height_gender",
  "reconcile_expired_plan_overrides",
  "reconcile_expired_talent_plan_overrides",
  "record_media_release_bake_failures",
  "refresh_talent_discover_index",
  "refresh_talent_skill_metrics",
  "refresh_talent_skill_metrics_all",
  "review_is_arms_length_paid",
  "rotate_unsubscribe_token",
  "search_queries_fallback_reason_rollup",
  "sync_location_taxonomy_terms",
  "talent_compute_publicly_listed",
  "talent_recompute_completed_bookings",
  "talent_refresh_publicly_listed",
  "talent_reviews_recompute_summary",
  "tr_sync_location_taxonomy_terms",
  "usage_audit_metrics",
] as const;

test("fxlank grant hygiene SQL names all 44 TUL-514 functions", () => {
  assert.equal(NAMES.length, 44);
  for (const name of NAMES) {
    assert.match(SQL, new RegExp(`'${name}'`), `missing ${name}`);
  }
});

test("fxlank grant hygiene SQL revokes PUBLIC/anon/authenticated and grants service_role", () => {
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION/i);
  assert.match(SQL, /FROM PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION/i);
  assert.match(SQL, /TO service_role/i);
});

test("fxlank grant hygiene SQL is fxlank-only (not a production migration)", () => {
  assert.match(SQL, /fxlankepwnvelxjrahwk/);
  assert.match(SQL, /NEVER run on production/i);
  assert.match(SQL, /do not `?db:push`?/i);
  assert.doesNotMatch(SQL_PATH, /supabase\/migrations\//);
});
