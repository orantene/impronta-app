import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ACCOUNT_REFERENCE_GUARDS } from "./retention-account-purge";

/**
 * The account purge deletes a `talent_profiles` row, which cascades into every
 * table with an ON DELETE CASCADE foreign key to it and SET NULLs the rest. That
 * is only safe if every referencing table is CLASSIFIED: either guarded (a
 * financial, booking, subscription or media reference keeps the account) or
 * listed here as non-financial talent content. A new migration that adds a
 * table referencing talent_profiles fails this test until someone decides which.
 */

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "supabase", "migrations");

/** Non-financial: talent content, roster/overlay rows, favourites, search and analytics breadcrumbs. */
const NON_FINANCIAL = new Set([
  "agency_inquiry_coordinators", "agency_talent_media", "agency_talent_overlays", "agency_talent_roster",
  "agency_talent_skill_overrides", "analytics_events", "client_favorites", "client_reviews",
  "client_shortlist_items", "collection_items", "customers", "event_schedule_items", "field_values",
  "inquiry_alternates", "inquiry_participants", "inquiry_talent", "media_release_bake_failures",
  "phone_e164_backfill_collisions", "pitch_attachments", "pitch_talents", "profile_revisions",
  "review_requests", "saved_talent", "search_queries", "support_tickets", "talent_addon_groups",
  "talent_agency_applications", "talent_agency_data_grants", "talent_agency_permission_requests",
  "talent_availability_blocks", "talent_booking_hours", "talent_booking_hours_proposals",
  "talent_claim_invitations", "talent_client_records", "talent_contact_preferences",
  "talent_content_import_batches", "talent_demand_scores", "talent_embeddings", "talent_faq_items",
  "talent_holds", "talent_hub_applications", "talent_integration_items", "talent_integration_secrets",
  "talent_integrations", "talent_languages", "talent_live_status", "talent_location_settings",
  "talent_offerings", "talent_pages", "talent_policy_settings", "talent_policy_versions",
  "talent_press_items", "talent_profile_change_requests", "talent_profile_code_aliases",
  "talent_profile_embeds", "talent_profile_external_calendars", "talent_profile_field_values",
  "talent_profile_taxonomy", "talent_profile_trust_badges", "talent_representation_requests",
  "talent_reviews", "talent_service_areas", "talent_site_domains", "talent_site_history",
  "talent_site_revisions", "talent_site_theme_updates", "talent_sites", "talent_skill_metrics",
  "talent_submission_consents", "talent_submission_history", "talent_submission_snapshots",
  "talent_workflow_events", "taxonomy_term_requests", "tenant_testimonials", "tulala_briefs",
  "user_admin_notes",
]);

function referencingTables(): Set<string> {
  const names = new Set<string>();
  const re =
    /(create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+))|(alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+))|(references\s+(?:public\.)?talent_profiles\s*\(\s*id\s*\))/gi;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "");
    let ctx: string | null = null;
    for (const m of sql.matchAll(re)) {
      if (m[2]) ctx = m[2];
      else if (m[4]) ctx = m[4];
      else if (ctx) names.add(ctx.replace("public.", "").replace(/"/g, ""));
    }
  }
  return names;
}

test("every table with a foreign key to talent_profiles is classified for the account purge", () => {
  const guarded = new Set(ACCOUNT_REFERENCE_GUARDS.map((g) => g.table));
  const unclassified = Array.from(referencingTables()).filter((t) => !guarded.has(t) && !NON_FINANCIAL.has(t));
  assert.deepEqual(
    unclassified,
    [],
    `Add to ACCOUNT_REFERENCE_GUARDS (financial/booking) or NON_FINANCIAL (content): ${unclassified.join(", ")}`,
  );
});

test("no guard is also listed as non-financial", () => {
  for (const g of ACCOUNT_REFERENCE_GUARDS) assert.equal(NON_FINANCIAL.has(g.table), false, g.table);
});
