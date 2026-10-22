import "server-only";

/**
 * TUL-1373: date holds from the project's Team tab. A coordinator picks roster people for the job and holds
 * their dates before anything is confirmed. The hold is the existing `talent_holds` row, written through the
 * existing service-role writer (`placeReservationHold`: it checks the same busy sources the slot grid uses
 * and maps the gist exclusion to `slot_taken`). No new table, no new RPC.
 *
 * Tenant-scoped end to end: the booking, the roster check and the release all filter on the caller's tenant.
 * The window comes from the booking, never from the client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { planJobHolds, type HoldSkipReason } from "@/lib/coordinator/staffing-holds";
import { placeReservationHold, type PlaceReservationHoldInput, type PlaceReservationHoldResult } from "@/lib/scheduling/reservation-hold";
import { unexpiredHoldOrFilter } from "@/lib/scheduling/hold-expiry";
import { logServerError } from "@/lib/server/safe-error";

export type HoldOutcome = "held" | HoldSkipReason | "not_on_roster" | "slot_taken" | "failed";

export type HoldTalentsResult =
  | { ok: true; held: number; outcomes: Array<{ talentProfileId: string; outcome: HoldOutcome }> }
  | { ok: false; reason: "not_found" | "no_inquiry" | "no_window" | "window_past" | "none_picked" | "too_many" | "unavailable" };

export type ReleaseHoldResult = { ok: true } | { ok: false; reason: "not_found" | "unavailable" };

export type ProjectHold = { id: string; talentProfileId: string; expiresAt: string | null };

export type HoldDeps = { place: (admin: SupabaseClient, input: PlaceReservationHoldInput) => Promise<PlaceReservationHoldResult> };
const defaultDeps: HoldDeps = { place: placeReservationHold };

type BookingRow = { title: string | null; starts_at: string | null; ends_at: string | null; source_inquiry_id: string | null };

async function readBooking(admin: SupabaseClient, tenantId: string, bookingId: string): Promise<BookingRow | "error" | null> {
  const { data, error } = await admin
    .from("agency_bookings")
    .select("title, starts_at, ends_at, source_inquiry_id")
    .eq("tenant_id", tenantId)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    logServerError("project-holds/booking", error);
    return "error";
  }
  return (data as BookingRow | null) ?? null;
}

/** Live holds that belong to this job (its conversation), for the picker and for release. */
export async function loadProjectHolds(admin: SupabaseClient, tenantId: string, inquiryId: string | null): Promise<ProjectHold[] | "unreadable"> {
  if (!inquiryId) return [];
  const { data, error } = await admin
    .from("talent_holds")
    .select("id, talent_profile_id, expires_at")
    .eq("tenant_id", tenantId)
    .eq("inquiry_id", inquiryId)
    .or(unexpiredHoldOrFilter());
  if (error) {
    logServerError("project-holds/load", error);
    return "unreadable";
  }
  return ((data ?? []) as Array<{ id: string; talent_profile_id: string; expires_at: string | null }>).map((r) => ({
    id: r.id,
    talentProfileId: r.talent_profile_id,
    expiresAt: r.expires_at,
  }));
}

export async function holdTalentsForProject(
  admin: SupabaseClient,
  input: { tenantId: string; userId: string; bookingId: string; talentProfileIds: readonly string[] },
  deps: HoldDeps = defaultDeps,
): Promise<HoldTalentsResult> {
  const booking = await readBooking(admin, input.tenantId, input.bookingId);
  if (booking === "error") return { ok: false, reason: "unavailable" };
  if (!booking) return { ok: false, reason: "not_found" };
  // Holds hang off the conversation: without one they could not be listed or released from this job.
  if (!booking.source_inquiry_id) return { ok: false, reason: "no_inquiry" };

  const [held, seats, roster] = await Promise.all([
    loadProjectHolds(admin, input.tenantId, booking.source_inquiry_id),
    admin.from("booking_talent").select("talent_profile_id").eq("tenant_id", input.tenantId).eq("booking_id", input.bookingId),
    admin.from("agency_talent_roster").select("talent_profile_id").eq("tenant_id", input.tenantId).eq("status", "active").in("talent_profile_id", [...input.talentProfileIds]),
  ]);
  // A read that failed is never "nobody": refuse rather than double-hold or hold off-roster.
  if (held === "unreadable" || seats.error || roster.error) {
    if (seats.error) logServerError("project-holds/seats", seats.error);
    if (roster.error) logServerError("project-holds/roster", roster.error);
    return { ok: false, reason: "unavailable" };
  }
  const onRoster = new Set(((roster.data ?? []) as Array<{ talent_profile_id: string }>).map((r) => r.talent_profile_id));
  const assignedIds = ((seats.data ?? []) as Array<{ talent_profile_id: string | null }>).map((r) => r.talent_profile_id).filter((x): x is string => !!x);

  const plan = planJobHolds({
    window: { startsAt: booking.starts_at, endsAt: booking.ends_at },
    picked: input.talentProfileIds,
    assignedIds,
    heldIds: held.map((h) => h.talentProfileId),
  });
  if (!plan.ok) return { ok: false, reason: plan.reason };

  const outcomes: Array<{ talentProfileId: string; outcome: HoldOutcome }> = plan.skipped.map((s) => ({ talentProfileId: s.talentProfileId, outcome: s.reason }));
  let count = 0;
  for (const id of plan.place) {
    if (!onRoster.has(id)) {
      outcomes.push({ talentProfileId: id, outcome: "not_on_roster" });
      continue;
    }
    const r = await deps.place(admin, {
      talentProfileId: id,
      tenantId: input.tenantId,
      inquiryId: booking.source_inquiry_id,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      title: booking.title ?? "Hold",
      expiresAt: plan.expiresAt,
      createdByUserId: input.userId,
    });
    if (r.ok) {
      count += 1;
      outcomes.push({ talentProfileId: id, outcome: "held" });
    } else {
      outcomes.push({ talentProfileId: id, outcome: r.code === "slot_taken" ? "slot_taken" : "failed" });
    }
  }
  return { ok: true, held: count, outcomes };
}

/** Release one hold of this job. The hold must be this workspace's AND this job's conversation. */
export async function releaseProjectHold(
  admin: SupabaseClient,
  input: { tenantId: string; bookingId: string; holdId: string },
): Promise<ReleaseHoldResult> {
  const booking = await readBooking(admin, input.tenantId, input.bookingId);
  if (booking === "error") return { ok: false, reason: "unavailable" };
  if (!booking || !booking.source_inquiry_id) return { ok: false, reason: "not_found" };
  const { data, error } = await admin
    .from("talent_holds")
    .delete()
    .eq("id", input.holdId)
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", booking.source_inquiry_id)
    .select("id");
  if (error) {
    logServerError("project-holds/release", error);
    return { ok: false, reason: "unavailable" };
  }
  return (data ?? []).length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Page-side convenience: opens its own service-role client. Unreadable never shows as "no holds". */
export async function loadProjectHoldsForPage(tenantId: string, inquiryId: string | null): Promise<ProjectHold[] | "unreadable"> {
  const { createServiceRoleClient } = await import("@/lib/supabase/admin");
  const admin = createServiceRoleClient();
  if (!admin) return "unreadable";
  return loadProjectHolds(admin, tenantId, inquiryId);
}
