/**
 * QA harness compatibility shim: the retired instant-book call shape, on the
 * purchase pipeline.
 *
 * Seven `qa-*.mts` harnesses were written against the engine that 0.6b-2
 * deletes. Hand-rewriting seven harnesses in the same push that removes the
 * engine is two risky changes at once, and deleting them would silently drop
 * real QA coverage (cash cycles, deposits, free-reserve expiry, variants,
 * refund stock, product fulfilment). So the old shape is mapped onto
 * `createPurchase` in ONE place.
 *
 * This lives in `scripts/` on purpose: it exists to keep harnesses running,
 * and no product code may reach for it. The static guard in
 * `src/lib/orders/menu-action-loads.test.ts` covers `src/` only, which is why
 * this file must never be imported from there.
 */
import { createPurchase } from "../src/lib/orders/purchase";

export type QaInstantBookInput = {
  tenantId: string;
  talentProfileId?: string;
  clientUserId?: string | null;
  actorUserId?: string | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string | null;
  sourcePage?: string | null;
  /** Accepted and IGNORED. The pipeline is USD-only per the currency rule. */
  currencyCode?: string;
  offeringId?: string | null;
  payInPerson?: boolean;
  variantId?: string | null;
  addOnIds?: string[];
  quantity?: number;
  reservation?: { startsAt: string; endsAt: string } | null;
};

export type QaInstantBookResult =
  | { ok: true; orderId: string; inquiryId: string | null; bookingId: string | null; transactionId: string | null }
  | { ok: false; reason: string; error?: string };

export async function createInstantBooking(
  admin: unknown,
  input: QaInstantBookInput,
): Promise<QaInstantBookResult> {
  const r = await createPurchase(admin as never, {
    tenantId: input.tenantId,
    // Time-seeded so repeated harness runs are distinct orders rather than
    // idempotent replays of the first one — the opposite of what a real caller
    // wants, and exactly what a QA loop needs.
    clientOrderKey: `qa:${input.tenantId}:${input.offeringId ?? ""}:${Date.now()}:${Math.random()}`,
    actorUserId: input.actorUserId ?? input.clientUserId ?? null,
    contact: {
      email: input.contactEmail ?? "qa@impronta.test",
      phone: input.contactPhone ?? null,
      displayName: input.contactName ?? "QA",
    },
    lines: [
      {
        offeringId: input.offeringId ?? "",
        units: input.quantity ?? 1,
        variantId: input.variantId ?? null,
        addonIds: input.addOnIds ?? [],
      },
    ],
    // INTENT only. The pipeline re-derives policy from the offering row, so a
    // harness asking for in-person on an offering that forbids it now gets a
    // refusal where the engine would have happily stamped cash.
    paymentChoice: input.payInPerson === true ? "in_person" : "full",
    sourceChannel: "instant_book",
    sourcePage: input.sourcePage ?? null,
    reservation:
      input.reservation && input.talentProfileId
        ? {
            talentProfileId: input.talentProfileId,
            startsAt: input.reservation.startsAt,
            endsAt: input.reservation.endsAt,
          }
        : null,
    openThread: true,
  });
  if (!r.ok) return { ok: false, reason: r.reason, error: r.error };
  return {
    ok: true,
    orderId: r.orderId,
    inquiryId: r.inquiryId,
    bookingId: r.bookingId,
    transactionId: r.transactionId,
  };
}
