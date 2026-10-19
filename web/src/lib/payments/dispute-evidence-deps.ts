import "server-only";

import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  autoSubmitDisputeEvidence,
  type DisputeEvidenceDeps,
  type DisputeEvidenceFacts,
} from "./dispute-evidence";

type Sb = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/**
 * Read the booking facts behind a settled PaymentIntent. Returns null when the
 * charge is not a booking we can place (subscription, top-up) or a read fails:
 * the caller then refuses rather than submitting a guess. Internal notes are
 * never selected; messages are the client-visible text kind on the private
 * thread only.
 */
export async function loadDisputeEvidenceFacts(
  sb: Sb,
  paymentIntentId: string,
): Promise<DisputeEvidenceFacts | null> {
  const { data: txn, error: txnErr } = await sb
    .from("booking_transactions")
    .select("booking_id, gross_amount_cents, currency, paid_at, payer_email, source_inquiry_id")
    .eq("provider_metadata->>payment_intent_id", paymentIntentId)
    .maybeSingle<{
      booking_id: string | null;
      gross_amount_cents: number;
      currency: string;
      paid_at: string | null;
      payer_email: string | null;
      source_inquiry_id: string | null;
    }>();
  if (txnErr) {
    logServerError("dispute-evidence.transaction", txnErr);
    return null;
  }
  if (!txn?.booking_id) return null;

  const { data: booking, error: bookingErr } = await sb
    .from("agency_bookings")
    .select(
      "id, title, starts_at, ends_at, timezone, venue_name, venue_address, contact_name, contact_email, contact_phone, policy_version_id, refund_policy_key, source_inquiry_id",
    )
    .eq("id", txn.booking_id)
    .maybeSingle<{
      id: string;
      title: string | null;
      starts_at: string | null;
      ends_at: string | null;
      timezone: string | null;
      venue_name: string | null;
      venue_address: string | null;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      policy_version_id: string | null;
      refund_policy_key: string | null;
      source_inquiry_id: string | null;
    }>();
  if (bookingErr) {
    logServerError("dispute-evidence.booking", bookingErr);
    return null;
  }
  if (!booking) return null;

  let cancellationPolicy: string | null = null;
  if (booking.policy_version_id) {
    const { data: policy, error: policyErr } = await sb
      .from("talent_policy_versions")
      .select("rendered_text_en, rendered_text_es")
      .eq("id", booking.policy_version_id)
      .maybeSingle<{ rendered_text_en: string | null; rendered_text_es: string | null }>();
    if (policyErr) logServerError("dispute-evidence.policy", policyErr);
    cancellationPolicy = policy?.rendered_text_en ?? policy?.rendered_text_es ?? null;
  }

  const inquiryId = booking.source_inquiry_id ?? txn.source_inquiry_id;
  let messages: DisputeEvidenceFacts["messages"] = [];
  if (inquiryId) {
    const { data: rows, error: msgErr } = await sb
      .from("inquiry_messages")
      .select("created_at, body")
      .eq("inquiry_id", inquiryId)
      .eq("thread_type", "private")
      .eq("message_kind", "text")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    if (msgErr) logServerError("dispute-evidence.messages", msgErr);
    messages = ((rows ?? []) as Array<{ created_at: string; body: string }>)
      .map((r) => ({ at: r.created_at, body: r.body }))
      .reverse();
  }

  return {
    bookingId: booking.id,
    title: booking.title,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    timeZone: booking.timezone,
    venue: [booking.venue_name, booking.venue_address].filter(Boolean).join(", ") || null,
    clientName: booking.contact_name,
    clientEmail: booking.contact_email ?? txn.payer_email,
    clientPhone: booking.contact_phone,
    amountPaidCents: txn.gross_amount_cents,
    currency: txn.currency,
    paidAt: txn.paid_at,
    paymentIntentId,
    receiptNumber: null,
    cancellationPolicy,
    refundPolicyKey: booking.refund_policy_key,
    messages,
  };
}

export function defaultDisputeEvidenceDeps(stripe: Stripe): DisputeEvidenceDeps {
  return {
    async retrieve(disputeId) {
      const d = await stripe.disputes.retrieve(disputeId);
      const pi = typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null);
      return {
        id: d.id,
        livemode: d.livemode,
        status: d.status,
        paymentIntentId: pi,
        submissionCount: d.evidence_details?.submission_count ?? 0,
      };
    },
    async loadFacts(paymentIntentId) {
      const sb = createServiceRoleClient();
      if (!sb) return null;
      return loadDisputeEvidenceFacts(sb, paymentIntentId);
    },
    async submit(disputeId, evidence, idempotencyKey) {
      await stripe.disputes.update(disputeId, { evidence, submit: true }, { idempotencyKey });
    },
  };
}

/**
 * Webhook entry point. Never throws: evidence is best-effort and a failure here
 * must not change the money-side outcome of the dispute event. OFF by default.
 */
export async function maybeSubmitDisputeEvidence(stripe: Stripe, disputeId: string): Promise<void> {
  try {
    const outcome = await autoSubmitDisputeEvidence(
      { disputeId, env: process.env },
      defaultDisputeEvidenceDeps(stripe),
    );
    if (outcome.kind === "refused") {
      logServerError("dispute-evidence.refused", `dispute ${disputeId}: ${outcome.reason}`);
    }
  } catch (err) {
    logServerError("dispute-evidence.submit", err);
  }
}
