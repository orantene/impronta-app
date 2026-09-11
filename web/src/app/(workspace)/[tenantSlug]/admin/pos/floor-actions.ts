"use server";

/**
 * The Tables mode's own two writes: the staff reservation (R01).
 *
 * Everything else the floor board calls is the workspace Spaces page's
 * actions (`../tables/actions`) and the host stand's walk-in
 * (`../reservations/actions`): one engine, called from two doors. The
 * reservation is the one thing the till had no door for, and it is the
 * website's booking block's OWN readers and writer (`_reserve/reserve-actions`,
 * `lib/reservations/reserve.ts`) behind a staff guard, with the staff member
 * recorded as the actor. Same rules as the website: the times offered are
 * the block's, the refusals are the block's, the deposit is the rules'.
 *
 * EVERY REFUSAL LEAVES AS A CODE, never a sentence; the board says it in the
 * reader's language.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { loadReserveAvailability } from "@/app/(public)/_reserve/reserve-actions";
import { userHasCapability } from "@/lib/access";
import { depositCentsForParty } from "@/lib/reservations";
import { createReservation, findOfferedTime } from "@/lib/reservations/reserve";
import { loadVenueServiceConfig } from "@/lib/reservations/store";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { loadDefaultVenue, resolveTenantTimezone } from "@/lib/spaces/venues";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import type { FloorReserveResult, FloorReserveTimes } from "@/components/admin/floor/floor-types";

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id };
}

const timesInput = z.object({
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  partySize: z.number().int().min(1).max(200),
});

/** R01's availability column: the block's own times for this party on this date. */
export async function floorLoadReserveTimes(input: { onDate: string | null; partySize: number }): Promise<FloorReserveTimes> {
  const g = await staff();
  if (!g.ok) return { ok: false, reason: g.reason, dates: [] };
  const parsed = timesInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", dates: [] };

  const [availability, venue] = await Promise.all([
    loadReserveAvailability({
      tenantId: g.tenantId,
      partySize: parsed.data.partySize,
      ...(parsed.data.onDate ? { onDate: parsed.data.onDate } : {}),
    }),
    loadDefaultVenue(g.tenantId),
  ]);
  if (!availability.ok) return { ok: false, reason: availability.reason, dates: availability.dates };

  // The deposit the rules ask of THIS party, so the confirm button can say
  // what it will collect before the booking exists. Read best-effort: a rule
  // that cannot be read shows no deposit and the pipeline still charges it.
  let depositCents = 0;
  if (venue) {
    const config = await loadVenueServiceConfig(g.tenantId, venue.id, {});
    if (config) depositCents = depositCentsForParty(config.rules, parsed.data.partySize);
  }

  return {
    ok: true,
    onDate: availability.onDate,
    dates: availability.dates,
    slots: availability.windows.flatMap((w) =>
      w.slots.map((s) => ({ startsAtIso: s.startsAtIso, label: s.label, isLastSeating: s.isLastSeating, isUpsize: s.isUpsize })),
    ),
    depositCents,
    currency: "USD",
  };
}

const createInput = z.object({
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAtIso: z.string().min(20).max(40),
  partySize: z.number().int().min(1).max(200),
  name: z.string().trim().max(120),
  email: z.string().trim().max(200),
  phone: z.string().trim().max(40),
});

/** R01's confirm: the block's own writer, with the staff member as the actor. */
export async function floorCreateReservation(input: {
  onDate: string;
  startsAtIso: string;
  partySize: number;
  name: string;
  email: string;
  phone: string;
}): Promise<FloorReserveResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const d = parsed.data;
  if (!d.email && !d.phone) return { ok: false, reason: "no_contact" };
  if (d.email && !z.string().email().safeParse(d.email).success) return { ok: false, reason: "invalid" };

  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    const venue = await loadDefaultVenue(g.tenantId);
    if (!venue) return { ok: false, reason: "reservations_off" };
    const config = await loadVenueServiceConfig(g.tenantId, venue.id, { fromDate: d.onDate, toDate: d.onDate });
    if (!config) return { ok: false, reason: "unavailable" };
    const tz = await resolveTenantTimezone(g.tenantId, venue.id);
    const timeZone = tz?.timezone ?? venue.timezone;

    // The instant is RE-DERIVED from what the venue offers, never trusted
    // from the screen; the band comes with it. Staff may upsize: a host
    // seating a two at a four-top is the host's call, not the website's.
    const offered = findOfferedTime({
      startsAtIso: d.startsAtIso,
      partySize: d.partySize,
      rules: config.rules,
      windows: config.windows,
      exceptions: config.exceptions,
      bands: config.bands,
      onDate: d.onDate,
      timeZone,
      now: new Date(),
      allowUpsize: true,
    });
    if (!offered) return { ok: false, reason: "time_not_offered" };

    const outcome = await createReservation(admin, {
      tenantId: g.tenantId,
      venueId: venue.id,
      rules: config.rules,
      offered,
      partySize: d.partySize,
      clientOrderKey: randomUUID(),
      actorUserId: g.userId,
      contact: { email: d.email || null, phone: d.phone || null, displayName: d.name || null },
      sourcePage: "pos:floor",
    });
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    return { ok: true, orderId: outcome.orderId, admissionId: outcome.admissionId, collectCents: outcome.collectCents };
  } catch (err) {
    logServerError("pos.floor.createReservation", err);
    return { ok: false, reason: "engine_error" };
  }
}
