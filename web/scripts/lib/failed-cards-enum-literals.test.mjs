import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { buildPlan, resolveFixtures } from "./failed-cards-plan.mjs";

/**
 * Every enum-ish literal the F / G fixture builders write, against the CHECK constraints and enum types in supabase/migrations
 * (the latest ALTER / DROP / ADD CONSTRAINT wins). The map is maintained by hand from the migrations named in each comment: the
 * failure this guards against is a literal the table refuses ("fixed" for talent_offerings.price_type, a selftest-only discovery).
 */
const ALLOWED = {
  // talent_offerings (20260708161910, 20260708190801, 20261231296000, 20261226000003)
  "public.talent_offerings.price_type": ["hour", "day", "week", "half_day", "event", "per_person", "per_contact", "flat_package", "custom"],
  "public.talent_offerings.price_display": ["exact", "from", "quote"],
  "public.talent_offerings.booking_mode": ["request", "instant", "inquiry"],
  "public.talent_offerings.kind": ["service", "package", "product"],
  "public.talent_offerings.status": ["draft", "published", "archived"],
  "public.talent_offerings.visibility": ["public", "agency_only", "on_request"],
  "public.talent_offerings.moderation_state": ["pending", "approved", "rejected"],
  "public.talent_offerings.owner_kind": ["talent", "workspace"],
  "public.talent_offerings.reserve_mode": ["full", "deposit", "free"],
  // workspaces and people (20261127000000, 20260601100100, 20260601100200 + 20260605100000, 20260601100500, 20260907140000)
  "public.agencies.plan_tier": ["free", "website", "studio", "agency", "network", "legacy"],
  "public.agencies.workspace_type": ["talent", "business"],
  "public.agency_domains.kind": ["subdomain", "custom", "marketing", "app", "hub"],
  "public.agency_domains.status": ["pending", "dns_verification_sent", "verified", "ssl_provisioned", "active", "failed", "suspended"],
  "public.agency_memberships.role": ["owner", "admin", "manager", "editor", "viewer", "hub_moderator", "platform_reviewer"],
  "public.agency_memberships.status": ["invited", "pending_acceptance", "active", "suspended", "removed", "expired_invite"],
  "public.agency_talent_roster.agency_visibility": ["roster_only", "site_visible", "featured"],
  "public.agency_talent_roster.source_type": ["legacy", "agency_added", "agency_created", "freelancer_claimed", "platform_assigned", "imported"],
  "public.agency_talent_roster.status": ["pending", "active", "inactive", "removed", "archived_for_downgrade"],
  "public.profiles.app_role": ["super_admin", "agency_staff", "talent", "client"], // enum app_role (20250409000000)
  "public.profiles.account_status": ["registered", "onboarding", "active"], // enum account_status
  "public.talent_profiles.profile_kind": ["person", "resource"],
  "public.talent_profiles.talent_plan_key": ["talent_basic", "talent_pro", "talent_portfolio"],
  "public.talent_profiles.workflow_status": ["draft", "submitted", "approved", "published", "hidden"], // the values the Discover index and the submission flow read
  "public.talent_profiles.visibility": ["public", "hidden"],
  // capacity, events, venues, spaces (20261229000200, 20261229000361, 20261231244000, 20261229000214, 20261229000221, 20261229000220)
  "public.capacity_pools.subject_kind": ["offering", "space", "space_group", "session_tier", "person"],
  "public.events.admission_kind": ["ticket", "pass", "registration", "rsvp"],
  "public.events.refund_policy_key": ["tiered", "flexible", "strict", "manual"],
  "public.events.status": ["draft", "published", "cancelled"],
  "public.sessions.status": ["scheduled", "cancelled", "completed"],
  "public.space_groups.kind": ["party_band", "tier", "pool"],
  "public.space_groups.sell_mode": ["band", "assigned"],
  "public.venues.status": ["active", "closed"],
  // promos (20261229000367, 20261231381500)
  "public.tenant_promo_codes.kind": ["percent", "fixed"],
  "public.tenant_promo_codes.offer_kind": ["percent", "fixed", "fixed_price", "free_addon", "second_guest", "pay_in_full", "free_gift"],
  "public.tenant_promo_codes.scope_kind": ["all", "services", "products", "all_services"],
  "public.tenant_promo_codes.audience": ["public", "new_clients", "returning", "lapsed", "one_client"],
  "public.tenant_promo_codes.unlock": ["auto", "code", "link"],
  "public.tenant_promo_codes.applies_on": ["appointment", "purchase"],
  // sites, themes, pages (20261001000000, 20260611174629, 20261231278000, 20261231287000, 20261231299540, 20261231299930)
  "public.talent_sites.site_kind": ["talent_personal"],
  "public.talent_sites.status": ["draft", "published", "unpublished", "archived"],
  "public.talent_pages.status": ["draft", "scheduled", "published"],
  "public.talent_theme_catalog.kind": ["design", "look", "demo"],
  "public.talent_theme_catalog.source": ["builtin", "authored"],
  "public.talent_theme_catalog.status": ["draft", "published", "archived"],
  "public.talent_theme_versions.source": ["builtin", "authored"],
  "public.talent_theme_drafts.status": ["open", "published", "discarded"],
  "public.talent_theme_releases.channel": ["draft", "demos", "optin", "default"],
  "public.talent_theme_releases.status": ["draft", "published", "paused", "archived"],
  // media, taxonomy (20250409000000, 20260601152946, 20261102000000, 20260801120000)
  "public.media_assets.approval_state": ["pending", "approved", "rejected"],
  "public.media_assets.asset_kind": ["image", "video", "document"],
  "public.media_assets.purpose": ["talent", "branding", "cms", "starter_kit"],
  "public.media_assets.variant_kind": ["original", "card", "gallery", "banner", "lightbox", "public_watermarked"],
  "public.taxonomy_terms.kind": ["talent_type", "tag", "skill", "event_type", "industry", "fit_label", "language"],
  "public.taxonomy_terms.term_type": ["parent_category", "category_group", "talent_type", "specialty", "skill_group", "skill", "context_group", "context", "credential", "attribute", "language"],
  "public.talent_profile_taxonomy.relationship_type": ["primary_role", "secondary_role", "skill", "tag", "language"],
  // threads, offers, bookings (enums: inquiry_status, inquiry_participant_role, inquiry_offer_status, booking_status, payment_status)
  "public.inquiries.status": ["draft", "submitted", "coordination", "offer_pending", "approved", "booked", "converted", "closed"],
  "public.inquiry_participants.role": ["client", "coordinator", "talent", "house"],
  "public.inquiry_participants.owning_party_type": ["agency", "workspace", "talent"],
  "public.inquiry_offers.status": ["draft", "sent", "accepted", "rejected", "superseded", "invalidated"],
  "public.inquiry_messages.thread_type": ["private", "group"],
  "public.inquiry_messages.message_kind": ["text", "offer_event", "system_event", "internal_note"],
  "public.agency_bookings.status": ["draft", "tentative", "confirmed", "in_progress", "completed", "cancelled"],
  "public.agency_bookings.payment_status": ["unpaid", "partial", "paid", "cancelled", "refunded"],
  "public.talent_bookings.status": ["confirmed", "completed", "cancelled", "no_show"],
};

/** Column names that behave like enums. A string literal written to one of these must be listed above. */
const ENUMISH = /^(price_type|price_display|booking_mode|reserve_mode|kind|status|role|refund_policy_key|visibility|moderation_state|owner_kind|subject_kind|app_role|account_status|workflow_status|plan_tier|workspace_type|sell_mode|admission_kind|unlock|audience|scope_kind|applies_on|offer_kind|source_type|agency_visibility|approval_state|asset_kind|purpose|variant_kind|thread_type|message_kind|owning_party_type|payment_status|channel|site_kind|term_type|talent_plan_key|source|relationship_type|profile_kind)$/;
/** enum-ish names that are free text on these tables (documented, not guessed). */
const FREE_TEXT = new Set(["public.talent_offerings.category"]);

const payload = { shellTree: [], homeTree: [{ id: "c", kind: "container", props: {}, children: [{ id: "h", kind: "heading", props: { text: "{{displayName}}" } }] }] };
const ctx = { now: new Date("2026-10-21T12:00:00Z"), trees: { shell: () => [], home: () => [] }, templatePayload: payload, housekeepingTermId: "243452c3-01ac-b167-ca0a-5101a29724b2" };
const plan = () => buildPlan(resolveFixtures(null), ctx);

function literals(ops) {
  const out = [];
  for (const op of ops) {
    for (const [col, v] of Object.entries({ ...(op.row ?? {}), ...(op.set ?? {}), ...(op.merge ?? {}) })) {
      if (typeof v === "string" && ENUMISH.test(col) && op.kind !== "authUser") out.push({ op, key: `${op.table}.${col}`, col, v });
    }
  }
  return out;
}

test("every enum-ish literal in every F and G op is allowed by its table's CHECK / enum", () => {
  const ops = plan();
  assert.ok(ops.length > 150, `${ops.length} ops`);
  const found = literals(ops);
  assert.ok(found.length > 250, `${found.length} literals`);
  const unmapped = new Set();
  const bad = [];
  for (const { op, key, v } of found) {
    if (FREE_TEXT.has(key)) continue;
    const allowed = ALLOWED[key];
    if (!allowed) unmapped.add(key);
    else if (!allowed.includes(v)) bad.push(`${op.fx} ${op.key}: ${key} = "${v}" (allowed: ${allowed.join("|")})`);
  }
  assert.deepEqual([...unmapped].sort(), [], "enum-ish columns written by the plan but missing from ALLOWED: read their CHECK in supabase/migrations and list them");
  assert.deepEqual(bad, []);
});

test("the original bug: price_type 'fixed' is refused, priced offerings use flat_package, quotes use custom or flat_package", () => {
  assert.equal(ALLOWED["public.talent_offerings.price_type"].includes("fixed"), false);
  const offerings = plan().filter((o) => o.table === "public.talent_offerings");
  assert.ok(offerings.length >= 10);
  const types = new Set(offerings.map((o) => o.row.price_type));
  assert.equal(types.has("fixed"), false);
  assert.ok(types.has("flat_package"));
  const forced = literals(offerings.map((o) => ({ ...o, row: { ...o.row, price_type: "fixed" } })));
  assert.ok(forced.some((l) => !ALLOWED[l.key].includes(l.v)), "the checker would have caught it");
});

test("talent_offerings_instant_needs_price: an instant offering has a positive price, a non-custom price_type and price_display exact", () => {
  for (const o of plan().filter((x) => x.table === "public.talent_offerings" && x.row.booking_mode === "instant")) {
    assert.ok(o.row.amount_cents > 0, `${o.key} amount`);
    assert.notEqual(o.row.price_type, "custom", `${o.key} price_type`);
    assert.equal(o.row.price_display, "exact", `${o.key} price_display`);
  }
});

test("the allowed values are real: every listed value appears in the migrations", () => {
  const dir = join(fileURLToPath(new URL("../../../", import.meta.url)), "supabase/migrations");
  const sql = readdirSync(dir).filter((n) => n.endsWith(".sql")).map((n) => readFileSync(join(dir, n), "utf8")).join("\n");
  for (const [key, values] of Object.entries(ALLOWED)) {
    for (const v of values) assert.ok(sql.includes(`'${v}'`), `${key}: '${v}' never appears in a migration`);
  }
});
