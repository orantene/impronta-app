/**
 * lib/payments/dispute-evidence.ts (TUL-1364)
 *
 * Gather the booking facts and submit them to Stripe as dispute evidence when a
 * card dispute opens on a booking charge. A dispute is lost by default once the
 * evidence window passes, and until now nothing was ever submitted
 * (provider-disputes.ts only records).
 *
 * Guards, all fail closed (refuse and log, never guess):
 *   - OFF by default. Runs only when DISPUTE_EVIDENCE_AUTOSUBMIT is exactly "1".
 *   - TEST mode only: a livemode dispute is refused, whatever the flag says.
 *   - Only a dispute that still needs a response and has never had evidence
 *     submitted (Stripe allows one submission; we also send an idempotency key).
 *   - Only when the booking and the client contact resolve. Thin evidence is
 *     worse than none, so we refuse instead of submitting a partial file.
 *   - Internal notes never leave: only client-visible text messages are used.
 *
 * Pure: Stripe and Supabase are injected, so the decision is unit-testable.
 * It records and submits; it moves no money and changes no amount.
 */

export type DisputeEvidenceFacts = {
  bookingId: string;
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string | null;
  venue: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  amountPaidCents: number;
  currency: string;
  paidAt: string | null;
  /** Stripe PaymentIntent id of the settled charge (the receipt reference). */
  paymentIntentId: string;
  /** Booking confirmation / receipt number when one exists. */
  receiptNumber: string | null;
  /** The cancellation policy the client saw (published snapshot), or null. */
  cancellationPolicy: string | null;
  refundPolicyKey: string | null;
  /** Client-visible text messages, oldest first. */
  messages: Array<{ at: string; body: string }>;
};

export type DisputeEvidenceFields = {
  customer_name?: string;
  customer_email_address?: string;
  product_description: string;
  service_date?: string;
  cancellation_policy_disclosure?: string;
  refund_policy_disclosure?: string;
  uncategorized_text: string;
};

/** Stripe caps each free-text evidence field at 20,000 characters. */
const FIELD_MAX = 20_000;
const MESSAGE_EXCERPT_MAX = 3_000;
const MESSAGE_COUNT_MAX = 12;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/** The last messages that fit the excerpt budget, oldest first. */
export function messageExcerpt(messages: DisputeEvidenceFacts["messages"]): string {
  const recent = messages.slice(-MESSAGE_COUNT_MAX);
  const lines: string[] = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const body = recent[i].body.replace(/\s+/g, " ").trim();
    if (!body) continue;
    const line = `[${recent[i].at}] ${body}`;
    if (used + line.length > MESSAGE_EXCERPT_MAX) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/** Why the facts are not enough to submit, or null when they are. */
export function insufficientEvidenceReason(facts: DisputeEvidenceFacts): string | null {
  if (!facts.clientEmail?.trim()) return "no client email";
  if (!facts.clientName?.trim()) return "no client name";
  if (!facts.title?.trim()) return "no service description";
  if (!facts.startsAt) return "no service date";
  if (facts.amountPaidCents <= 0) return "no recorded payment";
  return null;
}

export function buildDisputeEvidence(facts: DisputeEvidenceFacts): DisputeEvidenceFields {
  const where = facts.venue?.trim() ? ` at ${facts.venue.trim()}` : "";
  const product = `${facts.title?.trim() ?? "Booked service"}${where}. Booking ${facts.bookingId}, scheduled ${facts.startsAt}${facts.endsAt ? ` to ${facts.endsAt}` : ""}${facts.timeZone ? ` (${facts.timeZone})` : ""}.`;
  const excerpt = messageExcerpt(facts.messages);
  const record = [
    `Booking record: ${facts.bookingId}`,
    `Receipt: ${facts.receiptNumber ?? `payment ${facts.paymentIntentId}`}, ${money(facts.amountPaidCents, facts.currency)}${facts.paidAt ? `, paid ${facts.paidAt}` : ""}`,
    `Client contact: ${facts.clientName ?? ""} <${facts.clientEmail ?? ""}>${facts.clientPhone ? `, ${facts.clientPhone}` : ""}`,
    excerpt ? `Client message log (excerpt):\n${excerpt}` : "Client message log: no client-visible text messages on this booking.",
  ].join("\n");

  const out: DisputeEvidenceFields = {
    product_description: clip(product, FIELD_MAX),
    uncategorized_text: clip(record, FIELD_MAX),
  };
  if (facts.clientName?.trim()) out.customer_name = clip(facts.clientName.trim(), 200);
  if (facts.clientEmail?.trim()) out.customer_email_address = clip(facts.clientEmail.trim(), 200);
  if (facts.startsAt) out.service_date = facts.startsAt.slice(0, 10);
  if (facts.cancellationPolicy?.trim()) {
    out.cancellation_policy_disclosure = clip(facts.cancellationPolicy.trim(), FIELD_MAX);
  }
  if (facts.refundPolicyKey?.trim()) {
    out.refund_policy_disclosure = clip(`Refund policy applied to this booking: ${facts.refundPolicyKey.trim()}.`, FIELD_MAX);
  }
  return out;
}

/** The slice of a Stripe dispute this module reads. */
export type DisputeForEvidence = {
  id: string;
  livemode: boolean;
  status: string;
  paymentIntentId: string | null;
  submissionCount: number;
};

export type DisputeEvidenceDeps = {
  /** Re-read the dispute from Stripe (the event payload can be stale). */
  retrieve(disputeId: string): Promise<DisputeForEvidence>;
  /** Null when the PaymentIntent is not a booking charge we can place. */
  loadFacts(paymentIntentId: string): Promise<DisputeEvidenceFacts | null>;
  /** Submit with `submit: true`. Must pass the idempotency key to Stripe. */
  submit(disputeId: string, evidence: DisputeEvidenceFields, idempotencyKey: string): Promise<void>;
};

export type DisputeEvidenceOutcome =
  | { kind: "disabled" }
  | { kind: "refused"; reason: string }
  | { kind: "submitted"; disputeId: string };

export function isDisputeEvidenceAutoSubmitEnabled(env: Record<string, string | undefined>): boolean {
  return env.DISPUTE_EVIDENCE_AUTOSUBMIT === "1";
}

export function disputeEvidenceIdempotencyKey(disputeId: string): string {
  return `dispute-evidence:${disputeId}`;
}

export async function autoSubmitDisputeEvidence(
  input: { disputeId: string; env: Record<string, string | undefined> },
  deps: DisputeEvidenceDeps,
): Promise<DisputeEvidenceOutcome> {
  if (!isDisputeEvidenceAutoSubmitEnabled(input.env)) return { kind: "disabled" };

  const dispute = await deps.retrieve(input.disputeId);
  if (dispute.livemode) return { kind: "refused", reason: "live-mode dispute (TEST mode only)" };
  if (dispute.status !== "needs_response") return { kind: "refused", reason: `status is ${dispute.status}` };
  if (dispute.submissionCount > 0) return { kind: "refused", reason: "evidence already submitted" };
  if (!dispute.paymentIntentId) return { kind: "refused", reason: "no payment intent on the dispute" };

  const facts = await deps.loadFacts(dispute.paymentIntentId);
  if (!facts) return { kind: "refused", reason: "not a booking charge we can place" };
  const thin = insufficientEvidenceReason(facts);
  if (thin) return { kind: "refused", reason: `insufficient evidence: ${thin}` };

  await deps.submit(dispute.id, buildDisputeEvidence(facts), disputeEvidenceIdempotencyKey(dispute.id));
  return { kind: "submitted", disputeId: dispute.id };
}
