/* eslint-disable ratchet/no-untenanted-from -- talent_booking_hours is one row per person and talent_profiles is a global identity table; the upsert itself goes through tenantScopedQuery. */
import "server-only";

/**
 * IO half of `pattern-hours.ts` (F27) plus the talent timezone rule (F48).
 *
 * The drawer pattern and Settings > Working hours are one thing: saving the
 * pattern writes the open days into `talent_booking_hours`; saving hours
 * writes the matching pattern back. Best effort: a failure is logged and
 * never fails the save that triggered it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { parseWeeklyHours, type WeeklyHours } from "./hours-types";
import {
  patternFromWeekly,
  recurringFromAvailabilityData,
  sameWeekly,
  weeklyFromAvailabilityPattern,
  type AvailabilityRecurring,
} from "./pattern-hours";
import { timezoneFromPlaceText } from "./timezone-from-place";
import { isValidIanaTimeZone } from "./tz";

type Admin = Pick<SupabaseClient, "from">;

/** The workspace an hours row belongs to: existing row, staff tenant, managing agency, roster. */
export async function resolveHoursTenantId(
  admin: Admin,
  talentProfileId: string,
  staffTenantId: string | null,
): Promise<string | null> {
  const { data: existing, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (hoursErr) logServerError("hours-tenant.readHours", hoursErr);
  if (typeof existing?.tenant_id === "string" && existing.tenant_id) return existing.tenant_id;
  if (staffTenantId) return staffTenantId;

  const { data: tp, error: tpErr } = await admin
    .from("talent_profiles")
    .select("created_by_agency_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (tpErr) logServerError("hours-tenant.readProfile", tpErr);
  if (typeof tp?.created_by_agency_id === "string" && tp.created_by_agency_id) {
    return tp.created_by_agency_id;
  }

  const { data: roster, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"])
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rosterErr) logServerError("hours-tenant.readRoster", rosterErr);
  return typeof roster?.tenant_id === "string" ? roster.tenant_id : null;
}

/**
 * The talent's own timezone, most specific first: her saved city (drawer
 * Location), the browser that is saving, the workspace (only when it is a
 * real answer, not the platform UTC fallback). Null when none is known.
 */
export async function resolveTalentTimezone(
  admin: Admin,
  talentProfileId: string,
  tenantId: string | null,
  clientTimezone?: string | null,
): Promise<string | null> {
  const { data, error } = await admin
    .from("talent_profiles")
    .select("home_city_text")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) logServerError("talent-timezone.readCity", error);
  const fromCity = timezoneFromPlaceText((data as { home_city_text?: string | null } | null)?.home_city_text);
  if (fromCity && isValidIanaTimeZone(fromCity)) return fromCity;
  const client = clientTimezone?.trim();
  if (client && isValidIanaTimeZone(client)) return client;
  if (!tenantId) return null;
  const resolved = await resolveTenantTimezone(tenantId).catch(() => null);
  return resolved && resolved.source !== "platform" ? resolved.timezone : null;
}

/** The pattern currently saved on the profile (read before a drawer save). */
export async function loadSavedRecurring(admin: Admin, talentProfileId: string): Promise<AvailabilityRecurring> {
  const { data, error } = await admin
    .from("talent_profiles")
    .select("availability_data")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) logServerError("pattern-hours.readSavedPattern", error);
  return recurringFromAvailabilityData((data as { availability_data?: unknown } | null)?.availability_data);
}

/** Drawer pattern -> hours row. Leaves hours alone when the pattern says nothing. */
export async function syncBookingHoursFromPattern(
  admin: Admin,
  input: {
    talentProfileId: string;
    recurring: AvailabilityRecurring;
    clientTimezone?: string | null;
    /** Only create a missing row; never rewrite saved hours. */
    onlyIfNoHours?: boolean;
  },
): Promise<void> {
  try {
    const { data: row, error } = await admin
      .from("talent_booking_hours")
      .select("weekly, timezone, tenant_id")
      .eq("talent_profile_id", input.talentProfileId)
      .maybeSingle();
    if (error) {
      logServerError("pattern-hours.readHours", error);
      return;
    }
    if (row && input.onlyIfNoHours) return;
    const existing = row ? parseWeeklyHours((row as { weekly?: unknown }).weekly) : null;
    const next = weeklyFromAvailabilityPattern(input.recurring, existing);
    if (!next || (row && sameWeekly(existing, next))) return;

    const tenantId = await resolveHoursTenantId(admin, input.talentProfileId, null);
    if (!tenantId) return;
    if (row) {
      const { error: upErr } = await tenantScopedQuery(admin as SupabaseClient, "talent_booking_hours", tenantId)
        .update({ weekly: next, updated_at: new Date().toISOString() })
        .eq("talent_profile_id", input.talentProfileId);
      if (upErr) logServerError("pattern-hours.update", upErr);
      return;
    }
    // First hours row: only with a real timezone. A guessed UTC offers
    // strangers the wrong clock (T1-07).
    const timezone = await resolveTalentTimezone(admin, input.talentProfileId, tenantId, input.clientTimezone);
    if (!timezone) return;
    const { error: insErr } = await tenantScopedQuery(admin as SupabaseClient, "talent_booking_hours", tenantId).insert(
      {
        talent_profile_id: input.talentProfileId,
        tenant_id: tenantId,
        timezone,
        weekly: next,
        exceptions: [],
        slot_minutes: 30,
        buffer_before_min: 0,
        buffer_after_min: 0,
        min_notice_min: 60,
        horizon_days: 60,
        updated_at: new Date().toISOString(),
      },
    );
    // 23505: a concurrent save created the row first; that row stands.
    if (insErr && insErr.code !== "23505") logServerError("pattern-hours.insert", insErr);
  } catch (err) {
    logServerError("pattern-hours.sync", err);
  }
}

/** Hours row -> drawer pattern, when a pattern describes the saved days. */
export async function syncPatternFromBookingHours(
  admin: Admin,
  input: { talentProfileId: string; weekly: WeeklyHours },
): Promise<void> {
  try {
    const pattern = patternFromWeekly(input.weekly);
    if (!pattern) return;
    const { data, error } = await admin
      .from("talent_profiles")
      .select("availability_data")
      .eq("id", input.talentProfileId)
      .maybeSingle();
    if (error) {
      logServerError("pattern-hours.readPattern", error);
      return;
    }
    const current = (data as { availability_data?: unknown } | null)?.availability_data;
    const before = recurringFromAvailabilityData(current);
    if ((before?.kind ?? "none") === pattern.kind) return;
    const base = current && typeof current === "object" ? (current as Record<string, unknown>) : { cells: [] };
    const { error: upErr } = await admin
      .from("talent_profiles")
      .update({ availability_data: { ...base, recurring: pattern } })
      .eq("id", input.talentProfileId);
    if (upErr) logServerError("pattern-hours.writePattern", upErr);
  } catch (err) {
    logServerError("pattern-hours.syncPattern", err);
  }
}
