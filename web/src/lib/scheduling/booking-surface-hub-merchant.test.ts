/**
 * A free talent sold through the platform hub tenant is the merchant on her
 * own public page (tulala.digital/t/<code>, the MARKETING host). Before this
 * fix the marketing host mapped to surface "other" and every offering there
 * resolved to inquire, so the slots API answered `inquiry_only` and the
 * booking sheet showed "No times available".
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  marketingHostSurface,
  offeringModeTakesSlots,
  resolveTalentBooking,
} from "./booking-surface";

const HUB_TENANT = "40081ec3-5ca8-43a0-b50b-31c927b2716b";
const WORKSPACE_TENANT = "11111111-1111-4111-8111-111111111111";
const TALENT = "22222222-2222-4222-8222-222222222222";
const OFFERING = "33333333-3333-4333-8333-333333333333";

const MON_SAT_HOURS = {
  timezone: "America/Monterrey",
  weekly: {
    "0": [],
    "1": [{ startMin: 480, endMin: 1080 }],
    "2": [{ startMin: 480, endMin: 1080 }],
    "3": [{ startMin: 480, endMin: 1080 }],
    "4": [{ startMin: 480, endMin: 1080 }],
    "5": [{ startMin: 480, endMin: 1080 }],
    "6": [{ startMin: 480, endMin: 1080 }],
  },
  exceptions: [],
  slot_minutes: 60,
  buffer_before_min: 0,
  buffer_after_min: 15,
  min_notice_min: 120,
  horizon_days: 60,
};

type Tables = Record<string, Array<Record<string, unknown>>>;

/** Minimal read-only Supabase stand-in: eq / in filters, maybeSingle / await. */
function fakeAdmin(tables: Tables): SupabaseClient {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return q;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

function freeHubTalent(opts: {
  bookingMode: string | null;
  hours?: boolean;
  sellerKind?: string;
  sellerTenant?: string;
}): Tables {
  const tenant = opts.sellerTenant ?? HUB_TENANT;
  return {
    talent_profiles: [
      {
        id: TALENT,
        profile_kind: "person",
        booking_terms: { directBookingOptIn: true },
        created_by_agency_id: null,
        selling_defaults: {},
      },
    ],
    talent_offerings: [
      {
        id: OFFERING,
        talent_profile_id: TALENT,
        tenant_id: tenant,
        booking_mode: opts.bookingMode,
        reserve_mode: null,
        duration_minutes: 60,
        kind: "service",
        status: "published",
        visibility: "public",
      },
    ],
    agency_talent_roster: [
      {
        talent_profile_id: TALENT,
        tenant_id: tenant,
        is_primary: false,
        exclusivity_status: null,
        status: "active",
        agency_visibility: "site_visible",
        hub_visibility_status: "not_submitted",
        direct_booking_enabled: true,
        external_booking_released: null,
      },
    ],
    agencies: [
      {
        id: tenant,
        kind: opts.sellerKind ?? "hub",
        settings: {},
        timezone: "UTC",
        plan_tier: "network",
        slug: "tulala",
        discover_exposure_enabled: true,
        hub_exposure_tenant_ids: null,
      },
    ],
    talent_booking_hours:
      opts.hours === false ? [] : [{ talent_profile_id: TALENT, ...MON_SAT_HOURS }],
    venues: [],
  };
}

const marketing = { kind: "marketing", tenantId: null };

test("pure: marketing host books as her own page only when the seller is the hub", () => {
  assert.equal(marketingHostSurface("hub"), "own_page");
  assert.equal(marketingHostSurface("agency"), "other");
  assert.equal(marketingHostSurface(null), "other");
});

test("pure: only instant and request offerings take a slot", () => {
  assert.equal(offeringModeTakesSlots("instant"), true);
  assert.equal(offeringModeTakesSlots("request"), true);
  assert.equal(offeringModeTakesSlots("inquiry"), false);
  assert.equal(offeringModeTakesSlots("closed"), false);
});

test("free hub talent, instant service, Mon-Sat hours: instant on her public page (slots served)", async () => {
  const r = await resolveTalentBooking(fakeAdmin(freeHubTalent({ bookingMode: "instant" })), {
    talentProfileId: TALENT,
    offeringId: OFFERING,
    host: marketing,
  });
  assert.equal(r.mode, "instant");
  assert.equal(r.surface, "own_page");
  assert.equal(r.tenantId, HUB_TENANT);
});

test("free hub talent, instant service: the app host (localhost) agrees", async () => {
  const r = await resolveTalentBooking(fakeAdmin(freeHubTalent({ bookingMode: "instant" })), {
    talentProfileId: TALENT,
    offeringId: OFFERING,
    host: { kind: "app", tenantId: null },
  });
  assert.equal(r.mode, "instant");
});

test("request-to-book service stays request (approval first), never instant", async () => {
  const r = await resolveTalentBooking(fakeAdmin(freeHubTalent({ bookingMode: "request" })), {
    talentProfileId: TALENT,
    offeringId: OFFERING,
    host: marketing,
  });
  assert.equal(r.mode, "request");
});

test("inquiry-only service resolves to inquire (the slots API answers inquiry_only)", async () => {
  for (const host of [marketing, { kind: "app", tenantId: null }]) {
    const r = await resolveTalentBooking(fakeAdmin(freeHubTalent({ bookingMode: "inquiry" })), {
      talentProfileId: TALENT,
      offeringId: OFFERING,
      host,
    });
    assert.equal(r.mode, "inquire", host.kind);
  }
});

test("no working hours: mode is still instant here; the slots route answers no_booking_hours", async () => {
  // The resolver decides the mode; the honest empty reason (no_booking_hours)
  // comes from the slots route reading talent_booking_hours after it.
  const r = await resolveTalentBooking(
    fakeAdmin(freeHubTalent({ bookingMode: "instant", hours: false })),
    { talentProfileId: TALENT, offeringId: OFFERING, host: marketing },
  );
  assert.equal(r.mode, "instant");
});

test("a workspace storefront reached on the marketing host keeps inquiry-only", async () => {
  const r = await resolveTalentBooking(
    fakeAdmin(
      freeHubTalent({ bookingMode: "instant", sellerKind: "agency", sellerTenant: WORKSPACE_TENANT }),
    ),
    { talentProfileId: TALENT, offeringId: OFFERING, host: marketing },
  );
  assert.equal(r.mode, "inquire");
  assert.equal(r.surface, "other");
});

test("unknown host kinds still never book", async () => {
  const r = await resolveTalentBooking(fakeAdmin(freeHubTalent({ bookingMode: "instant" })), {
    talentProfileId: TALENT,
    offeringId: OFFERING,
    host: { kind: "unknown", tenantId: null },
  });
  assert.equal(r.mode, "inquire");
});
