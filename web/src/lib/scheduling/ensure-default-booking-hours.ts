/**
 * Onboarding path for bookable hours.
 *
 * THE DEFECT. Public booking returns `no_booking_hours` for every bookable
 * offering that has no `talent_booking_hours` row. Production had 161 of those.
 * Publishing a service without hours looked identical to a fully-booked day.
 *
 * WHAT THIS DOES. If the talent has no hours row yet, write a conservative
 * weekday window in the tenant timezone. Operators can edit afterwards. It
 * never overwrites an existing row — a deliberate calendar must not be reset
 * by publishing a second service.
 *
 * Idempotent. Safe to call on every publish.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantTimezone } from "@/lib/spaces/venues";

/** Mon–Fri 09:00–17:00 local. Weekend closed until the operator opens them. */
export const DEFAULT_WEEKLY_HOURS = {
  "0": [],
  "1": [{ startMin: 9 * 60, endMin: 17 * 60 }],
  "2": [{ startMin: 9 * 60, endMin: 17 * 60 }],
  "3": [{ startMin: 9 * 60, endMin: 17 * 60 }],
  "4": [{ startMin: 9 * 60, endMin: 17 * 60 }],
  "5": [{ startMin: 9 * 60, endMin: 17 * 60 }],
  "6": [],
} as const;

export type EnsureDefaultBookingHoursResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string };

export async function ensureDefaultBookingHours(
  admin: Pick<SupabaseClient, "from">,
  input: {
    talentProfileId: string;
    tenantId: string;
    /** Tests and callers that already resolved the timezone. */
    timezone?: string | null;
  },
): Promise<EnsureDefaultBookingHoursResult> {
  if (!input.talentProfileId || !input.tenantId) {
    return { ok: false, error: "Missing talent or workspace." };
  }

  const { data: existing, error: readErr } = await admin
    .from("talent_booking_hours")
    .select("talent_profile_id")
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (readErr) {
    logServerError("scheduling.ensureDefaultBookingHours/read", readErr);
    return { ok: false, error: "Could not check booking hours." };
  }
  if (existing) return { ok: true, created: false };

  const timezone =
    (typeof input.timezone === "string" && input.timezone.trim()) ||
    (await tenantTimezone(input.tenantId).catch(() => "UTC")) ||
    "UTC";

  const { error: insErr } = await admin.from("talent_booking_hours").insert({
    talent_profile_id: input.talentProfileId,
    tenant_id: input.tenantId,
    timezone,
    weekly: DEFAULT_WEEKLY_HOURS,
    exceptions: [],
    slot_minutes: 30,
    buffer_before_min: 0,
    buffer_after_min: 0,
    min_notice_min: 120,
    horizon_days: 60,
  });
  if (insErr) {
    // Concurrent first-publish: unique on talent_profile_id. Treat as done.
    if (insErr.code === "23505") return { ok: true, created: false };
    logServerError("scheduling.ensureDefaultBookingHours/insert", insErr);
    return { ok: false, error: "Could not create default booking hours." };
  }
  return { ok: true, created: true };
}
