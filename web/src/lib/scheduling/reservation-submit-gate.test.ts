import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { offeringRequestSubmitAllowed, assertTalentReservationAllowed } from "./booking-surface";
import { refuseOfferingRequestIfPolicyOff } from "./reservation-submit-gate";
import { resolveSurfaceGate } from "./appointment-policy";

test("offering_request submit is refused when the keystone says inquire", () => {
  assert.equal(offeringRequestSubmitAllowed("inquire"), false);
  assert.equal(offeringRequestSubmitAllowed("request"), true);
  assert.equal(offeringRequestSubmitAllowed("instant"), true);
});

test("policy-off person cannot pass the surface gate (the submit path uses this)", () => {
  assert.equal(
    resolveSurfaceGate({
      surface: "workspace_site",
      tenantEnabled: true,
      allowDirect: true,
      talentOptIn: false,
      isResource: false,
    }).allowed,
    false,
  );
});

type TableRows = Record<string, unknown | unknown[]>;

function fakeAdmin(tables: TableRows): SupabaseClient {
  return {
    from(table: string) {
      const payload = tables[table];
      const list = Array.isArray(payload) ? payload : payload != null ? [payload] : [];
      const row: { data: unknown[]; error: null } = { data: list, error: null };
      const api = {
        select: () => api,
        eq: () => api,
        in: () => api,
        maybeSingle: async () => ({ data: list[0] ?? null, error: null }),
        then: (
          resolve: (v: typeof row) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(row).then(resolve, reject),
      };
      return api;
    },
  } as unknown as SupabaseClient;
}

test("direct action call: policy-off talent cannot be booked", async () => {
  const admin = fakeAdmin({
    talent_profiles: {
      id: "talent-off",
      profile_kind: "person",
      booking_terms: { directBookingOptIn: false },
      created_by_agency_id: "agency-1",
    },
    talent_offerings: {
      tenant_id: "agency-1",
      booking_mode: "request",
      reserve_mode: "full",
      duration_minutes: 30,
      kind: "service",
      status: "published",
      visibility: "public",
    },
    agency_talent_roster: [
      {
        tenant_id: "agency-1",
        is_primary: false,
        exclusivity_status: null,
        status: "active",
        agency_visibility: "site_visible",
        hub_visibility_status: "not_submitted",
        direct_booking_enabled: true,
        external_booking_released: false,
      },
    ],
    agencies: [
      {
        id: "agency-1",
        settings: { appointments: { enabled: true, allowTalentDirectBooking: true } },
        plan_tier: "agency",
        slug: "impronta",
        discover_exposure_enabled: true,
        hub_exposure_tenant_ids: null,
      },
    ],
    talent_booking_hours: null,
  });

  const refused = await assertTalentReservationAllowed(admin, {
    talentProfileId: "talent-off",
    offeringId: "offering-1",
    host: { kind: "agency", tenantId: "agency-1" },
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.error, "This time cannot be booked.");
  }
});

test("submitInquiry helper refuses offering_request when the talent is policy-off", async () => {
  const admin = fakeAdmin({
    talent_profiles: {
      id: "talent-off",
      profile_kind: "person",
      booking_terms: { directBookingOptIn: false },
      created_by_agency_id: "agency-1",
    },
    talent_offerings: null,
    agency_talent_roster: [
      {
        tenant_id: "agency-1",
        is_primary: false,
        exclusivity_status: null,
        status: "active",
        agency_visibility: "site_visible",
        hub_visibility_status: "not_submitted",
        direct_booking_enabled: true,
        external_booking_released: false,
      },
    ],
    agencies: [
      {
        id: "agency-1",
        settings: { appointments: { enabled: true, allowTalentDirectBooking: true } },
        plan_tier: "agency",
        slug: "impronta",
        discover_exposure_enabled: true,
        hub_exposure_tenant_ids: null,
      },
    ],
    talent_booking_hours: null,
  });
  const refused = await refuseOfferingRequestIfPolicyOff(admin, {
    source_channel: "offering_request",
    talent_profile_ids: ["talent-off"],
    tenant_id: "agency-1",
    source_context: { host_kind: "agency", host_tenant_id: "agency-1" },
  });
  assert.equal(refused?.forbidden, true);
  assert.equal(
    await refuseOfferingRequestIfPolicyOff(admin, {
      source_channel: "public_directory",
      talent_profile_ids: ["talent-off"],
      tenant_id: "agency-1",
    }),
    null,
  );
});

test("direct action call: opted-in talent on an enabled workspace site is allowed", async () => {
  const admin = fakeAdmin({
    talent_profiles: {
      id: "talent-on",
      profile_kind: "person",
      booking_terms: { directBookingOptIn: true },
      created_by_agency_id: "agency-1",
    },
    talent_offerings: {
      tenant_id: "agency-1",
      booking_mode: "request",
      reserve_mode: "full",
      duration_minutes: 30,
      kind: "service",
      status: "published",
      visibility: "public",
    },
    agency_talent_roster: [
      {
        tenant_id: "agency-1",
        is_primary: false,
        exclusivity_status: null,
        status: "active",
        agency_visibility: "site_visible",
        hub_visibility_status: "not_submitted",
        direct_booking_enabled: true,
        external_booking_released: false,
      },
    ],
    agencies: [
      {
        id: "agency-1",
        settings: { appointments: { enabled: true, allowTalentDirectBooking: true } },
        plan_tier: "agency",
        slug: "impronta",
        discover_exposure_enabled: true,
        hub_exposure_tenant_ids: null,
      },
    ],
    talent_booking_hours: null,
  });

  const allowed = await assertTalentReservationAllowed(admin, {
    talentProfileId: "talent-on",
    offeringId: "offering-1",
    host: { kind: "agency", tenantId: "agency-1" },
  });
  assert.equal(allowed.ok, true);
});
