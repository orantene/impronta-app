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
 * A `.ts` and not a `.mts`: tsconfig uses `moduleResolution: "bundler"`, which
 * resolves an extensionless `.ts` but not an extensionless `.mts`. That is why
 * every harness already imports `../src/lib/...` extensionless and it works.
 * The `.mts` version cost two gate cycles — first TS5097 for naming the
 * extension, then TS2307 for omitting it.
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
  /**
   * Success MEETS the old engine's contract: all four ids present, none null.
   *
   * The pipeline's own result widens `inquiryId` / `bookingId` / `transactionId`
   * to nullable, and that widening is correct there — a free reserve has no
   * booking and a thread is opened best-effort. But these harnesses were
   * written against the narrow contract and thread the ids straight into
   * functions that require a string, so the shim must either satisfy it or say
   * it could not.
   *
   * It says it could not. Coercing a missing id to `""` would have silenced
   * twenty type errors and is exactly the fail-open shape this phase was
   * overruled on: absence resolved to a benign-looking value, which then
   * travels as if it were an answer.
   */
  | { ok: true; orderId: string; inquiryId: string; bookingId: string; transactionId: string }
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
  // A purchase that succeeded but produced no inquiry / booking / transaction
  // is a real outcome of the pipeline, not an error — but it is NOT the old
  // contract, and a harness that threads a null id onward reports a confusing
  // downstream failure instead of the true one. So it is refused HERE, named.
  //
  // CAVEAT, stated because it is an untested claim: a free reserve may
  // legitimately have no booking, which would make `qa-free-reserve-cron`
  // refuse where the old engine did not. These harnesses need live env and are
  // UNRUN, so I cannot tell which. If that is what happens, the refusal names
  // the missing id and the fix is obvious — which is the point of refusing.
  for (const [field, value] of [
    ["inquiry", r.inquiryId],
    ["booking", r.bookingId],
    ["transaction", r.transactionId],
  ] as const) {
    if (!value) {
      return {
        ok: false,
        reason: `pipeline_produced_no_${field}`,
        error: `createPurchase succeeded but returned no ${field} id; the harness contract needs one.`,
      };
    }
  }
  return {
    ok: true,
    orderId: r.orderId,
    inquiryId: r.inquiryId as string,
    bookingId: r.bookingId as string,
    transactionId: r.transactionId as string,
  };
}
