/* eslint-disable ratchet/no-untenanted-from -- talent_profiles and agencies have no tenant_id. talent_booking_hours is one row per person (a per-tenant filter would hide hours and fork the single calendar). Offering/roster reads are scoped by talent id plus the resolved seller tenant. */

/**
 * resolveTalentBookingMode — the ONE server entry for "can this talent be
 * booked HERE, and in what mode."
 *
 * Wraps the existing pure resolveAppointmentPolicy. Display surfaces and the
 * slots API must agree; inquire-only talent must never be shown a slot picker.
 *
 * W1 surfaces: workspace_site (agency host) and own_page (talent_site host).
 * Hub / platform / marketing hosts return "inquire" — W2 owns that gate table.
 *
 * DEVIATION (W2 owns the real own_page gate): own_page still runs the existing
 * policy (tenant enable + labor opt-in + roster display). W2 will drop the
 * tenant-enable requirement so a talent's own page does not need the agency
 * master switch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseTenantAppointmentSettings,
  resolveAppointmentPolicy,
} from "./appointment-policy";
import type { AppointmentMode } from "./appointments-plan-policy";

export type TalentBookingMode = "inquire" | "request" | "instant";

export type BookingSurfaceKind = "workspace_site" | "own_page" | "other";

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function bookingSurfaceFromHost(kind: string): BookingSurfaceKind {
  if (kind === "agency") return "workspace_site";
  if (kind === "talent_site") return "own_page";
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

  const hostTenant =
    surface === "workspace_site" && typeof input.host.tenantId === "string"
      ? input.host.tenantId
      : null;
  const sellerTenantId =
    hostTenant ||
    (typeof offering?.tenant_id === "string" && offering.tenant_id) ||
    (typeof talent.created_by_agency_id === "string" && talent.created_by_agency_id) ||
    null;

  if (!sellerTenantId) {
    return { mode: "inquire", surface, tenantId: null, tenantSlug: null };
  }

  if (surface === "workspace_site" && hostTenant && sellerTenantId !== hostTenant) {
    return { mode: "inquire", surface, tenantId: hostTenant, tenantSlug: null };
  }

  const [{ data: agency }, { data: hoursRow }, { data: roster }] = await Promise.all([
    admin.from("agencies").select("settings, plan_tier, slug").eq("id", sellerTenantId).maybeSingle(),
    admin
      .from("talent_booking_hours")
      .select(
        "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
      )
      .eq("talent_profile_id", talent.id)
      .maybeSingle(),
    admin
      .from("agency_talent_roster")
      .select("direct_booking_enabled, status, agency_visibility")
      .eq("tenant_id", sellerTenantId)
      .eq("talent_profile_id", talent.id)
      .in("status", ["active", "pending"])
      .maybeSingle(),
  ]);

  const bookingTerms = isPlainObject(talent.booking_terms) ? talent.booking_terms : null;
  const policy = resolveAppointmentPolicy({
    tenant: parseTenantAppointmentSettings(agency?.settings ?? null),
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
    planTier: typeof agency?.plan_tier === "string" ? agency.plan_tier : null,
    rosterDirectBooking:
      (roster as { direct_booking_enabled?: boolean } | null)?.direct_booking_enabled === true,
  });

  const slug =
    typeof agency?.slug === "string" && agency.slug.trim() ? agency.slug.trim() : null;

  return {
    mode: talentBookingModeFromPolicy(policy),
    surface,
    tenantId: sellerTenantId,
    tenantSlug: slug,
  };
}
