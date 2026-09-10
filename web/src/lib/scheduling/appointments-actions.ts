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
 * What this file adds is the part those pieces could not have: the joins that
 * turn ids into names, so a refusal can say "Ana is already booked at that
 * time" instead of "that time is already booked", and the buckets, so the
 * client never has to look at a clock to decide where a row goes.
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
import { rescheduleBooking } from "@/lib/scheduling/reschedule-booking";
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
  nameForPool,
  nameForTalent,
  placeNamesByOrder,
  servingNamesByInquiry,
} from "@/lib/scheduling/appointments-lookups";
import {
  nextInLine,
  orderWaitlist,
  promoteWaitlistEntry,
  type PromoteWaitlistRefusalKey,
  type WaitlistEntry,
  type WaitlistStoredStatus,
} from "@/lib/scheduling/session-waitlist";

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
 * `expectedStartsAt` / `expectedEndsAt` are the window the OPERATOR WAS
 * LOOKING AT, and passing them is the whole point of this wrapper: without
 * them the RPC keeps its last-write-wins behaviour and a stale screen silently
 * overwrites somebody else's move. With them, a stale screen is refused with
 * `conflict` and the operator is told the booking changed since they opened it.
 *
 * On `slot_taken` and on a full room the RPC hands back `failed_talent_id` and
 * `failed_pool_id`. `rescheduleBookingAction` in `_pipeline-actions.ts` drops
 * both, because its flat `{ ok, error }` shape has nowhere to put them. This
 * one resolves each to a NAME, which is the difference between a refusal an
 * operator can act on and one they can only read.
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

    const moved = await rescheduleBooking(admin, {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      newStartsAt: input.newStartsAt,
      newEndsAt: input.newEndsAt,
      actorUserId: scoped.scope.userId,
      expectedStartsAt: input.expectedStartsAt,
      expectedEndsAt: input.expectedEndsAt,
    });

    if (!moved.ok) {
      const [personName, spaceName] = await Promise.all([
        nameForTalent(admin, moved.failedTalentId),
        nameForPool(admin, input.tenantId, moved.failedPoolId),
      ]);
      return {
        ok: false,
        refusal: describeRescheduleRefusal({ reason: moved.reason, personName, spaceName }),
      };
    }

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

export type WaitlistView = {
  sessionId: string;
  sessionTitle: string;
  startsAt: string;
  endsAt: string;
  /** null when the session has no pool: nothing counted it, so nothing is said. */
  seatsTotal: number | null;
  seatsRemaining: number | null;
  entries: WaitlistEntry[];
  /** The id `nextWaitlistInvite` says should be offered the next free place. */
  nextInLineId: string | null;
};

export type WaitlistResult =
  | { ok: true; sessions: WaitlistView[] }
  | { ok: false; error: string };

/**
 * Every session in the horizon that somebody is waiting for.
 *
 * Sessions with an empty queue are omitted: a waitlist tab that lists every
 * class in the calendar with "nobody waiting" beside it buries the two that
 * need a phone call.
 */
export async function loadSessionWaitlists(tenantId: string): Promise<WaitlistResult> {
  try {
    const scoped = await scopedTo(tenantId);
    if (!scoped.ok) return { ok: false, error: scoped.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    const now = new Date();
    const { data: entryData, error: entryErr } = await admin
      .from("session_waitlist_entries")
      .select(
        "id, session_id, customer_name, customer_email, party_size, status, joined_at, offered_at, offer_expires_at",
      )
      .eq("tenant_id", tenantId)
      .order("joined_at", { ascending: true })
      .limit(500);
    if (entryErr) {
      logServerError("scheduling.loadSessionWaitlists/entries", entryErr);
      return { ok: false, error: "Could not load the waitlist." };
    }
    const entries = (entryData ?? []) as Array<{
      id: string;
      session_id: string;
      customer_name: string;
      customer_email: string | null;
      party_size: number | null;
      status: string;
      joined_at: string;
      offered_at: string | null;
      offer_expires_at: string | null;
    }>;
    if (entries.length === 0) return { ok: true, sessions: [] };

    const sessionIds = [...new Set(entries.map((e) => e.session_id))];
    const { data: sessionData, error: sessionErr } = await admin
      .from("sessions")
      .select("id, title, starts_at, ends_at, status")
      .eq("tenant_id", tenantId)
      .in("id", sessionIds);
    if (sessionErr) {
      logServerError("scheduling.loadSessionWaitlists/sessions", sessionErr);
      return { ok: false, error: "Could not load the waitlist." };
    }
    const sessions = (sessionData ?? []) as Array<{
      id: string;
      title: string | null;
      starts_at: string;
      ends_at: string;
      status: string;
    }>;

    const { data: poolData, error: poolErr } = await admin
      .from("capacity_pools")
      .select("id, subject_id, units_total")
      .eq("tenant_id", tenantId)
      .eq("subject_kind", "session_tier")
      .in("subject_id", sessionIds);
    if (poolErr) {
      logServerError("scheduling.loadSessionWaitlists/pools", poolErr);
      return { ok: false, error: "Could not load the waitlist." };
    }
    const pools = new Map(
      ((poolData ?? []) as Array<{ id: string; subject_id: string; units_total: number }>).map(
        (p) => [p.subject_id, p],
      ),
    );

    const views: WaitlistView[] = [];
    for (const session of sessions) {
      const mine = entries.filter((e) => e.session_id === session.id);
      if (mine.length === 0) continue;
      const ordered = orderWaitlist(mine, now);
      const pool = pools.get(session.id) ?? null;

      // Seats come from the engine, never from a count here.
      let remaining: number | null = null;
      if (pool) {
        const { data: rem, error: remErr } = await admin.rpc("capacity_remaining_public", {
          p_pool_id: pool.id,
          p_starts_at: session.starts_at,
          p_ends_at: session.ends_at,
        });
        if (remErr) logServerError("scheduling.loadSessionWaitlists/remaining", remErr);
        else if (typeof rem === "number") remaining = rem;
      }

      views.push({
        sessionId: session.id,
        sessionTitle: session.title?.trim() || "Untitled session",
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        seatsTotal: pool ? pool.units_total : null,
        seatsRemaining: remaining,
        entries: ordered,
        nextInLineId: nextInLine(ordered, now)?.id ?? null,
      });
    }

    views.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return { ok: true, sessions: views };
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

export type JoinWaitlistResult =
  | { ok: true; entryId: string }
  | { ok: false; refusalKey: "nameRequired" | "alreadyWaiting" | "seatsAvailable" | "notFound" | "unavailable"; seatsRemaining: number | null };

/**
 * Put somebody on the queue for a full session (K02, the refusal branch of a
 * class enrollment).
 *
 * TWO REFUSALS THAT ARE REALLY THE SAME KINDNESS. A blank name is refused
 * because a place cannot later be offered to somebody nobody can call; and a
 * session with seats still on it is refused because the operator should sell
 * one of them rather than start a queue for a class that is not full. Both say
 * what to do instead.
 */
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

    const name = input.customerName.trim();
    if (!name) return { ok: false, refusalKey: "nameRequired", seatsRemaining: null };

    const { data: sessionRow, error: sessionErr } = await admin
      .from("sessions")
      .select("id, starts_at, ends_at, status")
      .eq("id", input.sessionId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (sessionErr) {
      logServerError("scheduling.joinSessionWaitlist/session", sessionErr);
      return { ok: false, refusalKey: "unavailable", seatsRemaining: null };
    }
    const session = sessionRow as {
      id: string;
      starts_at: string;
      ends_at: string;
      status: string;
    } | null;
    if (!session) return { ok: false, refusalKey: "notFound", seatsRemaining: null };

    const { data: poolRow, error: poolErr } = await admin
      .from("capacity_pools")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("subject_kind", "session_tier")
      .eq("subject_id", session.id)
      .maybeSingle();
    if (poolErr) {
      logServerError("scheduling.joinSessionWaitlist/pool", poolErr);
      return { ok: false, refusalKey: "unavailable", seatsRemaining: null };
    }
    const pool = poolRow as { id: string } | null;
    if (pool) {
      const { data: rem, error: remErr } = await admin.rpc("capacity_remaining_public", {
        p_pool_id: pool.id,
        p_starts_at: session.starts_at,
        p_ends_at: session.ends_at,
      });
      if (remErr) logServerError("scheduling.joinSessionWaitlist/remaining", remErr);
      else if (typeof rem === "number" && rem > 0) {
        return { ok: false, refusalKey: "seatsAvailable", seatsRemaining: rem };
      }
    }

    const email = input.customerEmail?.trim() || null;
    const { data: inserted, error: insertErr } = await admin
      .from("session_waitlist_entries")
      .insert({
        tenant_id: input.tenantId,
        session_id: session.id,
        customer_name: name,
        customer_email: email,
      })
      .select("id")
      .maybeSingle();
    if (insertErr) {
      // 23505 is the partial unique index on (session, email) for live entries.
      // It is deliberately NOT an ON CONFLICT target — a partial index cannot
      // serve as an inference specification — so it is read here instead.
      if ((insertErr as { code?: string }).code === "23505") {
        return { ok: false, refusalKey: "alreadyWaiting", seatsRemaining: null };
      }
      logServerError("scheduling.joinSessionWaitlist/insert", insertErr);
      return { ok: false, refusalKey: "unavailable", seatsRemaining: null };
    }

    return { ok: true, entryId: (inserted as { id: string } | null)?.id ?? "" };
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
