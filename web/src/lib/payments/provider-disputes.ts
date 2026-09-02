/**
 * lib/payments/provider-disputes.ts
 *
 * Persist Stripe disputes, and surface the evidence deadline.
 *
 * WHY THIS EXISTS: dispute HANDLING was already sound — `charge.dispute.created`
 * flags the transaction without reversing (a dispute may be won, and clawing a
 * talent back before it resolves punishes them for something that might be
 * reversed), and `charge.dispute.closed` reverses on lost / restores on won.
 *
 * What was missing was the RECORD. There was no disputes table at all, so
 * nothing tracked `evidence_due_by`. Stripe gives a fixed window to submit
 * evidence, and a dispute is LOST BY DEFAULT if that window passes. Money lost
 * to a calendar rather than to the merits is the worst kind, and nothing in the
 * product knew the date existed.
 *
 * A dispute on a non-booking charge (a SaaS subscription, a client top-up) also
 * produced a log line and nothing else.
 *
 * Like `provider-payouts`, this records what Stripe reports and derives nothing.
 * Server-only.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";

/** Terminal statuses — the dispute is over and no evidence can change it. */
const CLOSED_STATUSES = new Set(["won", "lost", "warning_closed"]);

export function isDisputeClosed(status: string | null | undefined): boolean {
  return CLOSED_STATUSES.has(String(status ?? ""));
}

/**
 * Resolve the booking side of a dispute, if it has one.
 *
 * Returns all-nulls for a dispute we cannot place — a subscription charge, say.
 * That is the honest answer; attaching it to the wrong booking would corrupt
 * every report built on this table.
 */
async function resolveDisputeBooking(
  paymentIntentId: string | null,
): Promise<{
  bookingTransactionId: string | null;
  bookingId: string | null;
  tenantId: string | null;
}> {
  const empty = { bookingTransactionId: null, bookingId: null, tenantId: null };
  if (!paymentIntentId) return empty;
  try {
    const sb = createServiceRoleClient();
    if (!sb) return empty;
    // markPaid stamps the settling PaymentIntent into provider_metadata, which
    // is what makes this lookup possible at all.
    const { data } = await sb
      .from("booking_transactions")
      .select("id, booking_id, source_tenant_id")
      .eq("provider_metadata->>payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (!data) return empty;
    const row = data as { id: string; booking_id: string | null; source_tenant_id: string | null };
    return {
      bookingTransactionId: row.id,
      bookingId: row.booking_id ?? null,
      tenantId: row.source_tenant_id ?? null,
    };
  } catch (err) {
    logServerError("provider-disputes.resolveBooking", err);
    return empty;
  }
}

function refIdOf(ref: unknown): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  const obj = ref as { id?: string };
  return obj.id ?? null;
}

/**
 * Record (or update) one Stripe dispute.
 *
 * Upserted on `stripe_dispute_id` so the lifecycle converges on ONE row. The
 * funds timestamps are set only by their own events and never cleared here — a
 * later `charge.dispute.updated` must not erase the fact that money was
 * withdrawn.
 *
 * Best-effort: a bookkeeping write must never 5xx a webhook whose money-side
 * work already succeeded.
 */
export async function recordProviderDispute(input: {
  dispute: Stripe.Dispute;
  eventId: string;
  eventType: string;
}): Promise<void> {
  try {
    const sb = createServiceRoleClient();
    if (!sb) return;

    const { dispute } = input;
    const paymentIntentId = refIdOf(dispute.payment_intent);
    const booking = await resolveDisputeBooking(paymentIntentId);
    const closed = isDisputeClosed(dispute.status);

    const row: Record<string, unknown> = {
      provider: "stripe",
      stripe_dispute_id: dispute.id,
      stripe_charge_id: refIdOf(dispute.charge),
      stripe_payment_intent_id: paymentIntentId,
      booking_transaction_id: booking.bookingTransactionId,
      booking_id: booking.bookingId,
      tenant_id: booking.tenantId,
      amount_cents: dispute.amount ?? 0,
      currency: (dispute.currency ?? "usd").toUpperCase(),
      status: dispute.status ?? "unknown",
      reason: dispute.reason ?? null,
      evidence_due_by: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null,
      evidence_submitted_at: dispute.evidence_details?.submission_count
        ? new Date().toISOString()
        : null,
      is_charge_refundable: dispute.is_charge_refundable ?? null,
      opened_at: dispute.created ? new Date(dispute.created * 1000).toISOString() : null,
      closed_at: closed ? new Date().toISOString() : null,
      last_event_id: input.eventId,
      last_event_type: input.eventType,
      updated_at: new Date().toISOString(),
    };

    // Only the funds events own these columns. Setting them from any other
    // event would overwrite a real timestamp with null.
    if (input.eventType === "charge.dispute.funds_withdrawn") {
      row.funds_withdrawn_at = new Date().toISOString();
    }
    if (input.eventType === "charge.dispute.funds_reinstated") {
      row.funds_reinstated_at = new Date().toISOString();
    }

    const { error } = await sb
      .from("provider_disputes")
      .upsert(row, { onConflict: "stripe_dispute_id" });
    if (error) logServerError("provider-disputes.upsert", error);
  } catch (err) {
    logServerError("provider-disputes.record", err);
  }
}
