/* eslint-disable ratchet/no-untenanted-from -- talent_profiles and agencies have no tenant_id. talent_booking_hours is one row per person (a per-tenant filter would hide hours and fork the single calendar). Offering/roster reads are scoped by talent id plus the resolved seller tenant. */

/**
 * resolveTalentBookingMode — the ONE server entry for "can this talent be
 * booked HERE, and in what mode."
 *
 * Display surfaces and the slots API and the reservation submit path must
 * agree. Hub veto lives HERE once (not a second guard on the slots route)
 * so display and action cannot disagree.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rowIsExclusive } from "@/lib/inquiry/owning-party-resolver";
import {
  hubMayListTalent,
  mapTenantDiscoverExposure,
} from "@/lib/saas/discover-exposure";
import { pickTimezone } from "@/lib/spaces/venue-timezone";
import {
  parseTenantAppointmentSettings,
  resolveAppointmentPolicy,
  type BookingSurface,
} from "./appointment-policy";
import type { AppointmentMode } from "./appointments-plan-policy";
import { logServerError } from "@/lib/server/safe-error";

export type TalentBookingMode = "inquire" | "request" | "instant";

export type BookingSurfaceKind = BookingSurface | "other";

export type BookingSurfaceHost = {
  kind: string;
  tenantId?: string | null;
};

export type ResolvedTalentBooking = {
  mode: TalentBookingMode;
  surface: BookingSurfaceKind;
  tenantId: string | null;
  tenantSlug: string | null;
};

type RosterRow = {
  tenant_id: string;
  is_primary: boolean;
  exclusivity_status: string | null;
  status: string;
  agency_visibility: string;
  hub_visibility_status: string;
  direct_booking_enabled: boolean | null;
  external_booking_released: boolean | null;
};

type AgencyRow = {
  id: string;
  settings: unknown;
  timezone: string | null;
  plan_tier: string | null;
  slug: string | null;
  discover_exposure_enabled: boolean | null;
  hub_exposure_tenant_ids: string[] | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function bookingSurfaceFromHost(kind: string): BookingSurfaceKind {
  if (kind === "agency") return "workspace_site";
  if (kind === "talent_site") return "own_page";
  if (kind === "hub") return "hub";
  return "other";
}

export function talentBookingModeFromPolicy(policy: {
  enabled: boolean;
  effectiveMode: AppointmentMode;
}): TalentBookingMode {
  if (!policy.enabled || policy.effectiveMode === "off") return "inquire";
  if (policy.effectiveMode === "request") return "request";
  return "instant";
}

/** Inquire-only talent must never place a reservation (closes the submit hole). */
export function offeringRequestSubmitAllowed(mode: TalentBookingMode): boolean {
  return mode !== "inquire";
}

export async function assertTalentReservationAllowed(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    offeringId?: string | null;
    host: BookingSurfaceHost;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mode = await resolveTalentBookingMode(admin, input);
  if (!offeringRequestSubmitAllowed(mode)) {
    return { ok: false, error: "This time cannot be booked." };
  }
  return { ok: true };
}

export async function resolveTalentBookingMode(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    offeringId?: string | null;
    host: BookingSurfaceHost;
  },
): Promise<TalentBookingMode> {
  const resolved = await resolveTalentBooking(admin, input);
  return resolved.mode;
}

export async function resolveTalentBooking(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    offeringId?: string | null;
    host: BookingSurfaceHost;
  },
): Promise<ResolvedTalentBooking> {
  const surface = bookingSurfaceFromHost(input.host.kind);
  if (surface === "other") {
    return { mode: "inquire", surface, tenantId: null, tenantSlug: null };
  }

  const { data: talent, error: talentErr } = await admin
    .from("talent_profiles")
    .select("id, profile_kind, booking_terms, created_by_agency_id")
    .eq("id", input.talentProfileId)
    .maybeSingle();

  if (talentErr || !talent) {
    return { mode: "inquire", surface, tenantId: null, tenantSlug: null };
  }

  let offering: {
    tenant_id: string | null;
    booking_mode: string | null;
    reserve_mode: string | null;
    duration_minutes: number | null;
    kind: string | null;
    status: string | null;
    visibility: string | null;
  } | null = null;

  if (input.offeringId) {
    const { data } = await admin
      .from("talent_offerings")
      .select(
        "tenant_id, booking_mode, reserve_mode, duration_minutes, kind, status, visibility",
      )
      .eq("id", input.offeringId)
      .eq("talent_profile_id", talent.id)
      .maybeSingle();
    offering = data;
    if (
      !offering ||
      offering.status !== "published" ||
      (offering.visibility !== "public" && offering.visibility !== "on_request") ||
      offering.kind === "product"
    ) {
      return { mode: "inquire", surface, tenantId: null, tenantSlug: null };
    }
  }

  const channelTenant =
    (surface === "workspace_site" || surface === "hub") &&
    typeof input.host.tenantId === "string"
      ? input.host.tenantId
      : null;
  const offeringTenantId =
    typeof offering?.tenant_id === "string" && offering.tenant_id
      ? offering.tenant_id
      : null;

  if (
    surface === "workspace_site" &&
    channelTenant &&
    offeringTenantId &&
    offeringTenantId !== channelTenant
  ) {
    return { mode: "inquire", surface, tenantId: channelTenant, tenantSlug: null };
  }

  const sellerTenantId =
    (surface === "workspace_site" && channelTenant) ||
    offeringTenantId ||
    (typeof talent.created_by_agency_id === "string" && talent.created_by_agency_id) ||
    null;

  if (!sellerTenantId) {
    return { mode: "inquire", surface, tenantId: null, tenantSlug: null };
  }

  if (surface === "hub" && !channelTenant) {
    return { mode: "inquire", surface, tenantId: null, tenantSlug: null };
  }

  const { data: rosterData } = await admin
    .from("agency_talent_roster")
    .select(
      "tenant_id, is_primary, exclusivity_status, status, agency_visibility, hub_visibility_status, direct_booking_enabled, external_booking_released",
    )
    .eq("talent_profile_id", talent.id)
    .in("status", ["active", "pending"]);

  const rosterRows = (Array.isArray(rosterData) ? rosterData : rosterData ? [rosterData] : []) as RosterRow[];

  const agencyIds = new Set<string>();
  agencyIds.add(sellerTenantId);
  if (channelTenant) agencyIds.add(channelTenant);
  for (const row of rosterRows) {
    if (row.is_primary) agencyIds.add(row.tenant_id);
  }

  const { data: agencyData } = await admin
    .from("agencies")
    .select(
      "id, settings, timezone, plan_tier, slug, discover_exposure_enabled, hub_exposure_tenant_ids",
    )
    .in("id", [...agencyIds]);

  const agencies = (Array.isArray(agencyData) ? agencyData : agencyData ? [agencyData] : []) as AgencyRow[];
  const agenciesById = new Map(agencies.map((a) => [a.id, a]));

  const exclusiveRow =
    rosterRows.find((row) =>
      rowIsExclusive(row.is_primary, row.exclusivity_status, {
        plan_tier: agenciesById.get(row.tenant_id)?.plan_tier ?? null,
      }),
    ) ?? null;

  const isExclusive = exclusiveRow != null;
  const isExclusivePrimarySite =
    surface === "workspace_site" &&
    exclusiveRow != null &&
    exclusiveRow.tenant_id === channelTenant;
  const externalBookingReleased = exclusiveRow?.external_booking_released === true;

  const channelRoster =
    channelTenant != null
      ? rosterRows.find((row) => row.tenant_id === channelTenant) ?? null
      : rosterRows.find((row) => row.tenant_id === sellerTenantId) ?? null;

  const rosterSiteVisible =
    surface === "workspace_site"
      ? channelRoster?.status === "active" && channelRoster.agency_visibility === "site_visible"
      : undefined;

  const hubRosterOk =
    surface === "hub"
      ? rosterRows.some(
          (row) =>
            row.tenant_id === channelTenant &&
            row.status === "active" &&
            row.hub_visibility_status === "approved",
        )
      : undefined;

  const primaryRow =
    exclusiveRow ??
    rosterRows.find((row) => row.is_primary && row.status === "active") ??
    null;
  const primaryAgency = primaryRow ? agenciesById.get(primaryRow.tenant_id) ?? null : null;
  const hubMayList =
    surface === "hub" && channelTenant
      ? hubMayListTalent(
          primaryAgency
            ? mapTenantDiscoverExposure({
                discover_exposure_enabled: primaryAgency.discover_exposure_enabled,
                hub_exposure_tenant_ids: primaryAgency.hub_exposure_tenant_ids,
              })
            : null,
          channelTenant,
        )
      : undefined;

  const channelAgency =
    surface === "hub" && channelTenant
      ? agenciesById.get(channelTenant) ?? null
      : agenciesById.get(sellerTenantId) ?? null;
  const sellerAgency = agenciesById.get(sellerTenantId) ?? null;

  const { data: hoursRow } = await admin
    .from("talent_booking_hours")
    .select(
      "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
    )
    .eq("talent_profile_id", talent.id)
    .maybeSingle();

  const bookingTerms = isPlainObject(talent.booking_terms) ? talent.booking_terms : null;

  // The workspace's clock (Spaces & Seating S1). The appointments setting used
  // to be the only place a tenant timezone could live, which made a per-feature
  // setting answer for the whole workspace. It is now the last rung of a ladder
  // whose first rung is the venue the workspace actually operates from.
  let venueTimezone: string | null = null;
  if (channelAgency) {
    const { data: venueRow, error: venueError } = await admin
      .from("venues")
      .select("timezone")
      .eq("tenant_id", channelAgency.id)
      .eq("is_default", true)
      .maybeSingle();
    if (venueError) {
      // Falling through to the next rung is correct; doing it silently is not.
      // A failed venue read and a workspace with no venue both end at UTC, and
      // only one of them is a bug.
      logServerError("scheduling/bookingSurface.venueTimezone", venueError);
    }
    venueTimezone = (venueRow as { timezone: string | null } | null)?.timezone ?? null;
  }

  const tenantAppointments = parseTenantAppointmentSettings(channelAgency?.settings ?? null);
  const workspaceTimezone = pickTimezone({
    venue: venueTimezone,
    workspace: channelAgency?.timezone ?? null,
    appointmentsSetting: tenantAppointments?.timezone ?? null,
  }).timezone;

  const policy = resolveAppointmentPolicy({
    tenant: tenantAppointments
      ? { ...tenantAppointments, timezone: workspaceTimezone }
      : null,
    talent: {
      profileKind: talent.profile_kind === "resource" ? "resource" : "person",
      directBookingOptIn: bookingTerms?.directBookingOptIn === true,
      timezone: typeof bookingTerms?.timezone === "string" ? bookingTerms.timezone : null,
    },
    hours: hoursRow,
    offering: offering
      ? {
          bookingMode: offering.booking_mode === "instant" ? "instant" : "request",
          reserveMode:
            offering.reserve_mode === "deposit" ||
            offering.reserve_mode === "full" ||
            offering.reserve_mode === "free"
              ? offering.reserve_mode
              : null,
          durationMinutes: offering.duration_minutes,
        }
      : { bookingMode: "request", durationMinutes: 30 },
    planTier: typeof sellerAgency?.plan_tier === "string" ? sellerAgency.plan_tier : null,
    rosterDirectBooking: channelRoster?.direct_booking_enabled === true,
    surface,
    isExclusive,
    isExclusivePrimarySite,
    externalBookingReleased,
    rosterSiteVisible,
    hubRosterOk,
    hubMayList,
  });

  const slug =
    typeof sellerAgency?.slug === "string" && sellerAgency.slug.trim()
      ? sellerAgency.slug.trim()
      : null;

  return {
    mode: talentBookingModeFromPolicy(policy),
    surface,
    tenantId: sellerTenantId,
    tenantSlug: slug,
  };
}
