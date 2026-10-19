/**
 * Talent Money: issue a real Stripe refund for a booking the talent owns.
 *
 * Closes the D-026 gap after cancel-with-pay: Agenda says "refund from Money",
 * Money lists refund-pending rows, and this writer calls `executeBookingRefund`
 * (same engine as Messages / admin). Ledger updates still come from the
 * `charge.refunded` webhook — this only creates the Stripe Refund.
 *
 * TUL-1268 M6: this used to refund EVERY settled charge on the booking's
 * ORDER, in full, for any talent on the booking, whatever state the booking
 * was in. It now goes through the shared refund guard
 * (`lib/payments/refund-authority.ts`):
 *   - only the talent's own booking (`requireOwnBooking`), only once the work
 *     is off (cancelled, expired...), only a direct booking (an agency booking
 *     is the agency's money to refund from its desk),
 *   - only that booking's own charges (`booking_id`), never the order's others,
 *   - only the amount the talent asked for, at most what is left to refund on
 *     those charges, and never "everything" by default,
 *   - and the role limit, like every other refund door.
 */

"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { executeBookingRefund, loadRefundEligibility } from "@/lib/payments/refund-execute";
import {
  authorizeRefund,
  planOwnBookingRefund,
  refundAuthorityMessage,
  talentMayRefundOwnBooking,
  talentRequestedCents,
  type RefundAuthorityCode,
} from "@/lib/payments/refund-authority";
import { enforceRoleLimit } from "@/lib/approvals/enforce";
import { findTenantMembership } from "@/lib/saas/tenant";
import { logServerError } from "@/lib/server/safe-error";
import { logBookingActivity } from "@/lib/server/commercial-audit";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";
import { LEDGER_SETTLED_STATUSES } from "./cancel-money";
import { requireOwnBooking } from "./booking-actions";
import type { AgendaActionResult } from "./booking-actions";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

export type RefundOwnBookingResult =
  | { ok: true; refundedCents: number; currency: string; already?: boolean }
  | (AgendaActionResult & {
      ok: false;
      /** Set when the refund guard refused: the sentence to show, in English and Spanish. */
      message?: { en: string; es: string };
    });

type TxnRow = {
  id: string;
  gross_amount_cents: number | null;
  currency: string | null;
  status: string | null;
  provider: string | null;
};

function refused(code: RefundAuthorityCode): RefundOwnBookingResult {
  return {
    ok: false,
    reason: code,
    message: { en: refundAuthorityMessage(code, "en"), es: refundAuthorityMessage(code, "es") },
  };
}

/**
 * Refund `amountCents` of this booking's settled card charges, oldest charge
 * first. Cash/transfer (no Stripe charge) is refused by the engine; those need
 * a manual off-platform return, not this button.
 */
export async function refundOwnBookingPayment(input: {
  bookingId: string;
  /** Minor units. Required: the talent refunds what they asked, never "everything". */
  amountCents: number;
}): Promise<RefundOwnBookingResult> {
  await requireNotImpersonating();
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: booking, error: bookingErr } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, status, source_type_snapshot")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingErr) {
    logServerError("agenda.refundOwnBooking.load", bookingErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!booking) return { ok: false, reason: "not_found" };
  const bookingRow = booking as {
    id: string;
    tenant_id: string | null;
    status: string | null;
    source_type_snapshot: string | null;
  };

  // Only this booking's own charges, never the order's other bookings.
  const { data: txnRows, error: txnErr } = await admin
    .from("booking_transactions")
    .select("id, gross_amount_cents, currency, status, provider")
    .eq("booking_id", input.bookingId)
    .order("created_at", { ascending: true });
  if (txnErr) {
    logServerError("agenda.refundOwnBooking.txns", txnErr);
    return { ok: false, reason: "unavailable" };
  }
  const settled = ((txnRows ?? []) as TxnRow[]).filter((t) =>
    (LEDGER_SETTLED_STATUSES as readonly string[]).includes(String(t.status ?? "")),
  );

  // Each charge's own remainder, as the engine computes it (settled minus
  // already refunded, minus non-refundable fees). A charge the engine would
  // refuse (cash, already refunded) has nothing refundable here.
  const charges: Array<{ transactionId: string; remainingCents: number; currency: string }> = [];
  for (const txn of settled) {
    const eligibility = await loadRefundEligibility(txn.id);
    if ("error" in eligibility) {
      if (eligibility.code === "unavailable") return refused("unavailable");
      continue;
    }
    charges.push({
      transactionId: txn.id,
      remainingCents: eligibility.blockedReason ? 0 : eligibility.remainingCents,
      currency: eligibility.currency || txn.currency || "USD",
    });
  }
  const refundableCents = charges.reduce((sum, c) => sum + c.remainingCents, 0);

  const tenantId = bookingRow.tenant_id ?? "";
  const authorized = await authorizeRefund({
    capable: talentMayRefundOwnBooking({
      status: bookingRow.status,
      sourceType: bookingRow.source_type_snapshot,
    }),
    // The row sends gross paid; clamp to what is left (a partly refunded
    // charge must refund exactly its remainder, not be refused).
    requestedCents: talentRequestedCents(input.amountCents, refundableCents),
    refundableCents,
    allowFullRemainder: false,
    enforceLimit: async (refundCents) =>
      enforceRoleLimit(admin, {
        tenantId,
        role: tenantId ? ((await findTenantMembership(tenantId))?.role ?? null) : null,
        action: "refund",
        amountCents: refundCents,
        subjectId: input.bookingId,
        requestedBy: own.userId,
        operationKey: `refund:talent:${input.bookingId}:${refundableCents}:${refundCents}`,
        reason: `Refund from talent Money (${refundCents} cents)`,
      }),
  });
  if (!authorized.ok) {
    // Nothing left on a booking the talent may refund: same calm answer the
    // button always gave ("Nothing left to refund on this booking").
    if (authorized.code === "nothing_left") return { ok: true, refundedCents: 0, currency: charges[0]?.currency ?? "USD", already: true };
    return refused(authorized.code);
  }

  const legs = planOwnBookingRefund(authorized.amountCents, charges);

  let moved = 0;
  let currency = charges[0]?.currency ?? "USD";
  let lastError: string | null = null;

  for (const leg of legs) {
    const res = await executeBookingRefund({
      transactionId: leg.transactionId,
      amountCents: leg.amountCents,
      reason: "booking_cancelled",
      actorUserId: own.userId,
      note: "Refund from talent Money (paid after cancellation)",
    });
    if (!res.ok) {
      // Already refunded / nothing left: skip; other blocks surface to the UI.
      if (res.code === "already_refunded" || res.code === "not_collected" || res.code === "amount") {
        continue;
      }
      lastError = res.error;
      break;
    }
    moved += res.amountCents;
    currency = res.currency || currency;
  }

  if (moved === 0 && lastError) {
    return { ok: false, reason: lastError };
  }
  if (moved === 0) {
    return { ok: true, refundedCents: 0, currency, already: true };
  }

  await logBookingActivity(admin, {
    bookingId: input.bookingId,
    actorUserId: own.userId,
    eventType: BOOKING_AUDIT.PAYMENT_STATE_CHANGED,
    payload: {
      surface: "talent_money",
      refundedCents: moved,
      requestedCents: authorized.amountCents,
      currency,
      reason: "booking_cancelled",
    },
  });

  return { ok: true, refundedCents: moved, currency };
}
