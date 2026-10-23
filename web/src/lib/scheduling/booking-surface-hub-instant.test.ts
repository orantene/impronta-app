/**
 * TUL-1471b: an offering a workspace sells through an INSTANT hub entry books on the workspace
 * host even when the workspace never switched the separate appointments master switch on
 * (staging s2-agencia: settings had no `appointments` node, so "Sesion de fotos" was listed with
 * Reservar and then refused everywhere). Every other gate still holds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTalentBooking, resolveTalentBookingMode } from "./booking-surface";
import { isInstantHubMember } from "./hub-instant-member";

const TENANT = "11111111-1111-4111-8111-111111111111";
const TALENT = "22222222-2222-4222-8222-222222222222";
const OFFERING = "33333333-3333-4333-8333-333333333333";
const ENTRY = "44444444-4444-4444-8444-444444444444";
const host = { kind: "agency", tenantId: TENANT };

const HOURS = {
  timezone: "America/Cancun",
  weekly: { "0": [], "1": [{ startMin: 540, endMin: 1080 }], "2": [{ startMin: 540, endMin: 1080 }], "3": [{ startMin: 540, endMin: 1080 }], "4": [{ startMin: 540, endMin: 1080 }], "5": [{ startMin: 540, endMin: 1080 }], "6": [{ startMin: 540, endMin: 1080 }] },
  exceptions: [],
  slot_minutes: 30,
  buffer_before_min: 0,
  buffer_after_min: 0,
  min_notice_min: 60,
  horizon_days: 60,
};

type Tables = Record<string, Array<Record<string, unknown>>>;

function fakeAdmin(tables: Tables): SupabaseClient {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return q; },
      in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q; },
      not: (col: string, op: string, val: unknown) => { if (op === "is" && val === null) rows = rows.filter((r) => r[col] != null); return q; },
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

function world(over: { settings?: unknown; entry?: Partial<Record<string, unknown>>; listing?: Partial<Record<string, unknown>>; roster?: Partial<Record<string, unknown>> } = {}): Tables {
  return {
    talent_profiles: [{ id: TALENT, profile_kind: "person", booking_terms: { directBookingOptIn: true }, created_by_agency_id: TENANT, selling_defaults: {} }],
    talent_offerings: [{ id: OFFERING, talent_profile_id: TALENT, tenant_id: TENANT, booking_mode: "instant", reserve_mode: "full", duration_minutes: 60, kind: "service", status: "published", moderation_state: "approved", visibility: "public" }],
    agency_talent_roster: [{ talent_profile_id: TALENT, tenant_id: TENANT, is_primary: true, exclusivity_status: "confirmed", status: "active", agency_visibility: "site_visible", hub_visibility_status: "not_submitted", direct_booking_enabled: true, external_booking_released: null, ...over.roster }],
    agencies: [{ id: TENANT, kind: "agency", settings: over.settings ?? { business_type_id: "talent-agency" }, timezone: "America/Cancun", plan_tier: "agency", slug: "s2", discover_exposure_enabled: false, hub_exposure_tenant_ids: null }],
    talent_booking_hours: [{ talent_profile_id: TALENT, ...HOURS }],
    venues: [],
    workspace_service_listings: [{ id: "L1", tenant_id: TENANT, talent_profile_id: TALENT, offering_id: OFFERING, status: "accepted", entry_id: ENTRY, owner_skipped_at: null, ...over.listing }],
    workspace_service_entries: [{ id: ENTRY, tenant_id: TENANT, booking_type: "instant", hidden: false, ...over.entry }],
  };
}

const modeOf = (t: Tables) => resolveTalentBookingMode(fakeAdmin(t), { talentProfileId: TALENT, offeringId: OFFERING, host });

test("an instant hub entry member books instantly on a workspace with no appointments setting", async () => {
  const r = await resolveTalentBooking(fakeAdmin(world()), { talentProfileId: TALENT, offeringId: OFFERING, host });
  assert.equal(r.mode, "instant");
  assert.equal(r.tenantId, TENANT);
});

test("a REQUEST entry, a hidden entry or a skipped listing keeps the old inquiry-only answer", async () => {
  assert.equal(await modeOf(world({ entry: { booking_type: "request" } })), "inquire");
  assert.equal(await modeOf(world({ entry: { hidden: true } })), "inquire");
  assert.equal(await modeOf(world({ listing: { owner_skipped_at: "2026-10-22T00:00:00Z" } })), "inquire");
  assert.equal(await modeOf(world({ listing: { status: "pending" } })), "inquire");
});

test("the other gates still hold: roster direct booking off, or hidden from the site, stays inquire", async () => {
  assert.equal(await modeOf(world({ roster: { direct_booking_enabled: false } })), "inquire");
  assert.equal(await modeOf(world({ roster: { agency_visibility: "roster_only" } })), "inquire");
});

test("an owner who switched appointments OFF on purpose is respected; ON is untouched", async () => {
  assert.equal(await modeOf(world({ settings: { appointments: { enabled: false } } })), "inquire");
  assert.equal(await modeOf(world({ settings: { appointments: { enabled: true, allowTalentDirectBooking: true } } })), "instant");
});

test("an offering that is in no entry (or another tenant's entry) gets no lift", async () => {
  const t = world();
  t.workspace_service_listings = [];
  assert.equal(await modeOf(t), "inquire");
  const other = world();
  other.workspace_service_listings = [{ id: "L1", tenant_id: "99999999-9999-4999-8999-999999999999", talent_profile_id: TALENT, offering_id: OFFERING, status: "accepted", entry_id: ENTRY, owner_skipped_at: null }];
  assert.equal(await modeOf(other), "inquire");
});

test("isInstantHubMember reads tenant-scoped and fails closed when the tables are unreadable", async () => {
  assert.equal(await isInstantHubMember(fakeAdmin(world()), { tenantId: TENANT, talentProfileId: TALENT, offeringId: OFFERING }), true);
  const broken = { from: () => { throw new Error("boom"); } } as unknown as SupabaseClient;
  assert.equal(await isInstantHubMember(broken, { tenantId: TENANT, talentProfileId: TALENT, offeringId: OFFERING }), false);
});

test("wiring: the /book pinned fallback lets a vetted hub member past the tenant filter; the home grid passes /book", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const loader = read("src/lib/site-admin/server/load-book-page-offerings.ts");
  assert.match(loader, /extraIds\.includes\(pinnedId\) \? one\.or\(`tenant_id\.eq\.\$\{args\.tenantId\},id\.eq\.\$\{pinnedId\}`\)/);
  assert.match(read("src/lib/scheduling/booking-surface.ts"), /isInstantHubMember\(admin, \{ tenantId: channelTenant/);
  assert.match(read("src/lib/site-admin/builder-node/render.tsx"), /prefixPublicHref\("\/book", options\.publicPathPrefix \?\? ""\),\n\s+\)\}\n\s+locale=\{locale\}/);
});
