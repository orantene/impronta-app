/**
 * lib/bookings/transactions.ts
 *
 * Server-only operations on booking_transactions.
 *
 * v1 model: provider = 'manual' throughout. No Stripe wiring.
 * State machine: draft → payment_requested → (pending →) paid → payout_pending → payout_sent
 *
 * Each state transition emits an inquiry_events row (with booking_id set)
 * for auditability.
 */

import { improntaLog } from "@/lib/server/structured-log";
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { calculateTransactionAmounts } from "@/lib/bookings/commission";
import {
  describeTransactionTransitionEvent,
} from "@/lib/bookings/transaction-events";
import {
  notifyPaymentReceived,
  notifyTalentPayoutSettled,
} from "@/lib/notifications/producers/payment-notify";
import { notifyBookingConfirmed } from "@/lib/notifications/producers/booking-confirmed-notify";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionStatus =
  | "draft"
  | "payment_requested"
  | "pending"
  | "paid"
  | "payout_pending"
  | "payout_sent"
  | "cancelled"
  | "refunded"
  | "disputed"
  | "failed";

export type PayoutReceiverKind = "agency" | "admin" | "coordinator" | "talent";

export type BookingTransaction = {
  id: string;
  bookingId: string;
  sourceTenantId: string;
  sourceInquiryId: string | null;
  payerUserId: string | null;
  payerEmail: string | null;
  payoutReceiverId: string | null;
  payoutReceiverKind: PayoutReceiverKind | null;
  payoutReceiverDisplayName: string | null;
  grossAmountCents: number;
  platformFeeBasisPoints: number;
  platformFeeCents: number;
  netAmountCents: number;
  currency: string;
  provider: string;
  providerReference: string | null;
  refundOfTransactionId: string | null;
  status: TransactionStatus;
  requestedAt: string | null;
  paidAt: string | null;
  payoutInitiatedAt: string | null;
  payoutCompletedAt: string | null;
  refundedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PayoutReceiverCandidate = {
  payoutAccountId: string;
  ownerType: "agency" | "profile" | "talent";
  ownerId: string;
  displayName: string;
  receiverKind: PayoutReceiverKind;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Load the active transaction for a booking.
 * Returns null if no non-cancelled transaction exists.
 * Accepts a user-context Supabase client so RLS applies.
 */
export async function loadActiveBookingTransaction(
  bookingId: string,
  supabase?: SupabaseClient,
): Promise<BookingTransaction | null> {
  try {
    const sb = supabase ?? createServiceRoleClient();
    if (!sb) return null;

    const { data, error } = await sb
      .from("booking_transactions")
      .select("*")
      .eq("booking_id", bookingId)
      .not("status", "in", '("cancelled","failed","refunded")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logServerError("transactions.loadActive", error);
      return null;
    }
    if (!data) return null;

    return mapRow(data as TransactionRow);
  } catch (err) {
    logServerError("transactions.loadActive", err);
    return null;
  }
}

/**
 * Load all transactions for a tenant (for the bookings overview).
 * Returns a map keyed by booking_id → active transaction.
 */
export async function loadTransactionsForTenant(
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<Map<string, BookingTransaction>> {
  const out = new Map<string, BookingTransaction>();
  try {
    const sb = supabase ?? createServiceRoleClient();
    if (!sb) return out;

    const { data, error } = await sb
      .from("booking_transactions")
      .select("*")
      .eq("source_tenant_id", tenantId)
      .not("status", "in", '("cancelled","failed","refunded")')
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("transactions.loadForTenant", error);
      return out;
    }

    for (const row of (data ?? []) as TransactionRow[]) {
      const tx = mapRow(row);
      // Keep the most recent per booking (in case of multiple, which shouldn't happen)
      if (!out.has(tx.bookingId)) {
        out.set(tx.bookingId, tx);
      }
    }
  } catch (err) {
    logServerError("transactions.loadForTenant", err);
  }
  return out;
}

/**
 * Eligible payout receiver accounts for one booking.
 *
 * Rules (transaction-architecture.md §4):
 * - account must be connected and belong to the same tenant,
 * - agency account is eligible,
 * - profile account is eligible for owner/admin/coordinator memberships,
 * - talent account is eligible only if that talent is on booking_talent.
 */
export async function loadPayoutReceiverCandidatesForBooking(opts: {
  tenantId: string;
  bookingId: string;
  supabase?: SupabaseClient;
}): Promise<PayoutReceiverCandidate[]> {
  const sb = opts.supabase ?? createServiceRoleClient();
  if (!sb) return [];

  try {
    const [accountsRes, membersRes, bookingTalentRes] = await Promise.all([
      sb
        .from("payout_accounts")
        .select("id, owner_type, owner_id, display_name")
        .eq("tenant_id", opts.tenantId)
        .eq("status", "connected")
        .order("display_name", { ascending: true }),
      sb
        .from("agency_memberships")
        .select("profile_id, role")
        .eq("tenant_id", opts.tenantId)
        .eq("status", "active")
        .in("role", ["owner", "admin", "manager"]),
      sb
        .from("booking_talent")
        .select("talent_profile_id")
        .eq("tenant_id", opts.tenantId)
        .eq("booking_id", opts.bookingId),
    ]);

    if (accountsRes.error) {
      logServerError("transactions.loadReceiverCandidates.accounts", accountsRes.error);
      return [];
    }
    if (membersRes.error) {
      logServerError("transactions.loadReceiverCandidates.members", membersRes.error);
      return [];
    }
    if (bookingTalentRes.error) {
      logServerError("transactions.loadReceiverCandidates.bookingTalent", bookingTalentRes.error);
      return [];
    }

    const roleByProfileId = new Map<string, "owner" | "admin" | "manager">();
    for (const row of (membersRes.data ?? []) as { profile_id: string; role: "owner" | "admin" | "manager" }[]) {
      roleByProfileId.set(row.profile_id, row.role);
    }

    const bookingTalentIds = new Set(
      ((bookingTalentRes.data ?? []) as { talent_profile_id: string | null }[])
        .map((row) => row.talent_profile_id)
        .filter((id): id is string => Boolean(id)),
    );

    const out: PayoutReceiverCandidate[] = [];
    for (const row of (accountsRes.data ?? []) as {
      id: string;
      owner_type: "agency" | "profile" | "talent";
      owner_id: string;
      display_name: string;
    }[]) {
      if (row.owner_type === "agency") {
        if (row.owner_id !== opts.tenantId) continue;
        out.push({
          payoutAccountId: row.id,
          ownerType: row.owner_type,
          ownerId: row.owner_id,
          displayName: row.display_name,
          receiverKind: "agency",
        });
        continue;
      }

      if (row.owner_type === "profile") {
        const role = roleByProfileId.get(row.owner_id);
        if (!role) continue;
        out.push({
          payoutAccountId: row.id,
          ownerType: row.owner_type,
          ownerId: row.owner_id,
          displayName: row.display_name,
          receiverKind: role === "manager" ? "coordinator" : "admin",
        });
        continue;
      }

      if (row.owner_type === "talent") {
        if (!bookingTalentIds.has(row.owner_id)) continue;
        out.push({
          payoutAccountId: row.id,
          ownerType: row.owner_type,
          ownerId: row.owner_id,
          displayName: row.display_name,
          receiverKind: "talent",
        });
      }
    }

    return out;
  } catch (err) {
    logServerError("transactions.loadReceiverCandidates", err);
    return [];
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a draft booking_transaction with fee auto-calculated from the workspace plan.
 * Requires service-role access (only staff initiate transactions).
 */
export async function createBookingTransaction(opts: {
  bookingId: string;
  sourceTenantId: string;
  sourceInquiryId: string | null;
  planTier: string;
  grossAmountCents: number;
  currency?: string;
  payerUserId?: string | null;
  payerEmail?: string | null;
  createdByProfileId?: string | null;
}): Promise<TransactionResult<BookingTransaction>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const amounts = calculateTransactionAmounts(opts.grossAmountCents, opts.planTier);

    const { data, error } = await sb
      .from("booking_transactions")
      .insert({
        booking_id:               opts.bookingId,
        source_tenant_id:         opts.sourceTenantId,
        source_inquiry_id:        opts.sourceInquiryId,
        payer_user_id:            opts.payerUserId ?? null,
        payer_email:              opts.payerEmail ?? null,
        gross_amount_cents:       amounts.grossCents,
        platform_fee_basis_points: amounts.feeBasisPoints,
        platform_fee_cents:       amounts.feeCents,
        net_amount_cents:         amounts.netCents,
        currency:                 opts.currency ?? "USD",
        provider:                 "manual",
        status:                   "draft",
        created_by_profile_id:    opts.createdByProfileId ?? null,
      })
      .select("*")
      .single();

    if (error) {
      logServerError("transactions.create", error);
      return { ok: false, error: "Failed to create transaction." };
    }

    const row = data as TransactionRow;
    await emitTransactionEvent(sb, {
      sourceInquiryId: row.source_inquiry_id,
      sourceTenantId: row.source_tenant_id,
      bookingId: row.booking_id,
      transactionId: row.id,
      eventType: "booking.payment.transaction_created",
      payload: {
        status: row.status,
        gross_amount_cents: row.gross_amount_cents,
        platform_fee_cents: row.platform_fee_cents,
        net_amount_cents: row.net_amount_cents,
        provider: row.provider,
      },
    });

    return { ok: true, data: mapRow(row) };
  } catch (err) {
    logServerError("transactions.create", err);
    return { ok: false, error: "Unexpected error creating transaction." };
  }
}

// ─── State transitions ────────────────────────────────────────────────────────

/**
 * Advance transaction from draft → payment_requested.
 * Sets requested_at. Only valid from 'draft'.
 */
export async function requestPayment(
  transactionId: string,
): Promise<TransactionResult<BookingTransaction>> {
  const result = await transitionStatus(transactionId, "draft", "payment_requested", {
    requested_at: new Date().toISOString(),
  });
  // §6 chat-card: emit payment_request card into the private thread on
  // successful transition. Mirrors the markPaid emit pattern — fire-
  // and-forget via the service-role client so failure never blocks the
  // user action.
  if (result.ok && result.data.sourceInquiryId) {
    const sb = createServiceRoleClient();
    if (sb) {
      const amountLabel = result.data.grossAmountCents
        ? `${(result.data.grossAmountCents / 100).toFixed(2)} ${result.data.currency ?? "USD"}`
        : "";
      sb.from("inquiry_messages").insert({
        inquiry_id: result.data.sourceInquiryId,
        tenant_id: result.data.sourceTenantId,
        thread_type: "private",
        sender_user_id: null,
        body: `Payment requested: ${amountLabel}`.trim(),
        message_kind: "payment_request",
        card_payload: {
          amount_label: amountLabel,
          transaction_id: result.data.id,
          hint: "Pay to confirm the booking.",
        },
      }).then((r) => {
        if (r.error) logServerError("transactions.requestPayment.chatCard", r.error);
      });
    }
  }
  return result;
}

/**
 * Mark transaction as paid (funds received).
 * Valid from payment_requested or pending.
 */
export async function markPaid(
  transactionId: string,
): Promise<TransactionResult<BookingTransaction>> {
  const result = await transitionStatus(transactionId, ["payment_requested", "pending", "disputed"], "paid", {
    paid_at: new Date().toISOString(),
  });
  // Item #15 wiring: audit emit on successful paid transition. Inquiry
  // id resolved from the transaction's sourceInquiryId. Fire-and-forget
  // — failure logs only, never breaks the user-facing action.
  if (result.ok && result.data.sourceInquiryId) {
    const sb = createServiceRoleClient();
    if (sb) {
      sb.rpc("inquiry_audit_emit", {
        p_inquiry_id: result.data.sourceInquiryId,
        p_kind: "payment_paid",
        p_payload: {
          transaction_id: result.data.id,
          booking_id: result.data.bookingId,
        },
        p_amount_cents: result.data.grossAmountCents,
        p_currency: result.data.currency,
      }).then((r) => {
        if (r.error) logServerError("transactions.markPaid.audit", r.error);
      });
      // §6 chat-card: emit payment_paid card into the private thread.
      const amountLabel = result.data.grossAmountCents
        ? `${(result.data.grossAmountCents / 100).toFixed(2)} ${result.data.currency ?? "USD"}`
        : "";
      sb.from("inquiry_messages").insert({
        inquiry_id: result.data.sourceInquiryId,
        tenant_id: result.data.sourceTenantId,
        thread_type: "private",
        sender_user_id: null,
        body: `Payment received: ${amountLabel}`.trim(),
        message_kind: "payment_paid",
        card_payload: { amount_label: amountLabel, transaction_id: result.data.id },
      }).then((r) => {
        if (r.error) logServerError("transactions.markPaid.chatCard", r.error);
      });
    }
  }
  // Slice 15.4: payment.received → client receipt (email) + workspace alert
  // (email + in-app). Fires for every paid transition regardless of a source
  // inquiry; the dispatcher no-ops without RESEND_API_KEY and dedupes a retry
  // on the stable transaction-scoped eventId.
  if (result.ok) {
    // Sync the booking the talent/agency dashboards read. The payment flow
    // historically only flipped booking_transactions.status — agency_bookings
    // (what talent earnings + workspace financials read) was never updated, so a
    // client's real payment never showed as "paid" on those surfaces. Money
    // received ⇒ payment_status='paid' + client_revenue_lifecycle='paid' (talent
    // moves confirmed→pending; payout_lifecycle flips to 'paid' later, when
    // executeBookingTransfers actually disburses the talent's funds).
    if (result.data.bookingId) {
      const sbBooking = createServiceRoleClient();
      if (sbBooking) {
        sbBooking
          .from("agency_bookings")
          .update({
            payment_status: "paid",
            client_revenue_lifecycle: "paid",
            updated_at: new Date().toISOString(),
          })
          .eq("id", result.data.bookingId)
          .then((r) => {
            if (r.error) logServerError("transactions.markPaid.bookingSync", r.error);
          });
      }
    }
    notifyPaymentReceived({
      transactionId: result.data.id,
      tenantId: result.data.sourceTenantId,
      inquiryId: result.data.sourceInquiryId,
      bookingId: result.data.bookingId,
      payerUserId: result.data.payerUserId,
      payerEmail: result.data.payerEmail,
      grossAmountCents: result.data.grossAmountCents,
      currency: result.data.currency,
      paidAt: result.data.paidAt,
    });
    // Payment-time booking confirmation (restores pre-engine behavior): the
    // conversion-time booking.created no longer emails, so the client + booked
    // talent get "Booking confirmed" HERE, when money is actually collected.
    // DISTINCT eventId from the receipt above, so the two never collide on the
    // dispatch_log dedupe key. Requires the source inquiry for client/talent
    // audience + schedule hydration.
    if (result.data.sourceInquiryId) {
      notifyBookingConfirmed({
        tenantId: result.data.sourceTenantId,
        inquiryId: result.data.sourceInquiryId,
        bookingId: result.data.bookingId,
      });
    }
  }
  return result;
}

/**
 * Initiate payout to receiver.
 * Valid from paid.
 */
export async function initiatePayout(
  transactionId: string,
): Promise<TransactionResult<BookingTransaction>> {
  return transitionStatus(transactionId, "paid", "payout_pending", {
    payout_initiated_at: new Date().toISOString(),
  });
}

/**
 * Mark payout as sent/completed.
 * Valid from payout_pending.
 */
export async function markPayoutSent(
  transactionId: string,
  opts?: {
    providerReference?: string | null;
    externalNote?: string | null;
  },
): Promise<TransactionResult<BookingTransaction>> {
  const result = await transitionStatus(transactionId, "payout_pending", "payout_sent", {
    payout_completed_at: new Date().toISOString(),
    provider_reference: opts?.providerReference?.trim() || null,
  });
  if (!result.ok) return result;

  // Slice 15.4: payment.payout_settled → the talent who was paid (email +
  // in-app). Only talent-owned payout accounts have a talent recipient; the
  // resolver chains payoutReceiverId (= payout_accounts.id) to the user.
  if (result.data.payoutReceiverKind === "talent" && result.data.payoutReceiverId) {
    notifyTalentPayoutSettled({
      transactionId: result.data.id,
      tenantId: result.data.sourceTenantId,
      inquiryId: result.data.sourceInquiryId,
      bookingId: result.data.bookingId,
      payoutAccountId: result.data.payoutReceiverId,
      netAmountCents: result.data.netAmountCents,
      currency: result.data.currency,
    });
  }

  // Manual provider trail: store operator note as a staff-only event.
  if (result.data.provider === "manual") {
    const sb = createServiceRoleClient();
    if (!sb) return result;
    await emitTransactionEvent(sb, {
      sourceInquiryId: result.data.sourceInquiryId,
      sourceTenantId: result.data.sourceTenantId,
      bookingId: result.data.bookingId,
      transactionId: result.data.id,
      eventType: "payout.marked_external",
      visibility: "staff_only",
      payload: {
        amount_cents: result.data.netAmountCents,
        note: opts?.externalNote?.trim() || null,
      },
    });
  }

  return result;
}

/**
 * Cancel a transaction. Valid from draft, payment_requested, or failed.
 */
export async function cancelTransaction(
  transactionId: string,
): Promise<TransactionResult<BookingTransaction>> {
  return transitionStatus(transactionId, ["draft", "payment_requested", "failed"], "cancelled", {});
}

/**
 * Move a requested payment into provider-pending.
 * v1 manual flows may skip this entirely.
 */
export async function markPending(
  transactionId: string,
): Promise<TransactionResult<BookingTransaction>> {
  return transitionStatus(transactionId, "payment_requested", "pending", {});
}

/**
 * Mark the transaction as failed.
 * Valid from payment_requested, pending, or payout_pending.
 */
export async function markFailed(
  transactionId: string,
  failureReason: string = "manual_marked_failed",
): Promise<TransactionResult<BookingTransaction>> {
  return transitionStatus(
    transactionId,
    ["payment_requested", "pending", "payout_pending"],
    "failed",
    { failure_reason: failureReason },
  );
}

/**
 * Mark a paid transaction as disputed.
 */
export async function markDisputed(
  transactionId: string,
): Promise<TransactionResult<BookingTransaction>> {
  return transitionStatus(transactionId, "paid", "disputed", {});
}

/**
 * Mark a transaction as refunded.
 */
export async function markRefunded(
  transactionId: string,
  opts?: {
    providerReference?: string | null;
    refundNote?: string | null;
  },
): Promise<TransactionResult<BookingTransaction>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const { data: existingData, error: existingError } = await sb
      .from("booking_transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (existingError || !existingData) {
      logServerError("transactions.markRefunded.lookup", existingError);
      return { ok: false, error: "Transaction not found." };
    }

    const existing = existingData as TransactionRow;
    if (!["paid", "payout_pending", "payout_sent", "disputed"].includes(existing.status)) {
      return {
        ok: false,
        error: `Cannot transition from '${existing.status}' to 'refunded'.`,
      };
    }
    if (existing.refund_of_transaction_id) {
      return { ok: false, error: "Refund records cannot be refunded again." };
    }

    const { data: existingRefund } = await sb
      .from("booking_transactions")
      .select("id")
      .eq("refund_of_transaction_id", transactionId)
      .eq("status", "refunded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingRefund) {
      return {
        ok: false,
        error: "A linked refund transaction already exists for this payment.",
      };
    }

    const nowIso = new Date().toISOString();
    const { data: refundRowData, error: refundRowError } = await sb
      .from("booking_transactions")
      .insert({
        booking_id: existing.booking_id,
        source_tenant_id: existing.source_tenant_id,
        source_inquiry_id: existing.source_inquiry_id,
        payer_user_id: existing.payer_user_id,
        payer_email: existing.payer_email,
        payout_receiver_id: existing.payout_receiver_id,
        payout_receiver_kind: existing.payout_receiver_kind,
        payout_receiver_display_name: existing.payout_receiver_display_name,
        gross_amount_cents: existing.gross_amount_cents,
        platform_fee_basis_points: existing.platform_fee_basis_points,
        platform_fee_cents: existing.platform_fee_cents,
        net_amount_cents: existing.net_amount_cents,
        currency: existing.currency,
        provider: existing.provider,
        provider_reference: opts?.providerReference?.trim() || null,
        provider_metadata: existing.provider_metadata,
        status: "refunded",
        refund_of_transaction_id: existing.id,
        refunded_at: nowIso,
        failure_reason: opts?.refundNote?.trim() || null,
        created_by_profile_id: existing.created_by_profile_id,
      })
      .select("*")
      .single();

    if (refundRowError || !refundRowData) {
      logServerError("transactions.markRefunded.insertRefundRecord", refundRowError);
      return { ok: false, error: "Failed to create linked refund transaction." };
    }

    const refundRow = refundRowData as TransactionRow;
    const transition = await transitionStatus(
      transactionId,
      ["paid", "payout_pending", "payout_sent", "disputed"],
      "refunded",
      {
        refund_of_transaction_id: refundRow.id,
        provider_reference: opts?.providerReference?.trim() || null,
        failure_reason: opts?.refundNote?.trim() || null,
      },
    );

    if (!transition.ok) {
      const { error: deleteError } = await sb
        .from("booking_transactions")
        .delete()
        .eq("id", refundRow.id);
      if (deleteError) {
        logServerError("transactions.markRefunded.orphan", {
          message: `CRITICAL: Orphan refund row ${refundRow.id} created — manual cleanup required`,
          refundRowId: refundRow.id,
          originalTransactionId: transactionId,
          deleteError,
        });
      }
      return transition;
    }

    return transition;
  } catch (err) {
    logServerError("transactions.markRefunded", err);
    return { ok: false, error: "Unexpected error while creating refund transaction." };
  }
}

/**
 * Select or change payout receiver while transaction is still pre-paid.
 * Receiver is locked once status reaches paid/payout_pending/payout_sent.
 * sourceTenantId must match the transaction's source_tenant_id.
 */
export async function setTransactionPayoutReceiver(opts: {
  transactionId: string;
  payoutAccountId: string;
  sourceTenantId: string;
}): Promise<TransactionResult<BookingTransaction>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const { data: txData, error: txError } = await sb
      .from("booking_transactions")
      .select(
        "id, status, booking_id, source_tenant_id, source_inquiry_id, payout_receiver_id, payout_receiver_kind, payout_receiver_display_name",
      )
      .eq("id", opts.transactionId)
      .single();

    if (txError || !txData) {
      logServerError("transactions.setReceiver.tx", txError);
      return { ok: false, error: "Transaction not found." };
    }

    const tx = txData as {
      id: string;
      status: TransactionStatus;
      booking_id: string;
      source_tenant_id: string;
      source_inquiry_id: string | null;
      payout_receiver_id: string | null;
      payout_receiver_kind: string | null;
      payout_receiver_display_name: string | null;
    };

    if (tx.source_tenant_id !== opts.sourceTenantId) {
      return { ok: false, error: "Tenant scope mismatch." };
    }

    if (!["draft", "payment_requested", "pending"].includes(tx.status)) {
      return { ok: false, error: "Cannot change receiver after payment received." };
    }

    const candidates = await loadPayoutReceiverCandidatesForBooking({
      tenantId: tx.source_tenant_id,
      bookingId: tx.booking_id,
      supabase: sb,
    });

    const selected = candidates.find((c) => c.payoutAccountId === opts.payoutAccountId);
    if (!selected) {
      return {
        ok: false,
        error: "Selected payout receiver is not eligible for this booking.",
      };
    }

    const { data: updated, error: updateError } = await sb
      .from("booking_transactions")
      .update({
        payout_receiver_id: selected.payoutAccountId,
        payout_receiver_kind: selected.receiverKind,
        payout_receiver_display_name: selected.displayName,
      })
      .eq("id", opts.transactionId)
      .select("*")
      .single();

    if (updateError || !updated) {
      logServerError("transactions.setReceiver.update", updateError);
      return { ok: false, error: "Failed to save payout receiver." };
    }

    const wasSet = Boolean(tx.payout_receiver_id);
    await emitTransactionEvent(sb, {
      sourceInquiryId: tx.source_inquiry_id,
      sourceTenantId: tx.source_tenant_id,
      bookingId: tx.booking_id,
      transactionId: tx.id,
      eventType: wasSet ? "payment.receiver_changed" : "payment.receiver_selected",
      visibility: "participants",
      payload: wasSet
        ? {
            from: {
              id: tx.payout_receiver_id,
              kind: tx.payout_receiver_kind,
              display_name: tx.payout_receiver_display_name,
            },
            to: {
              id: selected.payoutAccountId,
              kind: selected.receiverKind,
              display_name: selected.displayName,
            },
          }
        : {
            receiver_id: selected.payoutAccountId,
            receiver_kind: selected.receiverKind,
            receiver_display_name: selected.displayName,
          },
    });

    return { ok: true, data: mapRow(updated as TransactionRow) };
  } catch (err) {
    logServerError("transactions.setReceiver", err);
    return { ok: false, error: "Unexpected error while selecting payout receiver." };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function transitionStatus(
  transactionId: string,
  fromStatus: TransactionStatus | TransactionStatus[],
  toStatus: TransactionStatus,
  extraFields: Record<string, unknown>,
): Promise<TransactionResult<BookingTransaction>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const fromArr = Array.isArray(fromStatus) ? fromStatus : [fromStatus];

    const { data: existing } = await sb
      .from("booking_transactions")
      .select("status, source_inquiry_id, source_tenant_id, booking_id")
      .eq("id", transactionId)
      .single();

    if (!existing) return { ok: false, error: "Transaction not found." };

    const existingRow = existing as {
      status: string;
      source_inquiry_id: string | null;
      source_tenant_id: string;
      booking_id: string;
    };
    const currentStatus = existingRow.status;
    if (!fromArr.includes(currentStatus as TransactionStatus)) {
      return {
        ok: false,
        error: `Cannot transition from '${currentStatus}' to '${toStatus}'.`,
      };
    }

    const { data, error } = await sb
      .from("booking_transactions")
      .update({
        status: toStatus,
        updated_at: new Date().toISOString(),
        ...extraFields,
      })
      .eq("id", transactionId)
      .select("*")
      .single();

    if (error) {
      logServerError(`transactions.transition.${toStatus}`, error);
      return { ok: false, error: `Failed to update transaction status.` };
    }

    const row = data as TransactionRow;
    const transitionEvent = describeTransactionTransitionEvent({
      toStatus,
      fromStatus: currentStatus,
      grossAmountCents: row.gross_amount_cents,
      netAmountCents: row.net_amount_cents,
      currency: row.currency,
      provider: row.provider,
      providerReference: row.provider_reference,
      failureReason: row.failure_reason,
      refundTransactionId: row.refund_of_transaction_id,
    });
    await emitTransactionEvent(sb, {
      sourceInquiryId: existingRow.source_inquiry_id,
      sourceTenantId: existingRow.source_tenant_id,
      bookingId: existingRow.booking_id,
      transactionId,
      eventType: transitionEvent.eventType,
      visibility: transitionEvent.visibility,
      payload: transitionEvent.payload,
    });

    return { ok: true, data: mapRow(row) };
  } catch (err) {
    logServerError(`transactions.transition.${toStatus}`, err);
    return { ok: false, error: "Unexpected error during status transition." };
  }
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

type TransactionRow = {
  id: string;
  booking_id: string;
  source_tenant_id: string;
  source_inquiry_id: string | null;
  payer_user_id: string | null;
  payer_email: string | null;
  payout_receiver_id: string | null;
  payout_receiver_kind: string | null;
  payout_receiver_display_name: string | null;
  gross_amount_cents: number;
  platform_fee_basis_points: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  provider: string;
  provider_reference: string | null;
  provider_metadata: Record<string, unknown>;
  refund_of_transaction_id: string | null;
  status: TransactionStatus;
  requested_at: string | null;
  paid_at: string | null;
  payout_initiated_at: string | null;
  payout_completed_at: string | null;
  refunded_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

async function emitTransactionEvent(
  sb: SupabaseClient,
  opts: {
    sourceInquiryId: string | null;
    sourceTenantId: string;
    bookingId: string;
    transactionId: string;
    eventType: string;
    visibility?: "participants" | "staff_only";
    payload: Record<string, unknown>;
  },
): Promise<void> {
  // inquiry_events.inquiry_id is NOT NULL in the schema, so booking-only
  // transactions (no sourceInquiryId) cannot produce an inquiry_event row.
  // Log them as structured server-side audit entries so the audit trail is
  // preserved without blocking the state transition.
  if (!opts.sourceInquiryId) {
    logServerError("transactions.emitEvent.bookingOnly", {
      message: "Transaction event for booking-only transaction (no inquiry_id) — audit trail preserved here",
      eventType: opts.eventType,
      transactionId: opts.transactionId,
      bookingId: opts.bookingId,
      sourceTenantId: opts.sourceTenantId,
      visibility: opts.visibility ?? "staff_only",
      payload: opts.payload,
    });
    return;
  }

  const { error } = await sb.from("inquiry_events").insert({
    inquiry_id: opts.sourceInquiryId,
    tenant_id: opts.sourceTenantId,
    booking_id: opts.bookingId,
    event_type: opts.eventType,
    actor_user_id: null,
    actor_role: "system",
    visibility: opts.visibility ?? "staff_only",
    payload: {
      transaction_id: opts.transactionId,
      ...opts.payload,
    },
  });

  if (error) {
    // Transaction lifecycle must continue even if audit insert fails.
    logServerError("transactions.emitEvent", error);
  }
}

const VALID_PAYOUT_RECEIVER_KINDS: readonly string[] = ["agency", "admin", "coordinator", "talent"];

function parsePayoutReceiverKind(raw: string | null): PayoutReceiverKind | null {
  if (raw === null) return null;
  if (VALID_PAYOUT_RECEIVER_KINDS.includes(raw)) return raw as PayoutReceiverKind;
  void improntaLog("bookings_transactions.warn", {
    message: `[transactions] Unknown payout_receiver_kind value: "${raw}" — treating as null`,
  });
  return null;
}

function mapRow(row: TransactionRow): BookingTransaction {
  return {
    id:                       row.id,
    bookingId:                row.booking_id,
    sourceTenantId:           row.source_tenant_id,
    sourceInquiryId:          row.source_inquiry_id,
    payerUserId:              row.payer_user_id,
    payerEmail:               row.payer_email,
    payoutReceiverId:         row.payout_receiver_id,
    payoutReceiverKind:       parsePayoutReceiverKind(row.payout_receiver_kind),
    payoutReceiverDisplayName: row.payout_receiver_display_name,
    grossAmountCents:         row.gross_amount_cents,
    platformFeeBasisPoints:   row.platform_fee_basis_points,
    platformFeeCents:         row.platform_fee_cents,
    netAmountCents:           row.net_amount_cents,
    currency:                 row.currency,
    provider:                 row.provider,
    providerReference:        row.provider_reference,
    refundOfTransactionId:    row.refund_of_transaction_id,
    status:                   row.status,
    requestedAt:              row.requested_at,
    paidAt:                   row.paid_at,
    payoutInitiatedAt:        row.payout_initiated_at,
    payoutCompletedAt:        row.payout_completed_at,
    refundedAt:               row.refunded_at,
    failedAt:                 row.failed_at,
    failureReason:            row.failure_reason,
    createdAt:                row.created_at,
    updatedAt:                row.updated_at,
  };
}
