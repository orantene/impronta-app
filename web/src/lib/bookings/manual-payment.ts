/**
 * Record a payment the talent received outside Tulala (cash, bank transfer,
 * card on their own terminal, other) as ONE row in the existing ledger,
 * `booking_transactions` with `provider = 'manual'`.
 *
 * Before this module, "Record payment" only flipped `agency_bookings.payment_status`.
 * Nothing landed in the ledger, so Money "Collected" and the Payments / Cash
 * split never saw the money: the booking said paid, the books said zero.
 *
 * Guards, all enforced here and pinned by manual-payment.test.ts:
 *   - Paid total never exceeds the booking total. Money already in (an online
 *     deposit, an earlier cash part) is summed from the ledger first, so a
 *     deposit plus a cash balance add up to the total, never more.
 *   - Idempotent: the caller passes a key per attempt; a repeat with the same
 *     key returns the first row (and finishes its walk to `paid` if a previous
 *     attempt died half way) instead of writing a second one.
 *   - Partial payments are allowed and leave the booking `partial`.
 *
 * Index note: `idx_booking_transactions_booking_active` allows one live
 * non-deposit row per inquiry-backed booking, and a PAID deposit row leaves the
 * slot. So a part payment that does not finish the booking is written with
 * `checkout_type = 'deposit'` (money in ahead of the balance) and the row that
 * reaches the total is `balance` (or `full` when it is the only one). That is
 * what lets "cash part, then the rest" be two real rows.
 *
 * Online deposit mint must ignore these manual "deposit" rows (see
 * transactions.ts create deposit dup check: `.neq("provider", "manual")`),
 * otherwise a cash part falsely blocks "The deposit is already collected".
 *
 * The walk is draft -> payment_requested -> paid, the only legal path under
 * `validate_booking_transaction_status_transition` (same as settle-at-door).
 * `markPaid` is NOT used: it fans out card payouts and order completion, and
 * money taken off platform has no payout leg (see payments/off-platform.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { totalClientRevenueToCents } from "@/lib/money/total-client-revenue";

export const MANUAL_PAYMENT_METHODS = ["cash", "transfer", "card", "other"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

/** Statuses that mean the money is in. Refunded / cancelled rows never count. */
export const MONEY_IN_STATUSES = ["paid", "payout_pending", "payout_sent"] as const;

/** What agency_bookings.payment_method records for each method. */
export function bookingPaymentMethodFor(method: ManualPaymentMethod): string {
  return method === "transfer" ? "transfer" : method;
}

export function isManualPaymentMethod(v: unknown): v is ManualPaymentMethod {
  return typeof v === "string" && (MANUAL_PAYMENT_METHODS as readonly string[]).includes(v);
}

export type LedgerMoneyRow = {
  id: string;
  grossCents: number;
  status: string;
  providerReference: string | null;
};

export type ManualPaymentBooking = {
  id: string;
  tenantId: string;
  status: string | null;
  totalCents: number;
  currency: string;
};

export type ManualPaymentStore = {
  loadBooking(bookingId: string): Promise<ManualPaymentBooking | null>;
  /** Every ledger row for the booking that is not cancelled / failed / refunded. */
  listLedger(bookingId: string): Promise<LedgerMoneyRow[]>;
  insertDraft(row: {
    bookingId: string;
    tenantId: string;
    amountCents: number;
    currency: string;
    reference: string;
    checkoutType: "deposit" | "balance" | "full";
    method: ManualPaymentMethod;
    actorUserId: string | null;
  }): Promise<{ ok: true; id: string } | { ok: false; conflict: boolean }>;
  advance(transactionId: string, status: "payment_requested" | "paid"): Promise<boolean>;
  patchBooking(
    bookingId: string,
    patch: { payment_status: "paid" | "partial"; payment_method: string },
  ): Promise<boolean>;
};

export type ManualPaymentFailReason =
  | "not_found"
  | "cancelled"
  | "no_total"
  | "invalid_amount"
  | "invalid_method"
  | "already_paid"
  | "over_total"
  | "open_charge"
  | "unavailable";

export type ManualPaymentResult =
  | {
      ok: true;
      transactionId: string;
      already: boolean;
      paidCents: number;
      totalCents: number;
      remainingCents: number;
      paymentStatus: "paid" | "partial";
    }
  | { ok: false; reason: ManualPaymentFailReason; remainingCents?: number };

export function sumMoneyIn(rows: readonly LedgerMoneyRow[]): number {
  return rows
    .filter((r) => (MONEY_IN_STATUSES as readonly string[]).includes(r.status))
    .reduce((n, r) => n + Math.max(0, Math.round(r.grossCents) || 0), 0);
}

async function walkToPaid(store: ManualPaymentStore, id: string, from: string): Promise<boolean> {
  if ((MONEY_IN_STATUSES as readonly string[]).includes(from)) return true;
  if (from === "draft" && !(await store.advance(id, "payment_requested"))) return false;
  if (from === "draft" || from === "payment_requested" || from === "pending") {
    return store.advance(id, "paid");
  }
  return false;
}

export async function recordManualPayment(
  store: ManualPaymentStore,
  input: {
    bookingId: string;
    amountCents: number;
    method: ManualPaymentMethod;
    idempotencyKey: string;
    actorUserId?: string | null;
  },
): Promise<ManualPaymentResult> {
  if (!isManualPaymentMethod(input.method)) return { ok: false, reason: "invalid_method" };
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key) return { ok: false, reason: "invalid_amount" };
  const reference = `manual:${key}`;

  const booking = await store.loadBooking(input.bookingId);
  if (!booking) return { ok: false, reason: "not_found" };
  const ledger = await store.listLedger(booking.id);
  const total = booking.totalCents;

  // Idempotent replay: the same attempt already wrote its row.
  const prior = ledger.find((r) => r.providerReference === reference);
  if (prior) {
    if (!(await walkToPaid(store, prior.id, prior.status))) {
      // A concurrent submit may have finished the walk between our read and
      // our update; trust the ledger, not the failed step.
      const now = (await store.listLedger(booking.id)).find((r) => r.id === prior.id);
      if (!now || !(MONEY_IN_STATUSES as readonly string[]).includes(now.status)) {
        return { ok: false, reason: "unavailable" };
      }
    }
    const settled = ledger.map((r) => (r.id === prior.id ? { ...r, status: "paid" } : r));
    const paid = sumMoneyIn(settled);
    const status = total > 0 && paid >= total ? "paid" : "partial";
    await store.patchBooking(booking.id, {
      payment_status: status,
      payment_method: bookingPaymentMethodFor(input.method),
    });
    return {
      ok: true,
      transactionId: prior.id,
      already: true,
      paidCents: paid,
      totalCents: total,
      remainingCents: Math.max(0, total - paid),
      paymentStatus: status,
    };
  }

  if (booking.status === "cancelled") return { ok: false, reason: "cancelled" };
  if (!(total > 0)) return { ok: false, reason: "no_total" };
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const paidBefore = sumMoneyIn(ledger);
  const remaining = Math.max(0, total - paidBefore);
  if (remaining === 0) return { ok: false, reason: "already_paid", remainingCents: 0 };
  if (input.amountCents > remaining) return { ok: false, reason: "over_total", remainingCents: remaining };

  const completes = input.amountCents === remaining;
  const checkoutType = !completes ? "deposit" : paidBefore > 0 ? "balance" : "full";

  const inserted = await store.insertDraft({
    bookingId: booking.id,
    tenantId: booking.tenantId,
    amountCents: input.amountCents,
    currency: booking.currency,
    reference,
    checkoutType,
    method: input.method,
    actorUserId: input.actorUserId ?? null,
  });
  if (!inserted.ok) {
    // A unique-index refusal is either a double submit racing this one (its
    // row is now on the ledger under our reference) or an open pay link
    // holding the booking's live slot.
    if (inserted.conflict) {
      const again = await store.listLedger(booking.id);
      const raced = again.find((r) => r.providerReference === reference);
      if (raced) return recordManualPayment(store, input);
      return { ok: false, reason: "open_charge", remainingCents: remaining };
    }
    return { ok: false, reason: "unavailable" };
  }

  if (!(await walkToPaid(store, inserted.id, "draft"))) return { ok: false, reason: "unavailable" };

  const paidAfter = paidBefore + input.amountCents;
  const status: "paid" | "partial" = paidAfter >= total ? "paid" : "partial";
  const patched = await store.patchBooking(booking.id, {
    payment_status: status,
    payment_method: bookingPaymentMethodFor(input.method),
  });
  if (!patched) return { ok: false, reason: "unavailable" };

  return {
    ok: true,
    transactionId: inserted.id,
    already: false,
    paidCents: paidAfter,
    totalCents: total,
    remainingCents: Math.max(0, total - paidAfter),
    paymentStatus: status,
  };
}

/** Supabase-backed store over the service-role client. Caller checks ownership. */
export function supabaseManualPaymentStore(admin: SupabaseClient): ManualPaymentStore {
  return {
    async loadBooking(bookingId) {
      const { data, error } = await admin
        .from("agency_bookings")
        .select("id, tenant_id, status, total_client_revenue, currency_code")
        .eq("id", bookingId)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as {
        id: string;
        tenant_id: string;
        status: string | null;
        total_client_revenue: unknown;
        currency_code: string | null;
      };
      return {
        id: row.id,
        tenantId: row.tenant_id,
        status: row.status,
        totalCents: totalClientRevenueToCents(row.total_client_revenue as string | number | null | undefined),
        currency: (row.currency_code || "MXN").toUpperCase(),
      };
    },
    async listLedger(bookingId) {
      const { data, error } = await admin
        .from("booking_transactions")
        .select("id, gross_amount_cents, status, provider_reference")
        .eq("booking_id", bookingId)
        .not("status", "in", '("cancelled","failed","refunded")');
      if (error) throw new Error(`ledger read failed: ${error.message}`);
      return ((data ?? []) as Array<{
        id: string;
        gross_amount_cents: number;
        status: string;
        provider_reference: string | null;
      }>).map((r) => ({
        id: r.id,
        grossCents: Number(r.gross_amount_cents) || 0,
        status: r.status,
        providerReference: r.provider_reference,
      }));
    },
    async insertDraft(row) {
      const { data, error } = await admin
        .from("booking_transactions")
        .insert({
          booking_id: row.bookingId,
          source_tenant_id: row.tenantId,
          gross_amount_cents: row.amountCents,
          // Money taken off platform carries no platform fee and no payout.
          platform_fee_basis_points: 0,
          platform_fee_cents: 0,
          net_amount_cents: row.amountCents,
          currency: row.currency,
          provider: "manual",
          provider_reference: row.reference,
          checkout_type: row.checkoutType,
          status: "draft",
          metadata: {
            paid_via: row.method,
            settled_at: "talent_record_payment",
            actor: row.actorUserId,
          },
        })
        .select("id")
        .single();
      if (error || !data) {
        return { ok: false, conflict: (error as { code?: string } | null)?.code === "23505" };
      }
      return { ok: true, id: (data as { id: string }).id };
    },
    async advance(transactionId, status) {
      const { error } = await admin
        .from("booking_transactions")
        .update({ status })
        .eq("id", transactionId);
      return !error;
    },
    async patchBooking(bookingId, patch) {
      const { error } = await admin.from("agency_bookings").update(patch).eq("id", bookingId);
      return !error;
    },
  };
}
