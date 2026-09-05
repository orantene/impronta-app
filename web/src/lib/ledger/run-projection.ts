/**
 * lib/ledger/run-projection.ts
 *
 * Find money events that are not yet in the ledger, and project them.
 *
 * "Not yet in the ledger" is COMPUTED, never remembered: each source row's
 * deterministic group id is looked up, and anything missing is projected. There
 * is no cursor to corrupt and no watermark to fall behind. A failed run changes
 * nothing and the next run does exactly the same work.
 *
 * That also makes this safe to run on a schedule AND by hand as a backfill:
 * they are the same operation.
 *
 * Sources, in the order they are projected:
 *   1. paid booking transactions  → cash in, liabilities out, commission earned
 *   2. balance transactions       → the processing fee Stripe charged
 *   3. paid invoices              → subscription revenue (and tax, when there is any)
 *   4. payouts                    → balance → in transit → bank
 *   5. settled transfers          → the payable is discharged, balance goes down
 *
 * Refunds are deliberately NOT projected from `booking_transactions` refund
 * rows yet: a refund's ledger treatment depends on whether the payout was
 * reversed, and that reversal is recorded in `booking_payouts` rather than on
 * the transaction. Projecting the cash movement without the reversal would
 * overstate what is still owed to the talent. Left out rather than approximated.
 *
 * Server-only.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  projectBookingPayment,
  projectProcessingFee,
  projectSubscriptionInvoice,
  projectPayout,
  projectTransfer,
  type CommissionLane,
} from "./project";
import { writeLedgerGroup } from "./write";

/** Bound one run so a first backfill cannot page forever. */
const BATCH = 200;

export type ProjectionRunResult = {
  ok: boolean;
  bookingPayments: { projected: number; skipped: number; refused: number };
  processingFees: { projected: number; skipped: number; refused: number };
  invoices: { projected: number; skipped: number; refused: number };
  payouts: { projected: number; skipped: number; refused: number };
  transfers: { projected: number; skipped: number; refused: number };
  /** Reasons a source was refused, so a stuck row is diagnosable without a
   *  database session. Capped — the point is a sample, not a dump. */
  refusals: string[];
  error?: string;
};

function emptyCounts() {
  return { projected: 0, skipped: 0, refused: 0 };
}

export async function runLedgerProjection(): Promise<ProjectionRunResult> {
  const result: ProjectionRunResult = {
    ok: true,
    bookingPayments: emptyCounts(),
    processingFees: emptyCounts(),
    invoices: emptyCounts(),
    payouts: emptyCounts(),
    transfers: emptyCounts(),
    refusals: [],
  };

  const sb = createServiceRoleClient();
  if (!sb) return { ...result, ok: false, error: "Database not available." };

  const note = (msg: string) => {
    if (result.refusals.length < 20) result.refusals.push(msg);
  };

  try {
    // ── 1. Paid booking transactions ────────────────────────────────────────
    const { data: txns } = await sb
      .from("booking_transactions")
      .select("id, booking_id, source_tenant_id, gross_amount_cents, currency, paid_at, provider_metadata")
      .in("status", ["paid", "payout_pending", "payout_sent"])
      .is("refund_of_transaction_id", null)
      .limit(BATCH);

    for (const raw of txns ?? []) {
      const t = raw as Record<string, unknown>;
      const txnId = String(t.id);
      const bookingId = (t.booking_id as string | null) ?? null;

      // The commission snapshot is what says whose money this is.
      const { data: snaps } = await sb
        .from("booking_commission_snapshot")
        .select("participant_id, talent_profile_id, owning_party_type, owning_party_id, talent_net_cents, workspace_fee_cents, platform_fee_cents, gross_charged_cents")
        .eq("booking_id", bookingId ?? "");

      const lanes: CommissionLane[] = (snaps ?? []).map((s) => {
        const r = s as Record<string, unknown>;
        return {
          participantId: String(r.participant_id),
          talentProfileId: (r.talent_profile_id as string | null) ?? null,
          owningPartyType: String(r.owning_party_type ?? ""),
          owningPartyId: (r.owning_party_id as string | null) ?? null,
          talentNetCents: Number(r.talent_net_cents ?? 0),
          workspaceFeeCents: Number(r.workspace_fee_cents ?? 0),
          platformFeeCents: Number(r.platform_fee_cents ?? 0),
          grossChargedCents: Number(r.gross_charged_cents ?? 0),
        };
      });

      const meta = t.provider_metadata;
      const providerObjectId =
        meta && typeof meta === "object" && !Array.isArray(meta)
          ? ((meta as Record<string, unknown>).payment_intent_id as string | undefined) ?? null
          : null;

      const projected = projectBookingPayment({
        transactionId: txnId,
        bookingId,
        tenantId: (t.source_tenant_id as string | null) ?? null,
        currency: String(t.currency ?? "USD"),
        grossChargedCents: Number(t.gross_amount_cents ?? 0),
        lanes,
        providerObjectId,
        occurredAt: String(t.paid_at ?? new Date().toISOString()),
      });

      if (!projected.ok) {
        result.bookingPayments.refused += 1;
        note(`booking_payment ${txnId}: ${projected.error}`);
        continue;
      }
      const w = await writeLedgerGroup(projected.legs);
      if (!w.ok) {
        result.bookingPayments.refused += 1;
        note(`booking_payment ${txnId}: ${w.error}`);
      } else if (w.skipped) {
        result.bookingPayments.skipped += 1;
      } else {
        result.bookingPayments.projected += 1;
      }
    }

    // ── 2. Processing fees ──────────────────────────────────────────────────
    const { data: bts } = await sb
      .from("provider_balance_transactions")
      .select("stripe_balance_txn_id, fee_cents, currency, tenant_id, booking_transaction_id, stripe_created_at")
      .gt("fee_cents", 0)
      .limit(BATCH);

    for (const raw of bts ?? []) {
      const b = raw as Record<string, unknown>;
      const projected = projectProcessingFee({
        balanceTransactionId: String(b.stripe_balance_txn_id),
        feeCents: Number(b.fee_cents ?? 0),
        currency: String(b.currency ?? "USD"),
        tenantId: (b.tenant_id as string | null) ?? null,
        bookingTransactionId: (b.booking_transaction_id as string | null) ?? null,
        occurredAt: String(b.stripe_created_at),
      });
      if (!projected.ok) {
        result.processingFees.refused += 1;
        note(`processing_fee ${String(b.stripe_balance_txn_id)}: ${projected.error}`);
        continue;
      }
      if (projected.legs.length === 0) continue;
      const w = await writeLedgerGroup(projected.legs);
      if (!w.ok) {
        result.processingFees.refused += 1;
        note(`processing_fee ${String(b.stripe_balance_txn_id)}: ${w.error}`);
      } else if (w.skipped) {
        result.processingFees.skipped += 1;
      } else {
        result.processingFees.projected += 1;
      }
    }

    // ── 3. Paid invoices ────────────────────────────────────────────────────
    const { data: invs } = await sb
      .from("provider_invoices")
      .select("stripe_invoice_id, amount_paid_cents, tax_cents, currency, tenant_id, talent_profile_id, paid_at")
      .eq("status", "paid")
      .gt("amount_paid_cents", 0)
      .limit(BATCH);

    for (const raw of invs ?? []) {
      const i = raw as Record<string, unknown>;
      const projected = projectSubscriptionInvoice({
        invoiceId: String(i.stripe_invoice_id),
        amountPaidCents: Number(i.amount_paid_cents ?? 0),
        taxCents: Number(i.tax_cents ?? 0),
        currency: String(i.currency ?? "USD"),
        tenantId: (i.tenant_id as string | null) ?? null,
        talentProfileId: (i.talent_profile_id as string | null) ?? null,
        occurredAt: String(i.paid_at ?? new Date().toISOString()),
      });
      if (!projected.ok) {
        result.invoices.refused += 1;
        note(`invoice ${String(i.stripe_invoice_id)}: ${projected.error}`);
        continue;
      }
      const w = await writeLedgerGroup(projected.legs);
      if (!w.ok) {
        result.invoices.refused += 1;
        note(`invoice ${String(i.stripe_invoice_id)}: ${w.error}`);
      } else if (w.skipped) {
        result.invoices.skipped += 1;
      } else {
        result.invoices.projected += 1;
      }
    }

    // ── 4. Payouts ──────────────────────────────────────────────────────────
    // Only PLATFORM payouts (stripe_account_id is null). A connected account's
    // payout moves money on THEIR ledger, not ours — ours was already reduced
    // when the transfer left, and booking that as a second movement would
    // double-count the same money leaving.
    const { data: pos } = await sb
      .from("provider_payouts")
      .select("stripe_payout_id, amount_cents, currency, status, arrival_date, updated_at, stripe_account_id")
      .is("stripe_account_id", null)
      .in("status", ["in_transit", "paid"])
      .limit(BATCH);

    for (const raw of pos ?? []) {
      const p = raw as Record<string, unknown>;
      const payoutId = String(p.stripe_payout_id);
      const amount = Number(p.amount_cents ?? 0);
      const currency = String(p.currency ?? "USD");
      const status = String(p.status);

      // Both phases are projected for a paid payout: it necessarily passed
      // through transit, and the arrival group cannot balance without it.
      const phases: Array<"initiated" | "arrived"> =
        status === "paid" ? ["initiated", "arrived"] : ["initiated"];

      for (const phase of phases) {
        const projected = projectPayout({
          payoutId,
          amountCents: amount,
          currency,
          phase,
          occurredAt: String(p.arrival_date ?? p.updated_at ?? new Date().toISOString()),
        });
        if (!projected.ok) {
          result.payouts.refused += 1;
          note(`payout ${payoutId} (${phase}): ${projected.error}`);
          continue;
        }
        const w = await writeLedgerGroup(projected.legs);
        if (!w.ok) {
          result.payouts.refused += 1;
          note(`payout ${payoutId} (${phase}): ${w.error}`);
        } else if (w.skipped) {
          result.payouts.skipped += 1;
        } else {
          result.payouts.projected += 1;
        }
      }
    }

    // ── 5. Settled Connect transfers ────────────────────────────────────────
    // The leg that discharges what `projectBookingPayment` accrued. ONLY
    // 'transferred' legs: a 'held' leg has moved no money, and 'failed' /
    // 'reversed' either never left or came back, so projecting any of them
    // would write off a liability we still owe.
    const { data: legs } = await sb
      .from("booking_payouts")
      .select("stripe_transfer_id, party, amount_cents, currency, talent_profile_id, tenant_id, transferred_at, updated_at")
      .eq("status", "transferred")
      .not("stripe_transfer_id", "is", null)
      .limit(BATCH);

    for (const raw of legs ?? []) {
      const l = raw as Record<string, unknown>;
      const transferId = String(l.stripe_transfer_id ?? "");
      const party = String(l.party ?? "");
      if (party !== "talent" && party !== "workspace") {
        result.transfers.refused += 1;
        note(`transfer ${transferId}: unknown party '${party}'`);
        continue;
      }
      const projected = projectTransfer({
        transferId,
        party,
        amountCents: Number(l.amount_cents ?? 0),
        currency: String(l.currency ?? "USD"),
        occurredAt: String(l.transferred_at ?? l.updated_at ?? new Date().toISOString()),
        talentProfileId: (l.talent_profile_id as string | null) ?? null,
        tenantId: (l.tenant_id as string | null) ?? null,
      });
      if (!projected.ok) {
        result.transfers.refused += 1;
        note(`transfer ${transferId}: ${projected.error}`);
        continue;
      }
      const w = await writeLedgerGroup(projected.legs);
      if (!w.ok) {
        result.transfers.refused += 1;
        note(`transfer ${transferId}: ${w.error}`);
      } else if (w.skipped) {
        result.transfers.skipped += 1;
      } else {
        result.transfers.projected += 1;
      }
    }

    return result;
  } catch (err) {
    logServerError("ledger.runProjection", err);
    return {
      ...result,
      ok: false,
      error: err instanceof Error ? err.message : "projection failed",
    };
  }
}
