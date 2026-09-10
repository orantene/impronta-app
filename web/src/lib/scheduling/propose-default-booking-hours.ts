/**
 * Onboarding path for bookable hours.
 *
 * THE DEFECT (T1-07, fixed here). This module used to write Mon-Fri
 * 09:00-17:00 UTC straight into `talent_booking_hours` on first publish.
 * Nobody agreed to those hours or that timezone, and the public slots
 * endpoint then offered them to strangers as if a human had set them.
 *
 * WHAT THIS DOES NOW. If the talent has no hours row yet AND no open
 * proposal, write a PROPOSAL — never hours — for an operator to review.
 * `talent_booking_hours` is only ever written by
 * `src/lib/server-actions/booking-hours.ts` (a human editing their own
 * calendar) or by `accept_booking_hours_proposal` (a human accepting this
 * proposal). Until one of those happens, the public slots endpoint keeps
 * answering `no_booking_hours`, which is the honest answer for a calendar
 * nobody has looked at.
 *
 * Idempotent. Safe to call on every publish: skips once hours exist, and
 * skips once a proposal exists (proposed, accepted, or dismissed) so a
 * second publish cannot duplicate or resurrect a decision the operator
 * already made.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { resolveTenantTimezone } from "@/lib/spaces/venues";

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

/**
 * What the editor's call to action should say. `active` = a real calendar
 * exists, nothing to do. `proposed` = review the proposal. `absent` = no
 * hours and nothing pending (never proposed, or the operator dismissed it).
 */
export type BookingHoursStatus = "active" | "proposed" | "absent";

export type ProposeDefaultBookingHoursResult =
  | { ok: true; created: boolean; status: BookingHoursStatus }
  | { ok: false; error: string };

export async function proposeDefaultBookingHours(
  admin: Pick<SupabaseClient, "from">,
  input: {
    talentProfileId: string;
    tenantId: string;
    /** The user whose publish triggered the proposal, for the audit trail. */
    actorId?: string | null;
    /** Tests and callers that already resolved the timezone. Never defaulted to UTC by this module. */
    timezone?: string | null;
  },
): Promise<ProposeDefaultBookingHoursResult> {
  if (!input.talentProfileId || !input.tenantId) {
    return { ok: false, error: "Missing talent or workspace." };
  }

  const { data: existingHours, error: hoursReadErr } = await admin
    .from("talent_booking_hours")
    .select("talent_profile_id")
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (hoursReadErr) {
    logServerError("scheduling.proposeDefaultBookingHours/readHours", hoursReadErr);
    return { ok: false, error: "Could not check booking hours." };
  }
  // A deliberate calendar already exists. Never write a proposal over it.
  if (existingHours) return { ok: true, created: false, status: "active" };

  const { data: existingProposal, error: proposalReadErr } = await admin
    .from("talent_booking_hours_proposals")
    .select("talent_profile_id, status")
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (proposalReadErr) {
    logServerError("scheduling.proposeDefaultBookingHours/readProposal", proposalReadErr);
    return { ok: false, error: "Could not check booking hours." };
  }
  // Whatever state that proposal is in (still proposed, accepted, or
  // dismissed), a second publish must not duplicate it or resurrect a
  // decision the operator already made by overwriting a dismissal.
  if (existingProposal) {
    const proposalStatus =
      typeof (existingProposal as { status?: unknown }).status === "string"
        ? (existingProposal as { status: string }).status
        : "proposed";
    return {
      ok: true,
      created: false,
      status: proposalStatus === "proposed" ? "proposed" : "absent",
    };
  }

  // Resolve the timezone from the tenant ONLY when it actually resolves to a
  // venue/workspace/appointments-setting answer. A resolution that fell all
  // the way through to the platform fallback is not a real answer — leave
  // the proposal's timezone null rather than writing "UTC" as if someone
  // chose it.
  const timezone =
    (typeof input.timezone === "string" && input.timezone.trim()) ||
    (await resolveTenantTimezone(input.tenantId)
      .then((resolved) => (resolved.source === "platform" ? null : resolved.timezone))
      .catch(() => null));

  const { error: insErr } = await admin.from("talent_booking_hours_proposals").insert({
    talent_profile_id: input.talentProfileId,
    tenant_id: input.tenantId,
    timezone: timezone || null,
    weekly: DEFAULT_WEEKLY_HOURS,
    exceptions: [],
    slot_minutes: 30,
    buffer_before_min: 0,
    buffer_after_min: 0,
    min_notice_min: 120,
    horizon_days: 60,
    source: "publish_default",
    status: "proposed",
    proposed_by_user_id: input.actorId ?? null,
  });
  if (insErr) {
    // Concurrent first-publish: unique on talent_profile_id. Treat as done —
    // the other request's proposal is the one that stands.
    if (insErr.code === "23505") return { ok: true, created: false, status: "proposed" };
    logServerError("scheduling.proposeDefaultBookingHours/insert", insErr);
    return { ok: false, error: "Could not create default booking hours proposal." };
  }
  return { ok: true, created: true, status: "proposed" };
}
