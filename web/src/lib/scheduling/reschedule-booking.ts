/**
 * Staff reschedule. A thin wrapper over `reschedule_booking_set`.
 *
 * THE DEFECT THIS CLOSES. This module used to place holds, update
 * `agency_bookings`, update each `talent_bookings` mirror and drop the holds
 * as FOUR separate PostgREST requests, which is four transactions. A failure
 * on the third left the agency row moved and the talent mirror where it was,
 * and the compensating rollback was itself a request that could fail. It also
 * defaulted a missing end to start + one hour when it held and when it moved
 * the mirror, but wrote `newEndsAt ?? null` onto the parent — so the parent
 * and its own mirror disagreed about when the job ends, on purpose. And
 * nothing moved the capacity allocations at all: a booking moved to Tuesday
 * still held Monday's room and Monday's slot.
 *
 * WHAT THIS FILE DOES NOW. Three things, and none of them is a write:
 *
 *   1. Resolve the end ONCE. The offering's duration when the booking has one,
 *      otherwise start + sixty minutes. The SAME value goes to the parent row,
 *      the mirrors and the allocations, because it is one argument to one call.
 *   2. Resolve the buffers. Before: the talent's `buffer_before_min`. After:
 *      the larger of the talent's `buffer_after_min` and the turnaround the
 *      venue's space carries (`spaces.turn_minutes`), because a table that
 *      needs twenty minutes to reset needs them whoever is working it.
 *   3. Call the RPC and map its refusal to a reason.
 *
 * The hold / update / rollback choreography is gone. It lives in one
 * transaction in 20261231010200_reschedule_booking_set.sql, where a refusal
 * rolls the whole move back instead of trying to undo it with another request.
 *
 * WHY A READ FAILURE IS NOT ALWAYS FATAL. Failing to read the offering's
 * duration would silently store a different end than the operator's booking
 * asks for, so that refuses. Failing to read a buffer only narrows a guard
 * window that still covers the real service time, so that is logged and the
 * move goes ahead: refusing a legitimate reschedule because a turnaround
 * lookup blipped is the worse failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/** The end when nothing else says otherwise. Matches the public slot default. */
export const RESCHEDULE_DEFAULT_MINUTES = 60;

/** Ceiling the RPC enforces on either buffer, in minutes. */
const MAX_BUFFER_MINUTES = 1440;

type Admin = Pick<SupabaseClient, "from" | "rpc">;

export type RescheduleBookingInput = {
  tenantId: string;
  bookingId: string;
  newStartsAt: string;
  newEndsAt: string | null;
  actorUserId: string;
  /**
   * Correlation id for this attempt. The RPC does not store it; idempotency
   * there is structural (a retry finds the booking already at the window and
   * answers `already`). It exists so the audit line and the write share an id.
   */
  operationKey?: string | null;
  /** The window the operator was looking at. A mismatch is `conflict`. */
  expectedStartsAt?: string | null;
  expectedEndsAt?: string | null;
};

export type RescheduleBookingReason =
  | "not_found"
  | "wrong_tenant"
  | "not_reschedulable"
  | "conflict"
  | "invalid"
  | "slot_taken"
  | "sold_out"
  | "ancestor_full"
  | "deadlock"
  | "unavailable";

export type RescheduleBookingResult =
  | {
      ok: true;
      already: boolean;
      previous: { startsAt: string | null; endsAt: string | null };
      startsAt: string;
      endsAt: string;
      movedTalentBookings: number;
      movedAllocations: number;
    }
  | {
      ok: false;
      reason: RescheduleBookingReason;
      error: string;
      failedPoolId: string | null;
      failedTalentId: string | null;
    };

const REASON_TEXT: Record<RescheduleBookingReason, string> = {
  not_found: "Booking not found in this workspace.",
  wrong_tenant: "Booking not found in this workspace.",
  not_reschedulable: "This booking cannot be moved.",
  conflict: "This booking changed while you were looking at it. Reload and try again.",
  invalid: "End must be after start.",
  slot_taken: "That time is already booked for this talent. Pick another time.",
  sold_out: "That space is full at the new time. Pick another time.",
  ancestor_full: "The room this booking sits in is full at the new time.",
  deadlock: "Could not move that booking. Try again.",
  unavailable: "Could not move that booking.",
};

const KNOWN_REASONS = new Set<string>(Object.keys(REASON_TEXT));

function toReason(raw: unknown): RescheduleBookingReason {
  return typeof raw === "string" && KNOWN_REASONS.has(raw)
    ? (raw as RescheduleBookingReason)
    : "unavailable";
}

function clampMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const n = Math.trunc(value);
  if (n <= 0) return 0;
  return Math.min(n, MAX_BUFFER_MINUTES);
}

/**
 * The single place an end time is decided. Explicit wins; then the offering's
 * duration; then sixty minutes. Returns null when the start is unusable.
 */
export function resolveRescheduleEndsAt(
  startsAt: string,
  explicitEndsAt: string | null | undefined,
  offeringDurationMinutes: number | null,
): string | null {
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return null;
  if (explicitEndsAt) {
    const endMs = Date.parse(explicitEndsAt);
    if (!Number.isFinite(endMs) || endMs <= startMs) return null;
    return new Date(endMs).toISOString();
  }
  const minutes =
    offeringDurationMinutes != null &&
    Number.isFinite(offeringDurationMinutes) &&
    offeringDurationMinutes > 0
      ? Math.trunc(offeringDurationMinutes)
      : RESCHEDULE_DEFAULT_MINUTES;
  return new Date(startMs + minutes * 60_000).toISOString();
}

/**
 * Buffers in seconds. Before is the talent's own lead-in. After is the larger
 * of the talent's lead-out and the space's turnaround, because both have to
 * pass before the next party can be sold that time.
 */
export function resolveRescheduleBuffers(
  hoursRows: ReadonlyArray<{ buffer_before_min?: unknown; buffer_after_min?: unknown }>,
  spaceTurnMinutes: ReadonlyArray<unknown>,
): { beforeSeconds: number; afterSeconds: number } {
  let before = 0;
  let after = 0;
  for (const row of hoursRows) {
    before = Math.max(before, clampMinutes(row.buffer_before_min));
    after = Math.max(after, clampMinutes(row.buffer_after_min));
  }
  for (const turn of spaceTurnMinutes) {
    after = Math.max(after, clampMinutes(turn));
  }
  return { beforeSeconds: before * 60, afterSeconds: after * 60 };
}

function fail(
  reason: RescheduleBookingReason,
  overrides?: { error?: string; failedPoolId?: string | null; failedTalentId?: string | null },
): RescheduleBookingResult {
  return {
    ok: false,
    reason,
    error: overrides?.error ?? REASON_TEXT[reason],
    failedPoolId: overrides?.failedPoolId ?? null,
    failedTalentId: overrides?.failedTalentId ?? null,
  };
}

/** Offering duration for this booking's order, or null when it has none. */
async function offeringDurationForOrder(
  admin: Admin,
  orderLines: ReadonlyArray<{ id: string; offering_id: string | null }>,
): Promise<{ ok: true; minutes: number | null } | { ok: false }> {
  const offeringIds = orderLines
    .map((line) => line.offering_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (offeringIds.length === 0) return { ok: true, minutes: null };

  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, duration_minutes")
    .in("id", offeringIds);
  if (error) {
    logServerError("scheduling.rescheduleBooking/offering", error);
    return { ok: false };
  }
  const rows = (data ?? []) as Array<{ id: string; duration_minutes: number | null }>;
  // Follow the line order, not the row order PostgREST happened to return.
  for (const line of orderLines) {
    const row = rows.find((r) => r.id === line.offering_id);
    const minutes = row?.duration_minutes ?? null;
    if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
      return { ok: true, minutes: Math.trunc(minutes) };
    }
  }
  return { ok: true, minutes: null };
}

/**
 * Turnaround minutes carried by every space this booking's allocations sit in.
 *
 * THIS IS THE PER-SPACE OVERRIDE ONLY. `spaces.turn_minutes` is documented in
 * 20261229000221 as "a per-space override of the service window's turn time",
 * and the DEFAULT turn lives in Reservations' service rules, banded by party
 * size. Reaching that default needs a party size and an active service window,
 * neither of which an `agency_bookings` row carries. So a space with no
 * override contributes no after-buffer here, and the guard hold is narrower
 * than a restaurant's own reservation grid would draw it. Widening it means
 * Reservations exposing "turn minutes for this allocation", not this file
 * guessing 90.
 */
async function spaceTurnMinutesForOrder(
  admin: Admin,
  tenantId: string,
  orderLineIds: ReadonlyArray<string>,
): Promise<number[]> {
  if (orderLineIds.length === 0) return [];

  const { data: allocData, error: allocErr } = await admin
    .from("capacity_allocations")
    .select("id")
    .eq("tenant_id", tenantId)
    .neq("state", "released")
    .in("order_line_id", orderLineIds);
  if (allocErr) {
    logServerError("scheduling.rescheduleBooking/allocations", allocErr);
    return [];
  }
  const allocationIds = ((allocData ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (allocationIds.length === 0) return [];

  const { data: seatData, error: seatErr } = await admin
    .from("space_assignments")
    .select("space_id")
    .eq("tenant_id", tenantId)
    .in("allocation_id", allocationIds);
  if (seatErr) {
    logServerError("scheduling.rescheduleBooking/space_assignments", seatErr);
    return [];
  }
  const spaceIds = ((seatData ?? []) as Array<{ space_id: string }>).map((row) => row.space_id);
  if (spaceIds.length === 0) return [];

  const { data: spaceData, error: spaceErr } = await admin
    .from("spaces")
    .select("turn_minutes")
    .eq("tenant_id", tenantId)
    .in("id", spaceIds);
  if (spaceErr) {
    logServerError("scheduling.rescheduleBooking/spaces", spaceErr);
    return [];
  }
  return ((spaceData ?? []) as Array<{ turn_minutes: number | null }>).map(
    (row) => row.turn_minutes ?? 0,
  );
}

/** Buffer rows for every talent this booking mirrors onto. */
async function talentHoursForInquiry(
  admin: Admin,
  tenantId: string,
  inquiryId: string | null,
): Promise<Array<{ buffer_before_min: number | null; buffer_after_min: number | null }>> {
  if (!inquiryId) return [];

  const { data: mirrorData, error: mirrorErr } = await admin
    .from("talent_bookings")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("inquiry_id", inquiryId)
    .neq("status", "cancelled");
  if (mirrorErr) {
    logServerError("scheduling.rescheduleBooking/mirrors", mirrorErr);
    return [];
  }
  const talentIds = ((mirrorData ?? []) as Array<{ talent_profile_id: string }>).map(
    (row) => row.talent_profile_id,
  );
  if (talentIds.length === 0) return [];

  const { data: hoursData, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select("buffer_before_min, buffer_after_min")
    .eq("tenant_id", tenantId)
    .in("talent_profile_id", talentIds);
  if (hoursErr) {
    logServerError("scheduling.rescheduleBooking/hours", hoursErr);
    return [];
  }
  return (hoursData ?? []) as Array<{
    buffer_before_min: number | null;
    buffer_after_min: number | null;
  }>;
}

export async function rescheduleBooking(
  admin: Admin,
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  if (!input.newStartsAt || !Number.isFinite(Date.parse(input.newStartsAt))) {
    return fail("invalid", { error: "Start date is not valid." });
  }

  const { data: bookingData, error: lookupErr } = await admin
    .from("agency_bookings")
    .select("id, order_id, source_inquiry_id, starts_at, ends_at")
    .eq("id", input.bookingId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (lookupErr) {
    logServerError("scheduling.rescheduleBooking/lookup", lookupErr);
    return fail("unavailable", { error: "Could not load that booking." });
  }
  if (!bookingData) return fail("not_found");
  const booking = bookingData as {
    id: string;
    order_id: string | null;
    source_inquiry_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
  };

  // Order lines are read once and used twice: the offering's duration decides
  // the end, and the allocations hanging off them carry the turnaround.
  let orderLines: Array<{ id: string; offering_id: string | null }> = [];
  if (booking.order_id) {
    const { data: lineData, error: lineErr } = await admin
      .from("order_lines")
      .select("id, offering_id, sort_order")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", booking.order_id)
      .order("sort_order", { ascending: true });
    if (lineErr) {
      logServerError("scheduling.rescheduleBooking/order_lines", lineErr);
      return fail("unavailable", { error: "Could not load that booking." });
    }
    orderLines = (lineData ?? []) as typeof orderLines;
  }

  let durationMinutes: number | null = null;
  if (!input.newEndsAt) {
    const duration = await offeringDurationForOrder(admin, orderLines);
    // A guessed end is a wrong end written to three tables. Refuse instead.
    if (!duration.ok) return fail("unavailable", { error: "Could not load that booking." });
    durationMinutes = duration.minutes;
  }

  const endsAt = resolveRescheduleEndsAt(input.newStartsAt, input.newEndsAt, durationMinutes);
  if (!endsAt) return fail("invalid");

  const [hoursRows, turnMinutes] = await Promise.all([
    talentHoursForInquiry(admin, input.tenantId, booking.source_inquiry_id),
    spaceTurnMinutesForOrder(
      admin,
      input.tenantId,
      orderLines.map((line) => line.id),
    ),
  ]);
  const buffers = resolveRescheduleBuffers(hoursRows, turnMinutes);

  const operationKey =
    input.operationKey?.trim() || `reschedule:${input.bookingId}:${input.newStartsAt}`;

  const { data, error } = await admin.rpc("reschedule_booking_set", {
    p_tenant_id: input.tenantId,
    p_booking_id: input.bookingId,
    p_operation_key: operationKey,
    p_actor_id: input.actorUserId || null,
    p_starts_at: input.newStartsAt,
    p_ends_at: endsAt,
    p_buffer_before_seconds: buffers.beforeSeconds,
    p_buffer_after_seconds: buffers.afterSeconds,
    p_expected_starts_at: input.expectedStartsAt ?? null,
    p_expected_ends_at: input.expectedEndsAt ?? null,
  });
  if (error) {
    logServerError("scheduling.rescheduleBooking/rpc", error);
    return fail("unavailable");
  }

  const reply = (data ?? {}) as {
    ok?: boolean;
    already?: boolean;
    reason?: string;
    previous_starts_at?: string | null;
    previous_ends_at?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    moved_talent_bookings?: number;
    moved_allocations?: number;
    failed_pool_id?: string | null;
    failed_talent_id?: string | null;
  };

  if (reply.ok !== true) {
    return fail(toReason(reply.reason), {
      failedPoolId: reply.failed_pool_id ?? null,
      failedTalentId: reply.failed_talent_id ?? null,
    });
  }

  return {
    ok: true,
    already: reply.already === true,
    previous: {
      startsAt: reply.previous_starts_at ?? null,
      endsAt: reply.previous_ends_at ?? null,
    },
    startsAt: reply.starts_at ?? input.newStartsAt,
    endsAt: reply.ends_at ?? endsAt,
    movedTalentBookings: reply.moved_talent_bookings ?? 0,
    movedAllocations: reply.moved_allocations ?? 0,
  };
}
