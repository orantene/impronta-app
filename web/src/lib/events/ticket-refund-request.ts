/**
 * ticket-refund-request.ts — a guest asks for their money back from
 * `/ticket/<code>`.
 *
 * WHAT IT WRITES: one `ticket_refund_intents` row for the admission's ORDER
 * LINE, `reason = 'guest_request'`, `source = 'guest_request'`. Nothing here
 * moves money. The executor cron (`api/cron/ticket-refund-intents`) claims and
 * refunds it where the result is inspectable, exactly as it does for a lost
 * seat or a cancelled show; a `manual` policy inserts the row ALREADY CLAIMED
 * with `result = 'awaiting_review'`, so the cron skips it and a person decides
 * from the Exceptions inbox.
 *
 * WHAT IT REFUSES, each as a word the page renders as a sentence:
 *   not_found         the code does not verify, or is not this tenant's
 *   superseded        the code was replaced by a transfer
 *   refunds_closed    the event does not take requests (switch off, or the
 *                     close date passed)
 *   already_used      the holder was admitted
 *   not_valid         the admission is void / refunded
 *   event_cancelled   the cascade already owes the refund; nothing to ask
 *   nothing_to_refund a free ticket, or the line is already refunded
 *   already_requested an intent for this line exists (any source)
 *   unavailable       a read or the insert failed (a failed read is never
 *                     rendered as "closed")
 *
 * THE INSERT IS THE GUARD. `ticket_refund_intents_one_per_line` is UNIQUE on
 * `order_line_id`; a second press, or a request racing the cancel cascade,
 * lands as 23505 and reads `already_requested` rather than a second refund.
 * The eligibility read above it is for the sentence, not the safety.
 *
 * No `server-only`: tested against a scripted PostgREST fake in
 * `ticket-refund-request.test.ts` (lane `test:events`).
 */

import { logServerError } from "@/lib/server/safe-error";
import { verifyAdmissionToken } from "@/lib/sessions/admission-token";
import { loadTicketPageFacts, type FactsAdmin } from "./ticket-page-facts";
import { refundEligibility, type RefundEligibilityReason } from "./ticket-page-model";

export type TicketRefundReason = RefundEligibilityReason | "not_found" | "superseded" | "unavailable";

export type TicketRefundResult =
  | { ok: true; policyKey: string | null; awaitingReview: boolean }
  | { ok: false; reason: TicketRefundReason };

export async function requestTicketRefund(
  admin: FactsAdmin,
  input: { tenantId: string; code: string; now?: string },
): Promise<TicketRefundResult> {
  const verified = verifyAdmissionToken(input.code);
  if (!verified.ok) return { ok: false, reason: "not_found" };

  const { data, error } = await admin
    .from("admissions")
    .select("id, token_version, status, admitted_count")
    .eq("tenant_id", input.tenantId)
    .eq("id", verified.admissionId)
    .maybeSingle();
  if (error) {
    logServerError("events.ticketRefundRequest/admission", error);
    return { ok: false, reason: "unavailable" };
  }
  const row = data as { id: string; token_version: number; status: string; admitted_count: number | null } | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (Number(row.token_version) !== verified.tokenVersion) return { ok: false, reason: "superseded" };

  const facts = await loadTicketPageFacts(admin, { tenantId: input.tenantId, admissionId: row.id });
  // A read that failed is not a ticket with nothing to refund: refuse loudly.
  if (!facts) return { ok: false, reason: "unavailable" };
  if (!facts.orderId || !facts.orderLineId) return { ok: false, reason: "nothing_to_refund" };

  const verdict = refundEligibility({
    refundsOpen: facts.refundsOpen,
    refundsCloseAt: facts.refundsCloseAt,
    now: input.now ?? new Date().toISOString(),
    admissionStatus: row.status,
    admittedCount: Number(row.admitted_count ?? facts.admittedCount ?? 0),
    eventStatus: facts.eventStatus,
    lineTotalCents: facts.lineTotalCents,
    lineRefundedCents: facts.lineRefundedCents,
    alreadyRequested: facts.refundRequested,
  });
  if (!verdict.ok) return verdict;

  const awaitingReview = facts.refundPolicyKey === "manual";
  const nowIso = new Date().toISOString();
  const { error: insErr } = await admin.from("ticket_refund_intents").insert({
    tenant_id: input.tenantId,
    order_id: facts.orderId,
    order_line_id: facts.orderLineId,
    reason: "guest_request",
    source: "guest_request",
    requested_by_admission_id: row.id,
    ...(awaitingReview ? { claimed_at: nowIso, result: "awaiting_review", result_detail: { policy: "manual", requested_at: nowIso } } : {}),
  });
  if (insErr) {
    const code = String((insErr as { code?: unknown }).code ?? "");
    if (code === "23505") return { ok: false, reason: "already_requested" };
    logServerError("events.ticketRefundRequest/insert", insErr);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, policyKey: facts.refundPolicyKey, awaitingReview };
}
