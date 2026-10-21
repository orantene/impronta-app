/**
 * RLS guard: no NEW `FOR ALL` policy gated on is_staff_of_tenant().
 *
 * is_staff_of_tenant admits viewers, pending_acceptance members and platform admins, so a FOR ALL policy on it lets
 * a viewer write over PostgREST. Existing policies are inventoried below (decision per table lives in
 * docs/plans/tul-rls-for-all-inventory.md). A new write policy must use is_tenant_writer / is_tenant_admin, or no
 * authenticated write policy at all (service-role-only). To retire an entry, remove it here and in the doc once a
 * later wave's migration drops the policy.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const MIG = join(process.cwd(), "..", "supabase", "migrations");
const WAVE1 = join(MIG, "_pending_pm", "20261231424000_rls_tenant_writer_wave1.sql");

/** table.policy -> wave decision. Grandfathered; the list may only shrink. */
const INVENTORY: Record<string, string> = {
  "agencies.agencies_tenant_staff": "wave 2",
  "agency_branding.agency_branding_tenant_staff": "wave 2",
  "agency_business_identity.agency_business_identity_staff_all": "wave 1",
  "agency_client_relationships.agency_client_relationships_tenant_staff": "wave 2",
  "agency_domains.agency_domains_tenant_staff": "wave 2",
  "agency_entitlements.agency_entitlements_tenant_staff": "wave 1",
  "agency_inquiry_coordinators.agency_inquiry_coordinators_staff_all": "wave 2",
  "agency_memberships.agency_memberships_tenant_staff": "wave 2",
  "agency_talent_media.atm_all_tenant_staff": "wave 3",
  "agency_talent_overlays.agency_talent_overlays_tenant_staff": "wave 3",
  "agency_talent_roster.agency_talent_roster_tenant_staff": "wave 3",
  "agency_talent_skill_overrides.atso_all_tenant_staff": "wave 3",
  "agency_taxonomy_settings.agency_taxonomy_settings_staff_write": "wave 3",
  "agency_taxonomy_terms.agency_taxonomy_terms_staff_write": "wave 3",
  "agency_usage_counters.agency_usage_counters_tenant_staff": "wave 2",
  "ai_provider_instances.ai_provider_instances_staff": "wave 1",
  "ai_tenant_controls.ai_tenant_controls_staff": "wave 1 (separate PR)",
  "ai_usage_monthly.ai_usage_monthly_staff": "wave 1 (separate PR)",
  "booking_transactions.booking_transactions_staff_write": "wave 1",
  "client_trust_state.client_trust_state_staff_write": "wave 1",
  "cms_builder_components.cms_builder_components_staff_write": "wave 3",
  "cms_code_snippets.cms_code_snippets_tenant_staff": "wave 3",
  "cms_navigation_menus.cms_navigation_menus_tenant_staff": "wave 3",
  "cms_page_sections.cms_page_sections_staff_all": "wave 3",
  "cms_section_comments.cms_section_comments_staff_all": "product question",
  "cms_sections.cms_sections_staff_all": "wave 3",
  "cms_workspace_templates.cms_workspace_templates_staff_write": "wave 3",
  "field_definitions.field_definitions_write_tenant": "wave 3",
  "field_groups.field_groups_merged_all_public": "wave 3",
  "field_groups.field_groups_write_tenant": "wave 3",
  "inquiry_alternates.inquiry_alternates_merged_all_public": "mixed (per-table read)",
  "inquiry_alternates.inquiry_alternates_staff_all": "mixed (per-table read)",
  "inquiry_attachments.inquiry_attachments_staff_all": "mixed (per-table read)",
  "inquiry_drafts.inquiry_drafts_merged_all_public": "mixed (per-table read)",
  "inquiry_drafts.inquiry_drafts_tenant_staff": "mixed (per-table read)",
  "inquiry_message_reads.inquiry_message_reads_merged_all_public": "mixed (per-table read)",
  "inquiry_message_reads.inquiry_message_reads_tenant_staff": "mixed (per-table read)",
  "inquiry_messages.inquiry_messages_tenant_staff": "mixed (per-table read)",
  "inquiry_offer_line_items.inquiry_offer_line_items_merged_all_public": "mixed (per-table read)",
  "inquiry_participants.inquiry_participants_merged_all_public": "mixed (per-table read)",
  "inquiry_participants.inquiry_participants_nontalent_tenant_staff": "mixed (per-table read)",
  "inquiry_participants.inquiry_participants_talent_legacy_tenant_staff": "mixed (per-table read)",
  "inquiry_participants.inquiry_participants_talent_owning_party_staff": "mixed (per-table read)",
  "inquiry_reports.inquiry_reports_staff": "mixed (per-table read)",
  "lesson_package_consumptions.lesson_package_consumptions_staff": "wave 2",
  "media_assets.media_assets_tenant_staff_all": "wave 3",
  "media_assets.media_write_staff": "wave 3",
  "media_grants.mg_all_owner_tenant_staff": "wave 2",
  "media_release_bake_failures.mrbf_all_owner_tenant_staff": "wave 3",
  "notifications.notifications_merged_all_public": "mixed (per-table read)",
  "payout_accounts.payout_accounts_staff_write": "wave 1",
  "pitch_attachments.pitch_attachments_staff_all": "wave 3",
  "pitch_events.pitch_events_staff_all": "wave 3",
  "pitch_talents.pitch_talents_staff_all": "wave 3",
  "pitches.pitches_staff_all": "wave 3",
  "print_designs.print_designs_staff_all": "wave 3",
  "roster_import_jobs.roster_import_jobs_staff_all": "wave 3",
  "settings.settings_staff": "wave 1",
  "talent_booking_hours.talent_booking_hours_staff": "mixed (per-table read)",
  "talent_booking_hours.talent_booking_hours_staff_write": "mixed (per-table read)",
  "talent_bookings.talent_bookings_write_staff": "mixed (per-table read)",
  "talent_claim_invitations.talent_claim_invitations_staff_all": "mixed (per-table read)",
  "talent_contact_preferences.talent_contact_preferences_merged_all_public": "mixed (per-table read)",
  "talent_contact_preferences.talent_contact_prefs_staff": "mixed (per-table read)",
  "talent_holds.talent_holds_write_staff": "mixed (per-table read)",
  "talent_languages.talent_languages_write_own_or_staff": "mixed (per-table read)",
  "talent_page_revisions.talent_page_revisions_merged_all_public": "mixed (per-table read)",
  "talent_page_revisions.talent_page_revisions_staff": "mixed (per-table read)",
  "talent_pages.talent_pages_merged_all_public": "mixed (per-table read)",
  "talent_pages.talent_pages_staff": "mixed (per-table read)",
  "talent_profile_change_requests.profile_change_requests_staff_all": "mixed (per-table read)",
  "talent_profile_field_values.tpfv_write_own_or_staff": "mixed (per-table read)",
  "talent_profile_trust_badges.talent_profile_trust_badges_merged_all_public": "mixed (per-table read)",
  "talent_profile_trust_badges.tptb_write_agency_scoped": "mixed (per-table read)",
  "talent_review_media.talent_review_media_staff_all": "wave 3",
  "talent_service_areas.talent_service_areas_write_own_or_staff": "mixed (per-table read)",
  "team_invite_tokens.team_invite_tokens_staff_all": "wave 1",
  "tenant_guest_chat_settings.guest_chat_settings_staff_write": "wave 2",
  "tenant_integrations.tenant_integrations_staff_all": "wave 1",
  "tenant_registration_settings.tenant_registration_settings_staff_all": "wave 2",
  "tenant_social_feed_items.tenant_social_feed_items_staff_all": "wave 3",
  "user_blocks.user_blocks_staff": "mixed (per-table read)",
  "workspace_field_group_settings.wfgs_all_tenant_staff": "wave 3",
  "workspace_page_revisions.workspace_page_revisions_staff": "wave 3",
  "workspace_pages.workspace_pages_staff": "wave 3",
  "workspace_profile_field_settings.wpfs_write_tenant_or_platform": "mixed (per-table read)",
};

function sqlFiles(): string[] {
  const out: string[] = [];
  for (const dir of [MIG, join(MIG, "_pending_pm")]) {
    for (const f of readdirSync(dir)) if (f.endsWith(".sql")) out.push(join(dir, f));
  }
  return out;
}

function strip(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

function forAllStaffPolicies(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const re = /CREATE\s+POLICY\s+("?[\w$]+"?)\s+ON\s+(?:"?public"?\.)?("?\w+"?)([^;]*?);/gis;
  for (const file of sqlFiles()) {
    const sql = strip(readFileSync(file, "utf8"));
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      if (/\bFOR\s+ALL\b/i.test(m[3]) && /is_staff_of_tenant/i.test(m[3])) {
        const key = `${m[2].replace(/"/g, "")}.${m[1].replace(/"/g, "")}`;
        found.set(key, [...(found.get(key) ?? []), file]);
      }
    }
  }
  return found;
}

test("no new FOR ALL policy uses is_staff_of_tenant (only the inventoried ones)", () => {
  const found = forAllStaffPolicies();
  const fresh = [...found.keys()].filter((k) => !(k in INVENTORY));
  assert.deepEqual(
    fresh,
    [],
    `New FOR ALL is_staff_of_tenant policy: ${fresh.join(", ")}. Split it into SELECT (is_staff_of_tenant) plus INSERT/UPDATE/DELETE on is_tenant_writer / is_tenant_admin, or service-role-only writes.`,
  );
});

test("inventory has no stale entries", () => {
  const found = forAllStaffPolicies();
  const stale = Object.keys(INVENTORY).filter((k) => !found.has(k));
  assert.deepEqual(stale, [], `Inventory lists policies that no migration creates: ${stale.join(", ")}`);
});

test("inventory doc lists every inventoried policy", () => {
  const doc = readFileSync(join(process.cwd(), "..", "docs", "plans", "tul-rls-for-all-inventory.md"), "utf8");
  for (const key of Object.keys(INVENTORY)) {
    const [table, policy] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
    assert.ok(doc.includes(`| ${table} | ${policy} |`), `${key} missing from the inventory doc`);
  }
});

const SERVICE_ONLY = {
  settings: "settings_staff",
  ai_provider_instances: "ai_provider_instances_staff",
  tenant_integrations: "tenant_integrations_staff_all",
  team_invite_tokens: "team_invite_tokens_staff_all",
  agency_entitlements: "agency_entitlements_tenant_staff",
} as const;
const ADMIN_WRITES = {
  payout_accounts: ["payout_accounts_staff_write", "tenant_id"],
  booking_transactions: ["booking_transactions_staff_write", "source_tenant_id"],
  client_trust_state: ["client_trust_state_staff_write", "tenant_id"],
  agency_business_identity: ["agency_business_identity_staff_all", "tenant_id"],
} as const;

test("wave 1 migration: held, idempotent, helpers require an active membership", () => {
  const raw = readFileSync(WAVE1, "utf8");
  const code = strip(raw);
  assert.match(raw, /HELD: lives in _pending_pm/);
  assert.match(code, /CREATE OR REPLACE FUNCTION public\.is_tenant_writer\(p_tenant_id uuid\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/);
  assert.match(code, /CREATE OR REPLACE FUNCTION public\.is_tenant_admin\(p_tenant_id uuid\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/);
  assert.equal((code.match(/m\.status\s+= 'active'/g) ?? []).length, 2, "both helpers must require status = 'active'");
  assert.doesNotMatch(code, /pending_acceptance/);
  assert.match(code, /m\.role IN \('owner', 'admin', 'manager', 'coordinator', 'editor'\)/);
  assert.match(code, /m\.role IN \('owner', 'admin'\)/);
  assert.doesNotMatch(code, /'viewer'/);
  assert.match(code, /REVOKE ALL ON FUNCTION public\.is_tenant_writer\(uuid\) FROM PUBLIC, anon/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.is_tenant_writer\(uuid\) TO authenticated/);
  assert.doesNotMatch(code, /CREATE OR REPLACE FUNCTION public\.is_staff_of_tenant/, "is_staff_of_tenant must not change");
  assert.doesNotMatch(code, /FOR\s+ALL/i, "the wave must not create any FOR ALL policy");
});

test("wave 1 migration splits each table: SELECT stays staff-wide, writes are narrowed", () => {
  const code = strip(readFileSync(WAVE1, "utf8"));
  const all = { ...Object.fromEntries(Object.entries(SERVICE_ONLY).map(([t, p]) => [t, [p, "tenant_id"]])), ...ADMIN_WRITES } as Record<string, readonly [string, string]>;
  for (const [table, [oldPolicy, col]] of Object.entries(all)) {
    assert.match(code, new RegExp(`DROP POLICY IF EXISTS ${oldPolicy} ON public\\.${table};`), `${table}: drops ${oldPolicy}`);
    assert.match(
      code,
      new RegExp(`CREATE POLICY ${table}_staff_select ON public\\.${table}\\s+FOR SELECT\\s+USING \\(public\\.is_staff_of_tenant\\(${col}\\)\\)`),
      `${table}: SELECT keeps the original tenant filter`,
    );
    const adminWrites = table in ADMIN_WRITES;
    for (const [op, clause] of [["insert", "WITH CHECK"], ["update", "USING"], ["delete", "USING"]] as const) {
      const re = new RegExp(`CREATE POLICY ${table}_admin_${op} ON public\\.${table}\\s+FOR ${op.toUpperCase()}\\s+${clause}\\s+\\(public\\.is_tenant_admin\\(${col}\\)\\)`);
      assert.equal(re.test(code), adminWrites, `${table}: ${op} policy ${adminWrites ? "expected" : "must be absent (service-role-only)"}`);
    }
  }
});

test("wave 1 tables are in the inventory as grandfathered history, not as new policies", () => {
  for (const policy of [...Object.values(SERVICE_ONLY), ...Object.values(ADMIN_WRITES).map((v) => v[0])]) {
    assert.ok(Object.keys(INVENTORY).some((k) => k.endsWith(`.${policy}`)), policy);
  }
});
