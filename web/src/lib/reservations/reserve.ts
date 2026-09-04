/**
 * reserve.ts — turning an offered time into a held table.
 *
 * A RESERVATION IS AN ORDER PLUS AN ADMISSION. The order is the commercial
 * record and carries the capacity hold; the admission is the visit and carries
 * the covers. Neither is a "reservation" row, because that word already means
 * subdomain TTLs and a commission fee in this codebase.
 *
 * ONE UNIT, WHATEVER THE PARTY. A party of four in a four-top takes ONE unit of
 * that band's pool. Party size chose the band; it is not a quantity of stock.
 * Covers land on `admissions.party_size`, which is a different number from
 * capacity consumed and does not derive from it.
 *
 * THE OFFERED TIME IS RE-DERIVED, NEVER TRUSTED. The client sends an instant it
 * was shown; this module recomputes what is actually offered for that party on
 * that date and refuses anything not in the list. A guest can edit anything
 * that reaches a server action, and "the page offered it" is not evidence.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPurchase } from "@/lib/orders/purchase";
import { logServerError } from "@/lib/server/safe-error";
import { availabilityForWindow, resolveWindowOnDate } from "./index";
import type { OfferedTime, PartyBand } from "./availability";
import type { ServiceRules, ServiceWindow, ServiceWindowException } from "./types";

export type ReserveRefusal =
  | "reservations_off"
  | "no_offering_configured"
  | "time_not_offered"
  | "sold_out"
  | "capacity_unavailable"
  | "no_contact"
  | "engine_error";

export type ReserveOutcome =
  | {
      ok: true;
      orderId: string;
      customerId: string;
      admissionId: string;
      allocationIds: string[];
      /** What the venue is collecting now, in integer cents. 0 for a free table. */
      collectCents: number;
      transactionId: string | null;
    }
  | { ok: false; reason: ReserveRefusal; error?: string };

/**
 * Find the requested instant among the times actually offered.
 *
 * Returns the offered time AND its band, because the band is what gets the
 * capacity hold and a client-sent pool id would be the whole exploit.
 */
export function findOfferedTime(input: {
  startsAtIso: string;
  partySize: number;
  rules: ServiceRules;
  windows: readonly ServiceWindow[];
  exceptions: readonly ServiceWindowException[];
  bands: readonly PartyBand[];
  onDate: string;
  timeZone: string;
  now: Date;
  allowUpsize: boolean;
}): OfferedTime | null {
  const wanted = new Date(input.startsAtIso).getTime();
  if (!Number.isFinite(wanted)) return null;

  for (const window of input.windows) {
    const resolved = resolveWindowOnDate({
      window,
      exceptions: input.exceptions,
      onDate: input.onDate,
      timeZone: input.timeZone,
      defaultTurnMinutes: input.rules.defaultTurnMinutes,
    });
    if (!resolved.ok) continue;

    const result = availabilityForWindow({
      resolved: resolved.window,
      timeZone: input.timeZone,
      rules: input.rules,
      bands: input.bands,
      partySize: input.partySize,
      now: input.now,
      allowUpsize: input.allowUpsize,
      // Availability of the SPECIFIC instant is settled by the capacity engine
      // inside reserve_capacity, under a row lock. Here we only need to know
      // the time is one this venue offers at all, so every band reads as open.
      remaining: () => Number.MAX_SAFE_INTEGER,
    });
    if (!result.ok) continue;

    const match = result.times.find((t) => t.startsAt.getTime() === wanted);
    if (match) return match;
  }
  return null;
}

/**
 * Hold the table and record the visit.
 *
 * The capacity hold is taken by `createPurchase`, under the pool's own row
 * lock, so two guests racing the last four-top cannot both win. The admission
 * is written after the order exists, because an admission with no order line is
 * a walk-in and this is not one.
 */
export async function createReservation(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    venueId: string;
    rules: ServiceRules;
    offered: OfferedTime;
    partySize: number;
    clientOrderKey: string;
    actorUserId: string | null;
    contact: { email?: string | null; phone?: string | null; displayName?: string | null };
    note?: string | null;
    sourcePage?: string | null;
    locale?: string | null;
  },
): Promise<ReserveOutcome> {
  const { rules, offered, partySize } = input;

  if (!rules.isActive) return { ok: false, reason: "reservations_off" };
  const offeringId = rules.reservationOfferingId;
  // A venue with rules and windows but no offering is CONFIGURABLE and not yet
  // bookable. Saying which of those it is beats a generic failure.
  if (!offeringId) return { ok: false, reason: "no_offering_configured" };
  if (!input.contact.email && !input.contact.phone) {
    return { ok: false, reason: "no_contact" };
  }

  const purchase = await createPurchase(admin, {
    tenantId: input.tenantId,
    clientOrderKey: input.clientOrderKey,
    actorUserId: input.actorUserId,
    contact: input.contact,
    // ONE unit. Not `partySize`.
    lines: [{ offeringId, units: 1 }],
    // INTENT, not policy: the pipeline re-derives what this offering permits
    // and refuses this choice if the offering forbids it. A table with no
    // deposit is not paid online, which is what "in person" means here.
    paymentChoice: rules.depositFromParty !== null && partySize >= rules.depositFromParty
      ? "deposit"
      : "in_person",
    sourceChannel: "reservation",
    sourcePage: input.sourcePage ?? null,
    locale: input.locale ?? null,
    capacity: [
      {
        offeringId,
        poolId: offered.band.poolId,
        startsAt: offered.startsAt.toISOString(),
        endsAt: offered.endsAt.toISOString(),
        units: 1,
      },
    ],
  });

  if (!purchase.ok) {
    // The pipeline distinguishes "sold out" from "could not reach capacity".
    // Collapsing them would tell a guest the restaurant is full during an
    // outage, which is the same mistake as reading an unknown as a free table.
    const reason: ReserveRefusal =
      purchase.reason === "sold_out"
        ? "sold_out"
        : purchase.reason === "capacity_unavailable"
          ? "capacity_unavailable"
          : "engine_error";
    return { ok: false, reason, error: purchase.reason };
  }

  try {
    const { data: line } = await admin
      .from("order_lines")
      .select("id")
      .eq("order_id", purchase.orderId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: admission, error } = await admin
      .from("admissions")
      .insert({
        tenant_id: input.tenantId,
        allocation_id: purchase.allocationIds[0] ?? null,
        order_line_id: line?.id ?? null,
        space_id: null, // unassigned is a valid state; the host seats them
        customer_id: purchase.customerId,
        holder_name: input.contact.displayName ?? null,
        holder_email: input.contact.email ?? null,
        starts_at: offered.startsAt.toISOString(),
        party_size: partySize,
      })
      .select("id")
      .single();

    if (error || !admission) {
      // The order and its hold STAND. A reservation with an order and no
      // admission is visible and repairable; releasing a held table because a
      // bookkeeping row failed would give the table away to someone else and
      // leave the guest holding a receipt.
      logServerError("reservations.createReservation/admission", error);
      return { ok: false, reason: "engine_error", error: "admission_not_written" };
    }

    return {
      ok: true,
      orderId: purchase.orderId,
      customerId: purchase.customerId,
      admissionId: admission.id as string,
      allocationIds: purchase.allocationIds,
      collectCents: purchase.collectCents,
      transactionId: purchase.transactionId,
    };
  } catch (err) {
    logServerError("reservations.createReservation", err);
    return { ok: false, reason: "engine_error" };
  }
}
