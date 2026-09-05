/**
 * Ticket purchase — the PURE half (E5 step 1). No I/O; every decision the
 * picker action makes that can be wrong is here so it can be pinned.
 *
 * Contracts it encodes (docs/plans/events-e5-guest-checkout-design.md):
 *   - every ticket capacity need declares `perUnitDomainRow: true` (§3.1);
 *   - a line is (offering, variant, session, units) (§3.2);
 *   - pay-at-the-door is a product rule with three honest states (§3.4 B′):
 *     offered only while the session has not started AND ends within the
 *     engine's 7-day hold cap; otherwise the guest is TOLD why, never shown
 *     fewer options silently.
 */

import type { PurchaseInput } from "@/lib/orders/purchase-types";

/** `CHECK (hold_ttl_seconds BETWEEN 30 AND 604800)` — a column constraint, not a preference. */
export const HOLD_TTL_CAP_SECONDS = 604_800;

export type DoorOfferState =
  | { offered: true }
  | { offered: false; reason: "not_allowed" }
  | { offered: false; reason: "doors_open" }
  | { offered: false; reason: "opens_closer_to_date" };

/**
 * Whether "pay at the door" may be offered for a session, and if not, which
 * sentence the guest sees. Order of checks matters: a venue that never
 * allows it gets no sentence about dates.
 */
export function doorOfferState(args: {
  allowPayInPerson: boolean;
  sessionStartsAt: string;
  sessionEndsAt: string;
  now: Date;
}): DoorOfferState {
  if (!args.allowPayInPerson) return { offered: false, reason: "not_allowed" };
  const start = Date.parse(args.sessionStartsAt);
  const end = Date.parse(args.sessionEndsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { offered: false, reason: "not_allowed" };
  const nowMs = args.now.getTime();
  // A purchase during the show is the door's own sale (`sellAtDoor`), which
  // holds nothing; online pay-at-the-door closes when doors open.
  if (nowMs >= start) return { offered: false, reason: "doors_open" };
  // The hold would have to live until the session's END; the engine refuses
  // anything past the cap with CP007, so we never create one that would.
  if (end - nowMs > HOLD_TTL_CAP_SECONDS * 1000) return { offered: false, reason: "opens_closer_to_date" };
  return { offered: true };
}

export type TicketPurchaseArgs = {
  tenantId: string;
  clientOrderKey: string;
  offeringId: string;
  variantId: string;
  sessionId: string;
  poolId: string;
  sessionStartsAt: string;
  sessionEndsAt: string;
  units: number;
  email: string;
  displayName?: string | null;
  promoCode?: string | null;
  locale?: string | null;
  sourcePage?: string | null;
};

/**
 * The one shape `createPurchase` receives for a ticket. `perUnitDomainRow`
 * is TRUE here and nowhere else — the mint gives each admission its own
 * allocation only when the engine held one per unit, and this is the only
 * caller that asks it to.
 */
export function buildTicketPurchase(a: TicketPurchaseArgs): PurchaseInput {
  return {
    tenantId: a.tenantId,
    clientOrderKey: a.clientOrderKey,
    actorUserId: null,
    contact: { email: a.email, displayName: a.displayName ?? null },
    lines: [{ offeringId: a.offeringId, variantId: a.variantId, sessionId: a.sessionId, units: a.units }],
    paymentChoice: "full",
    sourceChannel: "ticket_picker",
    sourcePage: a.sourcePage ?? null,
    capacity: [
      {
        offeringId: a.offeringId,
        poolId: a.poolId,
        startsAt: a.sessionStartsAt,
        endsAt: a.sessionEndsAt,
        units: a.units,
        perUnitDomainRow: true,
      },
    ],
    promoCode: a.promoCode ?? null,
    locale: a.locale ?? null,
  };
}

/**
 * Which paid ticket lines have NO committed seat. Payment can land after the
 * hold lapsed (`commit_capacity` refuses to revive it; the order still flips
 * to paid). These lines mint nothing and become refund intents — never a
 * ticket for a seat that does not exist.
 */
export function seatLostLines(
  lines: ReadonlyArray<{ id: string; sessionId: string | null }>,
  committedAllocationsByLine: ReadonlyMap<string, readonly string[]>,
): string[] {
  return lines
    .filter((l) => l.sessionId !== null)
    .filter((l) => (committedAllocationsByLine.get(l.id)?.length ?? 0) === 0)
    .map((l) => l.id);
}

/** The buyer's message that travels WITH the refund (design decision 10). */
export function seatLostMessage(args: { eventTitle: string | null; amountLabel: string }): string {
  const what = args.eventTitle ? `your ticket for ${args.eventTitle}` : "your ticket";
  return `The seat for ${what} was taken while your payment was completing, so we have refunded ${args.amountLabel} in full. If seats are still available you can buy again; otherwise please contact the venue.`;
}
