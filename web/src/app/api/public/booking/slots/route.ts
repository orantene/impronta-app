/**
 * GET /api/public/booking/slots?offering&from&days
 *
 * Host-resolved, unauthenticated. Returns free slot starts only — never raw
 * holds, bookings, or blocks. Service-role internally. s-maxage=30.
 *
 * Guards: published + public offering, host-tenant match, appointments
 * enabled, effective mode ≥ request (M1). Missing hours or a disabled
 * policy yield an empty list, not a guessed calendar.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { checkBookingSlots } from "@/lib/rate-limit-kv";
import { getPublicHostContext } from "@/lib/saas/scope";
import { HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  parseTenantAppointmentSettings,
  resolveAppointmentPolicy,
} from "@/lib/scheduling/appointment-policy";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { loadBusyIntervals } from "@/lib/scheduling/load-busy";
import {
  clampPublicSlotDays,
  computePublicSlotStarts,
  parsePublicSlotFrom,
} from "@/lib/scheduling/public-slots";
import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFERING_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SLOTS_CACHE = "public, s-maxage=30, stale-while-revalidate=60";

function slotsJson(slots: string[], status = 200): NextResponse {
  return NextResponse.json(
    { slots },
    { status, headers: { "Cache-Control": SLOTS_CACHE } },
  );
}

function resolveClientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return "x";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(request: Request) {
  const reqHeaders = await headers();
  const limited = await checkBookingSlots(resolveClientIp(reqHeaders));
  if (!limited.ok) {
    const retryAfter = Math.max(1, Math.ceil((limited.retryAfterMs ?? 1000) / 1000));
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  const url = new URL(request.url);
  const offeringId = (url.searchParams.get("offering") ?? "").trim();
  if (!OFFERING_ID_RE.test(offeringId)) {
    return NextResponse.json({ error: "invalid_offering" }, { status: 400 });
  }

  const host = await getPublicHostContext();
  const talentSiteId =
    host.kind === "talent_site"
      ? reqHeaders.get(HOST_TALENT_PROFILE_HEADER)?.trim() || null
      : null;

  if (host.kind !== "agency" && host.kind !== "talent_site") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (host.kind === "talent_site" && !talentSiteId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  try {
    const { data: offering, error: offeringErr } = await admin
      .from("talent_offerings")
      .select(
        "id, talent_profile_id, tenant_id, status, visibility, kind, booking_mode, reserve_mode, duration_minutes",
      )
      .eq("id", offeringId)
      .maybeSingle();

    if (offeringErr) {
      logServerError("api.public.booking.slots.offering", offeringErr);
      return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }
    if (
      !offering ||
      offering.status !== "published" ||
      offering.visibility !== "public" ||
      offering.kind === "product"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data: talent, error: talentErr } = await admin
      .from("talent_profiles")
      .select("id, profile_kind, booking_terms, created_by_agency_id")
      .eq("id", offering.talent_profile_id)
      .maybeSingle();

    if (talentErr) {
      logServerError("api.public.booking.slots.talent", talentErr);
      return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }
    if (!talent) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const offeringTenantId =
      (typeof offering.tenant_id === "string" && offering.tenant_id) ||
      (typeof talent.created_by_agency_id === "string" && talent.created_by_agency_id) ||
      null;

    if (host.kind === "agency") {
      if (!offeringTenantId || offeringTenantId !== host.tenantId) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
    } else if (talent.id !== talentSiteId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (!offeringTenantId) {
      return slotsJson([]);
    }

    const [{ data: agency }, { data: hoursRow }, { data: roster }] = await Promise.all([
      admin
        .from("agencies")
        .select("settings, plan_tier")
        .eq("id", offeringTenantId)
        .maybeSingle(),
      admin
        .from("talent_booking_hours")
        .select(
          "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
        )
        .eq("talent_profile_id", talent.id)
        .maybeSingle(),
      admin
        .from("agency_talent_roster")
        .select("direct_booking_enabled")
        .eq("tenant_id", offeringTenantId)
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
      offering: {
        bookingMode: offering.booking_mode === "instant" ? "instant" : "request",
        reserveMode:
          offering.reserve_mode === "deposit" ||
          offering.reserve_mode === "full" ||
          offering.reserve_mode === "free"
            ? offering.reserve_mode
            : null,
        durationMinutes: offering.duration_minutes,
      },
      planTier: typeof agency?.plan_tier === "string" ? agency.plan_tier : null,
      rosterDirectBooking:
        (roster as { direct_booking_enabled?: boolean } | null)?.direct_booking_enabled === true,
    });

    if (!policy.enabled || policy.effectiveMode === "off") {
      return slotsJson([]);
    }

    const hours = policy.hours ?? parseBookingHours(hoursRow);
    if (!hours) return slotsJson([]);

    const now = new Date();
    const from = parsePublicSlotFrom(url.searchParams.get("from"), now);
    const days = clampPublicSlotDays(url.searchParams.get("days"));
    const horizon = Math.min(days, hours.horizonDays);
    const startYmd = utcToZonedYmd(from, hours.timezone) ?? from.toISOString().slice(0, 10);
    const endYmd = addUtcDays(startYmd, horizon) ?? startYmd;
    const windowEnd = new Date(`${endYmd}T23:59:59.999Z`);

    const busy = await loadBusyIntervals({
      admin,
      talentProfileId: talent.id,
      from,
      to: windowEnd,
      now,
    });

    const slots = computePublicSlotStarts({
      hours,
      durationMinutes: policy.durationMinutes,
      from,
      days: horizon,
      busy,
    });
    return slotsJson(slots);
  } catch (err) {
    logServerError("api.public.booking.slots", err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
