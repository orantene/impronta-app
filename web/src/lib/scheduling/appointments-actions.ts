"use server";

/**
 * appointments-actions.ts — the read and write paths behind Operate →
 * Appointments.
 *
 * WHAT THIS FILE IS NOT
 * ═════════════════════
 * It is not a second scheduling engine. Every decision it needs is already
 * made somewhere:
 *
 *   - moving a booking is `rescheduleBooking` → `reschedule_booking_set`,
 *     which moves the parent row, every talent mirror and every capacity
 *     allocation in ONE transaction, or none of them;
 *   - how many seats a session has left is `capacity_remaining_public`, never
 *     a count of rows here;
 *   - who is next on a waitlist is `nextWaitlistInvite`, the pure rule that has
 *     been in `class-waitlist.ts` since M4;
 *   - accepting proposed booking hours is `acceptBookingHoursProposal`, and
 *     this file links to it rather than reimplementing it, because a second
 *     write path into `talent_booking_hours` is exactly what T1-07 removed.
 *
 * WHAT IS LEFT HERE IS WHAT ONLY A REQUEST HAS. The staff check, the audit
 * line, the revalidate, and the buckets that let the client render without
 * looking at a clock. Everything else moved to modules that take the admin
 * client as an ARGUMENT — `waitlist-desk.ts`, `reschedule-desk.ts`,
 * `appointments-lookups.ts` — for a reason that is not tidiness: an export of
 * a `"use server"` file can only ever be reached by a signed-in browser
 * request, so while the waitlist journey lived in here the only way to
 * exercise it was a human clicking, and nobody ever did. It shipped dead.
 * `scripts/proof-appointments-journey.ts` now drives those modules against the
 * isolated database, so what is proven is what these actions run.
 *
 * TENANT SCOPE IS IN THE QUERY, NOT ONLY IN RLS. These run under the service
 * role, so RLS does not apply. `requireWorkspaceStaffAction` proves the caller
 * is staff of a tenant, and every query then filters on THAT tenant id — the
 * two-predicate pattern `schedule-actions.ts` established. One alone lets a
 * staff member of workspace A read workspace B by passing its id.
 */

import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { logBookingActivity } from "@/lib/server/commercial-audit";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import { rescheduleWithNames } from "@/lib/scheduling/reschedule-desk";
import {
  describeRescheduleRefusal,
  type RescheduleRefusal,
} from "@/lib/scheduling/reschedule-refusal";
import {
  bucketForStart,
  nextActionFor,
  type AppointmentRow,
} from "@/lib/scheduling/appointments-board";
import {
  placeNamesByOrder,
  servingNamesByInquiry,
} from "@/lib/scheduling/appointments-lookups";
import {
  acceptWaitlistOffer,
  cancelWaitlistSeat,
  declineWaitlistOffer,
  promoteWaitlistEntry,
  type AcceptWaitlistRefusalKey,
  type PromoteWaitlistRefusalKey,
  type ReleaseWaitlistRefusalKey,
  type WaitlistStoredStatus,
} from "@/lib/scheduling/session-waitlist";
import {
  joinWaitlist,
  loadWaitlistDesk,
  type JoinWaitlistResult,
  type WaitlistDeskResult,
} from "@/lib/scheduling/waitlist-desk";

/** How far ahead the board looks. Ninety days matches the materialiser. */
const HORIZON_DAYS = 90;
/** How far back, so a job that ran yesterday is still on the screen. */
const LOOKBACK_DAYS = 7;

const GENERIC_LOAD_ERROR = "Could not load the appointments.";

export type AppointmentsResult =
  | { ok: true; rows: AppointmentRow[]; timeZone: string }
  | { ok: false; error: string };

type Scope = { tenantId: string; tenantSlug: string; userId: string };

async function scopedTo(tenantId: string): Promise<
  { ok: true; scope: Scope } | { ok: false; error: string }
> {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, error: staff.error };
  if (staff.tenantId !== tenantId) {
    return { ok: false, error: "Not authorized for this workspace." };
  }
  return {
    ok: true,
    scope: { tenantId: staff.tenantId, tenantSlug: staff.tenantSlug, userId: staff.user.id },
  };
}

/**
 * The appointments list: who it is with, who is serving, where, and its state.
 *
 * The bucket is decided HERE, against the workspace's own zone, and travels
 * with the row. The client never computes "today", because a row that is
 * upcoming when the server renders and today when the browser hydrates is a
 * mismatch nothing in the build can see.
 */
export async function loadAppointments(tenantId: string): Promise<AppointmentsResult> {
  try {
    const scoped = await scopedTo(tenantId);
    if (!scoped.ok) return { ok: false, error: scoped.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    const now = new Date();
    const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const to = new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString();

    const { timezone: tenantZone } = await resolveTenantTimezone(tenantId);

    // Dated bookings in the window, plus the undated ones, which have no
    // `starts_at` to filter on and would otherwise never appear at all.
    const columns =
      "id, title, status, starts_at, ends_at, timezone, contact_name, client_account_name, source_inquiry_id, order_id";
    const [dated, undated] = await Promise.all([
      admin
        .from("agency_bookings")
        .select(columns)
        .eq("tenant_id", tenantId)
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at", { ascending: true })
        .limit(400),
      admin
        .from("agency_bookings")
        .select(columns)
        .eq("tenant_id", tenantId)
        .is("starts_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (dated.error) {
      logServerError("scheduling.loadAppointments/dated", dated.error);
      return { ok: false, error: GENERIC_LOAD_ERROR };
    }
    if (undated.error) {
      logServerError("scheduling.loadAppointments/undated", undated.error);
      return { ok: false, error: GENERIC_LOAD_ERROR };
    }

    type BookingRow = {
      id: string;
      title: string | null;
      status: string | null;
      starts_at: string | null;
      ends_at: string | null;
      timezone: string | null;
      contact_name: string | null;
      client_account_name: string | null;
      source_inquiry_id: string | null;
      order_id: string | null;
    };
    const bookings = [
      ...((dated.data ?? []) as BookingRow[]),
      ...((undated.data ?? []) as BookingRow[]),
    ];
    if (bookings.length === 0) return { ok: true, rows: [], timeZone: tenantZone };

    const servedBy = await servingNamesByInquiry(
      admin,
      tenantId,
      bookings.map((b) => b.source_inquiry_id).filter((id): id is string => Boolean(id)),
    );
    const places = await placeNamesByOrder(
      admin,
      tenantId,
      bookings.map((b) => b.order_id).filter((id): id is string => Boolean(id)),
    );

    const rows: AppointmentRow[] = bookings.map((b) => {
      const zone = b.timezone && b.timezone.trim() ? b.timezone.trim() : tenantZone;
      const bucket = bucketForStart(b.starts_at, now, zone);
      const status = typeof b.status === "string" ? b.status : "";
      return {
        id: b.id,
        title: b.title?.trim() || "Untitled booking",
        status,
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        // The person is the contact; the company is the fallback. An empty
        // string is not a name, so it stays null and the row says so.
        customerName: b.contact_name?.trim() || b.client_account_name?.trim() || null,
        servedBy: b.source_inquiry_id ? (servedBy.get(b.source_inquiry_id) ?? []) : [],
        places: b.order_id ? (places.get(b.order_id) ?? []) : [],
        timeZone: zone,
        bucket,
        nextAction: nextActionFor({ status, bucket }),
      };
    });

    return { ok: true, rows, timeZone: tenantZone };
  } catch (err) {
    logServerError("scheduling.loadAppointments", err);
    return { ok: false, error: GENERIC_LOAD_ERROR };
  }
}

/* ── reschedule ────────────────────────────────────────────────────────────── */

export type RescheduleAppointmentResult =
  | { ok: true; already: boolean; startsAt: string; endsAt: string }
  | { ok: false; refusal: RescheduleRefusal };

/**
 * Move a booking, or refuse with a sentence that names what stood in the way.
 *
 * The move itself and the id-to-name resolution are `rescheduleWithNames`,
 * which takes the client as an argument so a script can drive the identical
 * path. What stays here is what only a request has: the staff check, the audit
 * line, and the revalidate.
 */
export async function rescheduleAppointment(input: {
  tenantId: string;
  bookingId: string;
  newStartsAt: string;
  newEndsAt: string | null;
  expectedStartsAt: string | null;
  expectedEndsAt: string | null;
}): Promise<RescheduleAppointmentResult> {
  try {
    const scoped = await scopedTo(input.tenantId);
    if (!scoped.ok) {
      return { ok: false, refusal: describeRescheduleRefusal({ reason: "not_found" }) };
    }
    const admin = createServiceRoleClient();
    if (!admin) {
      return { ok: false, refusal: describeRescheduleRefusal({ reason: "unavailable" }) };
    }

    const moved = await rescheduleWithNames(admin, {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      newStartsAt: input.newStartsAt,
      newEndsAt: input.newEndsAt,
      actorUserId: scoped.scope.userId,
      expectedStartsAt: input.expectedStartsAt,
      expectedEndsAt: input.expectedEndsAt,
    });

    if (!moved.ok) return moved;

    // The audit line carries the RESOLVED window, the one actually stored, not
    // the caller's possibly-null end.
    await logBookingActivity(admin, {
      bookingId: input.bookingId,
      actorUserId: scoped.scope.userId,
      eventType: BOOKING_AUDIT.STATUS_CHANGED,
      payload: {
        kind: "rescheduled",
        surface: "appointments",
        previous: { starts_at: moved.previous.startsAt, ends_at: moved.previous.endsAt },
        next: { starts_at: moved.startsAt, ends_at: moved.endsAt },
        already: moved.already,
      },
    });

    revalidatePath(`/${scoped.scope.tenantSlug}`, "layout");
    return { ok: true, already: moved.already, startsAt: moved.startsAt, endsAt: moved.endsAt };
  } catch (err) {
    logServerError("scheduling.rescheduleAppointment", err);
    return { ok: false, refusal: describeRescheduleRefusal({ reason: "unavailable" }) };
  }
}

/* ── the waitlist ──────────────────────────────────────────────────────────── */

// The read and the join live in `waitlist-desk.ts`, which takes the client as
// an argument. These two are the auth wrappers over it. The split is not
// cosmetic: an export of a `"use server"` module can only be reached by a
// signed-in browser request, so while the whole journey lived here the ONLY
// way to exercise it was a human clicking, and nobody ever did. The desk
// module is driven end to end against the isolated database by
// `scripts/proof-appointments-journey.ts`, running the same functions this
// screen runs.

export type { WaitlistSeats, WaitlistView, WaitlistDeskResult } from "@/lib/scheduling/waitlist-desk";
export type { JoinWaitlistRefusalKey, JoinWaitlistResult } from "@/lib/scheduling/waitlist-desk";

/** The desk's own result shape; the refusal arm already carries the sentence. */
export type WaitlistResult = WaitlistDeskResult;

/**
 * Every session this workspace should be looking at a queue for: the ones
 * somebody is already waiting for, and the ones the engine says are full.
 *
 * The second half is what makes the journey startable. Before it, this
 * returned an empty list for a workspace whose class had just sold out with
 * nobody queued, the screen drew its empty state, and the control that adds
 * the first person — which sits on a session card — never rendered.
 */
export async function loadSessionWaitlists(
  tenantId: string,
  /**
   * A session the operator opened from the Sessions view. It is read whatever
   * the near-horizon cap says, so that door can never lead to a screen the
   * class is missing from.
   */
  alwaysInclude: string | null = null,
): Promise<WaitlistResult> {
  try {
    const scoped = await scopedTo(tenantId);
    if (!scoped.ok) return { ok: false, error: scoped.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };
    return await loadWaitlistDesk(admin, tenantId, new Date(), { alwaysInclude });
  } catch (err) {
    logServerError("scheduling.loadSessionWaitlists", err);
    return { ok: false, error: "Could not load the waitlist." };
  }
}

export type PromoteResult =
  | { ok: true; already: boolean; offerExpiresAt: string | null }
  | { ok: false; refusalKey: PromoteWaitlistRefusalKey; outstandingOffers: number | null };

/**
 * Offer a freed place to one person on the queue.
 *
 * `expectedStatus` is what the operator's row SAID. The RPC refuses with
 * `conflict` when the stored status has moved on, so a screen left open while
 * a colleague worked the same list cannot promote somebody who has already
 * accepted, declined, or been offered a place by somebody else.
 */
export async function promoteFromWaitlist(input: {
  tenantId: string;
  entryId: string;
  expectedStatus: WaitlistStoredStatus;
}): Promise<PromoteResult> {
  try {
    const scoped = await scopedTo(input.tenantId);
    if (!scoped.ok) return { ok: false, refusalKey: "notFound", outstandingOffers: null };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, refusalKey: "unavailable", outstandingOffers: null };

    const result = await promoteWaitlistEntry(admin, {
      tenantId: input.tenantId,
      entryId: input.entryId,
      actorUserId: scoped.scope.userId,
      expectedStatus: input.expectedStatus,
    });
    if (!result.ok) {
      return {
        ok: false,
        refusalKey: result.refusalKey,
        outstandingOffers: result.outstandingOffers,
      };
    }
    return { ok: true, already: result.already, offerExpiresAt: result.offerExpiresAt };
  } catch (err) {
    logServerError("scheduling.promoteFromWaitlist", err);
    return { ok: false, refusalKey: "unavailable", outstandingOffers: null };
  }
}

export type AcceptWaitlistOfferResult =
  | { ok: true; already: boolean; units: number }
  | { ok: false; refusalKey: AcceptWaitlistRefusalKey };

/**
 * Take the offered place, and the seat with it (D-105).
 *
 * The seat is the point. Before this existed the only way an entry became
 * `accepted` was a hand-written UPDATE, which held no capacity at all: the
 * pool went straight back to reporting the place free while the screen said
 * somebody had taken it, and the next promote gave the same seat away. The
 * RPC reserves and commits a real allocation for the party in the same
 * transaction, and the table now refuses `accepted` without one.
 */
export async function acceptWaitlistPlace(input: {
  tenantId: string;
  entryId: string;
  expectedStatus: WaitlistStoredStatus;
}): Promise<AcceptWaitlistOfferResult> {
  try {
    const scoped = await scopedTo(input.tenantId);
    if (!scoped.ok) return { ok: false, refusalKey: "notFound" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, refusalKey: "unavailable" };

    const result = await acceptWaitlistOffer(admin, {
      tenantId: input.tenantId,
      entryId: input.entryId,
      actorUserId: scoped.scope.userId,
      expectedStatus: input.expectedStatus,
    });
    if (!result.ok) return { ok: false, refusalKey: result.refusalKey };

    revalidatePath(`/${scoped.scope.tenantSlug}`, "layout");
    return { ok: true, already: result.already, units: result.units };
  } catch (err) {
    logServerError("scheduling.acceptWaitlistPlace", err);
    return { ok: false, refusalKey: "unavailable" };
  }
}

export type ReleaseWaitlistPlaceResult =
  | { ok: true; already: boolean }
  | { ok: false; refusalKey: ReleaseWaitlistRefusalKey };

/**
 * Give a place back to the queue.
 *
 * Two different writes behind one action, chosen by what the entry is holding
 * and NOT by what the screen thinks it is holding: an offer that was never an
 * allocation is simply withdrawn, while an accepted place has a committed seat
 * that has to be released or the class stays sold out with nobody in it. The
 * RPCs refuse each other's cases (`already_accepted`, `not_accepted`) rather
 * than guessing, so a stale screen cannot silently release the wrong thing.
 */
export async function releaseWaitlistPlace(input: {
  tenantId: string;
  entryId: string;
  /** What the operator's row said this entry was holding. */
  holding: "offer" | "seat";
  expectedStatus: WaitlistStoredStatus;
}): Promise<ReleaseWaitlistPlaceResult> {
  try {
    const scoped = await scopedTo(input.tenantId);
    if (!scoped.ok) return { ok: false, refusalKey: "notFound" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, refusalKey: "unavailable" };

    const result =
      input.holding === "seat"
        ? await cancelWaitlistSeat(admin, {
            tenantId: input.tenantId,
            entryId: input.entryId,
            actorUserId: scoped.scope.userId,
          })
        : await declineWaitlistOffer(admin, {
            tenantId: input.tenantId,
            entryId: input.entryId,
            actorUserId: scoped.scope.userId,
            expectedStatus: input.expectedStatus,
          });
    if (!result.ok) return { ok: false, refusalKey: result.refusalKey };

    revalidatePath(`/${scoped.scope.tenantSlug}`, "layout");
    return { ok: true, already: result.already };
  } catch (err) {
    logServerError("scheduling.releaseWaitlistPlace", err);
    return { ok: false, refusalKey: "unavailable" };
  }
}

/** Put somebody on the queue for a full session. Refusals: see `joinWaitlist`. */
export async function joinSessionWaitlist(input: {
  tenantId: string;
  sessionId: string;
  customerName: string;
  customerEmail: string | null;
}): Promise<JoinWaitlistResult> {
  try {
    const scoped = await scopedTo(input.tenantId);
    if (!scoped.ok) return { ok: false, refusalKey: "notFound", seatsRemaining: null };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, refusalKey: "unavailable", seatsRemaining: null };
    return await joinWaitlist(admin, input);
  } catch (err) {
    logServerError("scheduling.joinSessionWaitlist", err);
    return { ok: false, refusalKey: "unavailable", seatsRemaining: null };
  }
}

/* ── proposed booking hours ────────────────────────────────────────────────── */

export type BookingHoursProposalRow = {
  talentProfileId: string;
  personName: string;
  /** Nullable on purpose: an unresolved zone stays visibly absent. */
  timezone: string | null;
  source: string;
  proposedAt: string | null;
};

export type BookingHoursProposalsResult =
  | { ok: true; proposals: BookingHoursProposalRow[]; defaultTimezone: string }
  | { ok: false; error: string };

/**
 * Who is publicly bookable on paper and has no agreed calendar yet.
 *
 * WHY THIS BANNER EXISTS AND WHAT IT MUST NOT DO. Publishing an offering used
 * to write Mon-Fri 09:00-17:00 UTC straight into `talent_booking_hours`, so
 * strangers were offered hours nobody had agreed to. T1-07 replaced that with a
 * PROPOSAL, which is the honest shape, and left one gap: nothing on the
 * Appointments surface says a proposal is sitting there. Until it is accepted
 * the public booking page correctly answers "no booking hours", and this banner
 * must SAY that rather than paper over it.
 *
 * A proposal whose person already has hours is not listed: `loadBookingHours`
 * suppresses it for the same reason, and offering to accept a stale proposal
 * over a real calendar is the `hours_exist` refusal waiting to happen.
 */
export async function loadBookingHoursProposals(
  tenantId: string,
): Promise<BookingHoursProposalsResult> {
  try {
    const scoped = await scopedTo(tenantId);
    if (!scoped.ok) return { ok: false, error: scoped.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    const { timezone: defaultTimezone } = await resolveTenantTimezone(tenantId);

    const { data, error } = await admin
      .from("talent_booking_hours_proposals")
      .select("talent_profile_id, timezone, source, proposed_at")
      .eq("tenant_id", tenantId)
      .eq("status", "proposed")
      .order("proposed_at", { ascending: true })
      .limit(50);
    if (error) {
      logServerError("scheduling.loadBookingHoursProposals", error);
      return { ok: false, error: "Could not load the proposed hours." };
    }
    const rows = (data ?? []) as Array<{
      talent_profile_id: string;
      timezone: string | null;
      source: string;
      proposed_at: string | null;
    }>;
    if (rows.length === 0) return { ok: true, proposals: [], defaultTimezone };

    const ids = rows.map((r) => r.talent_profile_id);
    const [{ data: hoursData, error: hoursErr }, { data: profileData, error: profileErr }] =
      await Promise.all([
        admin.from("talent_booking_hours").select("talent_profile_id").in("talent_profile_id", ids),
        admin.from("talent_profiles").select("id, display_name, first_name").in("id", ids),
      ]);
    if (hoursErr) {
      logServerError("scheduling.loadBookingHoursProposals/hours", hoursErr);
      return { ok: false, error: "Could not load the proposed hours." };
    }
    if (profileErr) {
      logServerError("scheduling.loadBookingHoursProposals/profiles", profileErr);
      return { ok: false, error: "Could not load the proposed hours." };
    }
    const settled = new Set(
      ((hoursData ?? []) as Array<{ talent_profile_id: string }>).map((h) => h.talent_profile_id),
    );
    const names = new Map(
      ((profileData ?? []) as Array<{
        id: string;
        display_name: string | null;
        first_name: string | null;
      }>).map((p) => [p.id, p.display_name?.trim() || p.first_name?.trim() || ""]),
    );

    const proposals = rows
      .filter((r) => !settled.has(r.talent_profile_id))
      .map((r) => ({
        talentProfileId: r.talent_profile_id,
        personName: names.get(r.talent_profile_id) || "Untitled",
        timezone: r.timezone?.trim() || null,
        source: r.source,
        proposedAt: r.proposed_at,
      }));

    return { ok: true, proposals, defaultTimezone };
  } catch (err) {
    logServerError("scheduling.loadBookingHoursProposals", err);
    return { ok: false, error: "Could not load the proposed hours." };
  }
}
