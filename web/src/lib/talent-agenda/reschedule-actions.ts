/**
 * Reschedule request actions (T1.8).
 */

"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { rescheduleBooking } from "@/lib/scheduling/reschedule-booking";
import { unexpiredHoldOrFilter } from "@/lib/scheduling/hold-expiry";
import { logServerError } from "@/lib/server/safe-error";
import { requirePlatformTalentContext } from "@/lib/talent/platform-talent-context";

const RESCHEDULE_HOLD_MINUTES = 10;

export type RescheduleActionResult = {
  ok: boolean;
  reason: string;
  requestId?: string;
};

type BookingTarget = {
  id: string;
  tenant_id: string;
  title: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  contact_name: string | null;
  source_inquiry_id: string | null;
};

function overlaps(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(rightStart) < Date.parse(leftEnd);
}

function revalidateTalentAgendaPaths(bookingId?: string) {
  revalidatePath("/talent/today");
  revalidatePath("/talent/calendar");
  revalidatePath("/talent/attention");
  if (bookingId) {
    revalidatePath(`/talent/bookings/${bookingId}`);
  }
}

async function loadAuthorizedBookingTarget(
  bookingId: string,
  talentProfileId: string,
): Promise<BookingTarget | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: membership, error: membershipErr } = await admin
    .from("booking_talent")
    .select("booking_id")
    .eq("booking_id", bookingId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (membershipErr) {
    logServerError("agenda.reschedule.membership", membershipErr);
    return null;
  }
  if (!membership) return null;

  const { data: booking, error } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, title, status, starts_at, ends_at, contact_name, source_inquiry_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.reschedule.booking", error);
    return null;
  }
  return (booking as BookingTarget | null) ?? null;
}

async function cleanupHold(holdId: string | null | undefined) {
  if (!holdId) return;
  const admin = createServiceRoleClient();
  if (!admin) return;
  const { error } = await admin.from("talent_holds").delete().eq("id", holdId);
  if (error) logServerError("agenda.reschedule.cleanupHold", error);
}

async function hasBusyConflict(input: {
  talentProfileId: string;
  bookingId: string;
  startsAt: string;
  endsAt: string;
  nowIso: string;
}): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return true;

  const [holdsRes, bookingsRes, blocksRes] = await Promise.all([
    admin
      .from("talent_holds")
      .select("starts_at, ends_at, expires_at")
      .eq("talent_profile_id", input.talentProfileId)
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt)
      .or(unexpiredHoldOrFilter(new Date(input.nowIso))),
    admin
      .from("talent_bookings")
      .select("id, starts_at, ends_at, status")
      .eq("talent_profile_id", input.talentProfileId)
      .neq("id", input.bookingId)
      .neq("status", "cancelled")
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt),
    admin
      .from("talent_availability_blocks")
      .select("starts_at, ends_at")
      .eq("talent_profile_id", input.talentProfileId)
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt),
  ]);

  const error = holdsRes.error ?? bookingsRes.error ?? blocksRes.error;
  if (error) {
    logServerError("agenda.reschedule.busy", error);
    return true;
  }

  const liveHold = ((holdsRes.data ?? []) as Array<{
    starts_at: string;
    ends_at: string;
    expires_at: string | null;
  }>).some((row) => {
    if (row.expires_at && row.expires_at <= input.nowIso) return false;
    return overlaps(row.starts_at, row.ends_at, input.startsAt, input.endsAt);
  });
  if (liveHold) return true;

  const bookingConflict = ((bookingsRes.data ?? []) as Array<{
    starts_at: string;
    ends_at: string;
  }>).some((row) => overlaps(row.starts_at, row.ends_at, input.startsAt, input.endsAt));
  if (bookingConflict) return true;

  return ((blocksRes.data ?? []) as Array<{
    starts_at: string;
    ends_at: string;
  }>).some((row) => overlaps(row.starts_at, row.ends_at, input.startsAt, input.endsAt));
}

export async function proposeReschedule(input: {
  bookingId: string;
  newStartsAt: string;
  newEndsAt: string;
  feeCents?: number;
  expiresAt?: string;
}): Promise<RescheduleActionResult> {
  const ctx = await requirePlatformTalentContext();
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  if (
    !Number.isFinite(Date.parse(input.newStartsAt)) ||
    !Number.isFinite(Date.parse(input.newEndsAt)) ||
    Date.parse(input.newEndsAt) <= Date.parse(input.newStartsAt)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const booking = await loadAuthorizedBookingTarget(input.bookingId, ctx.talentProfileId);
  if (!booking) return { ok: false, reason: "not_found" };
  if (!["confirmed", "in_progress", "tentative"].includes((booking.status ?? "").toLowerCase())) {
    return { ok: false, reason: "not_reschedulable" };
  }

  if (
    booking.starts_at === input.newStartsAt &&
    booking.ends_at === input.newEndsAt
  ) {
    return { ok: true, reason: "already" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = input.expiresAt
    ?? new Date(now.getTime() + RESCHEDULE_HOLD_MINUTES * 60_000).toISOString();

  const { data: pendingExisting, error: pendingErr } = await admin
    .from("booking_reschedule_requests")
    .select("id, new_starts_at, new_ends_at, expires_at")
    .eq("booking_id", input.bookingId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (pendingErr) {
    logServerError("agenda.proposeReschedule.pending", pendingErr);
    return { ok: false, reason: "unavailable" };
  }
  const existing = ((pendingExisting ?? []) as Array<{
    id: string;
    new_starts_at: string;
    new_ends_at: string;
    expires_at: string | null;
  }>).find((row) => !row.expires_at || row.expires_at > nowIso);
  if (existing) {
    if (
      existing.new_starts_at === input.newStartsAt &&
      existing.new_ends_at === input.newEndsAt
    ) {
      return { ok: true, reason: "already", requestId: existing.id };
    }
    return { ok: false, reason: "pending_exists" };
  }

  const conflict = await hasBusyConflict({
    talentProfileId: ctx.talentProfileId,
    bookingId: input.bookingId,
    startsAt: input.newStartsAt,
    endsAt: input.newEndsAt,
    nowIso,
  });
  if (conflict) return { ok: false, reason: "slot_taken" };

  const { data: holdData, error: holdErr } = await admin
    .from("talent_holds")
    .insert({
      talent_profile_id: ctx.talentProfileId,
      tenant_id: booking.tenant_id,
      inquiry_id: booking.source_inquiry_id,
      title: booking.title,
      client_label: booking.contact_name,
      starts_at: input.newStartsAt,
      ends_at: input.newEndsAt,
      all_day: false,
      hold_strength: "firm",
      expires_at: expiresAt,
      created_by_user_id: ctx.userId,
    } as never)
    .select("id")
    .single();
  if (holdErr || !holdData) {
    logServerError("agenda.proposeReschedule.hold", holdErr);
    return { ok: false, reason: "slot_taken" };
  }

  const { data, error } = await admin
    .from("booking_reschedule_requests")
    .insert({
      booking_id: input.bookingId,
      requested_by: "talent",
      new_starts_at: input.newStartsAt,
      new_ends_at: input.newEndsAt,
      fee_cents: Math.max(0, input.feeCents ?? 0),
      status: "pending",
      hold_id: holdData.id,
      expires_at: expiresAt,
    } as never)
    .select("id")
    .single();

  if (error) {
    logServerError("agenda.proposeReschedule", error);
    await cleanupHold(holdData.id);
    return { ok: false, reason: "unavailable" };
  }
  revalidateTalentAgendaPaths(input.bookingId);
  return { ok: true, reason: "pending", requestId: data.id };
}

export async function respondToReschedule(input: {
  requestId: string;
  accept: boolean;
}): Promise<RescheduleActionResult> {
  const ctx = await requirePlatformTalentContext();
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("booking_reschedule_requests")
    .select("id, status, booking_id, new_starts_at, new_ends_at, fee_cents, hold_id, expires_at")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error || !row) {
    if (error) logServerError("agenda.respondToReschedule.load", error);
    return { ok: false, reason: "not_found" };
  }
  if (row.status !== "pending") return { ok: true, reason: "already" };

  const booking = await loadAuthorizedBookingTarget(row.booking_id, ctx.talentProfileId);
  if (!booking) return { ok: false, reason: "not_found" };

  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    await admin
      .from("booking_reschedule_requests")
      .update({ status: "expired" } as never)
      .eq("id", input.requestId);
    await cleanupHold(row.hold_id);
    revalidateTalentAgendaPaths(row.booking_id);
    return { ok: false, reason: "expired" };
  }

  if (!input.accept) {
    const { error: declineErr } = await admin
      .from("booking_reschedule_requests")
      .update({ status: "declined" } as never)
      .eq("id", input.requestId);
    if (declineErr) {
      logServerError("agenda.respondToReschedule.decline", declineErr);
      return { ok: false, reason: "unavailable" };
    }
    await cleanupHold(row.hold_id);
    revalidateTalentAgendaPaths(row.booking_id);
    return { ok: true, reason: "declined" };
  }

  if ((row.fee_cents ?? 0) > 0) {
    return { ok: false, reason: "fee_payment_required" };
  }

  const moved = await rescheduleBooking(admin, {
    tenantId: booking.tenant_id,
    bookingId: row.booking_id,
    newStartsAt: row.new_starts_at,
    newEndsAt: row.new_ends_at,
    actorUserId: ctx.userId,
    expectedStartsAt: booking.starts_at,
    expectedEndsAt: booking.ends_at,
  });
  if (!moved.ok) {
    if (moved.reason === "slot_taken" || moved.reason === "conflict") {
      await admin
        .from("booking_reschedule_requests")
        .update({ status: "conflict" } as never)
        .eq("id", input.requestId);
      await cleanupHold(row.hold_id);
    }
    return { ok: false, reason: moved.reason };
  }

  const { error: upErr } = await admin
    .from("booking_reschedule_requests")
    .update({ status: "accepted" } as never)
    .eq("id", input.requestId);
  if (upErr) {
    logServerError("agenda.respondToReschedule.accept", upErr);
    return { ok: false, reason: "unavailable" };
  }
  await cleanupHold(row.hold_id);
  revalidateTalentAgendaPaths(row.booking_id);
  return { ok: true, reason: moved.already ? "already" : "accepted" };
}
