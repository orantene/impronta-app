"use server";

/**
 * The host stand's two writes: TAKE A PARTY, and SEAT THIS PARTY.
 *
 * WHY THE DESK NEEDED ITS OWN DOOR. The book could show a party arriving and
 * a party running late, and there was nothing on the screen that could do
 * anything about either. The only way to seat a reservation was to walk to
 * the floor, recognise which table it was held for, and tap that card — and
 * even then the booking's own row was untouched. A host stand that cannot
 * seat is a printout.
 *
 * IT IS THE SAME TWO WRITES THE FLOOR MAKES, IN THE SAME ORDER, THROUGH THE
 * SAME FUNCTIONS: `openVisit` puts the party on the table (and refuses when
 * they do not fit), then `markReservationSeated` calls `check_in`. A second
 * implementation of either would be free to disagree with the floor about
 * whether the room is full.
 *
 * EVERY REFUSAL LEAVES AS A CODE, never a sentence: the desk renders in the
 * workspace's language.
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { openVisit } from "@/lib/visits/commands";
import { markReservationSeated } from "@/lib/visits/seat-reservation";
import { loadDefaultVenue } from "@/lib/spaces/venues";
import { loadVenueServiceConfig, seatWalkIn } from "@/lib/reservations/store";
import { planWalkIn } from "@/lib/reservations";

const seatInput = z.object({
  admissionId: z.string().uuid(),
  spaceId: z.string().uuid(),
  partySize: z.number().int().min(1).max(200),
});

export type DeskSeatResult =
  | {
      ok: true;
      /**
       * The party is at the table and the booking could NOT be closed out.
       * Surfaced rather than swallowed: left unsaid, the desk keeps counting
       * them late and the grace job can stamp a no-show while they eat.
       */
      reservationWarning?: string;
    }
  | { ok: false; reason: string };

export async function reservationsSeatBooking(input: {
  admissionId: string;
  spaceId: string;
  partySize: number;
}): Promise<DeskSeatResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, reason: "not_allowed" };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
  if (!allowed) return { ok: false, reason: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const parsed = seatInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const opened = await openVisit(admin, {
    tenantId: guard.tenantId,
    spaceId: parsed.data.spaceId,
    actorUserId: guard.user.id,
    partySize: parsed.data.partySize,
    serviceKind: "table",
  });
  if (!opened.ok) return { ok: false, reason: opened.reason };

  const seated = await markReservationSeated(admin, {
    tenantId: guard.tenantId,
    admissionId: parsed.data.admissionId,
    spaceIds: [parsed.data.spaceId],
    actorUserId: guard.user.id,
  });
  return seated.ok ? { ok: true } : { ok: true, reservationWarning: seated.reason };
}

/**
 * TAKE A WALK-IN: put a party that did not book onto tonight's book.
 *
 * THIS WIRES AN ENGINE THAT HAD NO DOOR. `planWalkIn` (which band, for how
 * long) and `seatWalkIn` (hold a unit, commit it, write the admission) were
 * both written, both tested and called from nowhere in the app, so a host
 * stand could show a book it could not add a line to. Nothing new is decided
 * here: this resolves the venue, asks those two functions, and reports.
 *
 * A WALK-IN HOLDS CAPACITY AND OWES NOTHING. No order, no money, no
 * commission — see `walkin.ts` for why that pairing is the point. The party
 * lands on the book unassigned (`space_id` null is a real state) and reads as
 * arriving immediately, so the Seat control above can put them on a table.
 */
const walkInInput = z.object({
  holderName: z.string().trim().min(1).max(120),
  partySize: z.number().int().min(1).max(200),
});

export type DeskWalkInResult = { ok: true; admissionId: string } | { ok: false; reason: string };

export async function reservationsTakeWalkIn(input: {
  holderName: string;
  partySize: number;
}): Promise<DeskWalkInResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, reason: "not_allowed" };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
  if (!allowed) return { ok: false, reason: "not_allowed" };

  const parsed = walkInInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const venue = await loadDefaultVenue(guard.tenantId);
  if (!venue) return { ok: false, reason: "reservations_off" };
  // A FAILED READ IS NOT A CLOSED VENUE. `null` here means we could not look,
  // and turning a party away because a query failed is the mistake this whole
  // area keeps naming.
  const config = await loadVenueServiceConfig(guard.tenantId, venue.id, {});
  if (!config) return { ok: false, reason: "unavailable" };

  const plan = planWalkIn({
    rules: config.rules,
    bands: config.bands,
    partySize: parsed.data.partySize,
    now: new Date(),
  });
  if (!plan.ok) return { ok: false, reason: plan.reason };

  const seated = await seatWalkIn(guard.tenantId, {
    poolId: plan.plan.band.poolId,
    startsAt: plan.plan.startsAt,
    endsAt: plan.plan.endsAt,
    partySize: parsed.data.partySize,
    holderName: parsed.data.holderName,
    actorUserId: guard.user.id,
  });
  return seated.ok ? { ok: true, admissionId: seated.admissionId } : { ok: false, reason: seated.reason };
}
