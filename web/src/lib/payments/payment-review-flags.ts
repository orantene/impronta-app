/**
 * payment-review-flags.ts — write a payment review flag onto its money row,
 * and let a person mark it resolved.
 *
 * TUL-1283 / TUL-1284 / TUL-1268 M2. See `payment-review-flags-model.ts` for
 * what a flag is. This is the one writer: read the row, append the flag to
 * `metadata` (only `metadata` and its version are written; no amount, no
 * status), raise a Sentry-visible alert, and ring the workspace Money bell
 * (`payment.needs_attention`, owners/admins only: the guest hears nothing new).
 *
 * Idempotent: a replay of the same (reason, PaymentIntent) writes nothing and
 * rings nothing.
 *
 * OPTIMISTIC CONCURRENCY (review fix 3). `metadata` is a shared bag, so a plain
 * read-modify-write lets two simultaneous events each add a flag and ring a
 * bell, or overwrite a stamp another writer just added. Every write is
 * conditional on the `updated_at` it read (`... where id = $1 and updated_at =
 * $read`); a lost race re-reads and re-applies, up to three attempts, and then
 * fails so the webhook retries rather than drop the flag.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { notifyPaymentNeedsAttention } from "@/lib/notifications/producers/payment-notify";
import {
  applyPaymentReviewFlag,
  resolvePaymentReviewFlag,
  type PaymentReviewFlagInput,
  type PaymentReviewReason,
} from "@/lib/payments/payment-review-flags-model";

type Admin = Pick<SupabaseClient, "from">;

export type FlagPaymentDeps = {
  notify: (params: Parameters<typeof notifyPaymentNeedsAttention>[0]) => void;
};

export type FlagPaymentResult = { ok: true; created: boolean } | { ok: false; error: string };

/** Attempts at the conditional write before giving up (and letting the caller retry). */
const MAX_ATTEMPTS = 3;

type MoneyRowRead = {
  metadata: unknown;
  updated_at: string | null;
  source_tenant_id: string | null;
  booking_id: string | null;
  source_inquiry_id: string | null;
};

async function readRow(
  admin: Admin,
  transactionId: string,
  tenantId?: string,
): Promise<{ ok: true; row: MoneyRowRead | null } | { ok: false; error: string }> {
  let q = admin
    .from("booking_transactions")
    .select("metadata, updated_at, source_tenant_id, booking_id, source_inquiry_id")
    .eq("id", transactionId);
  if (tenantId) q = q.eq("source_tenant_id", tenantId);
  const { data, error } = await q.maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, row: null };
  const raw = data as Record<string, unknown>;
  return {
    ok: true,
    row: {
      metadata: raw.metadata,
      updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
      source_tenant_id: typeof raw.source_tenant_id === "string" ? raw.source_tenant_id : null,
      booking_id: typeof raw.booking_id === "string" ? raw.booking_id : null,
      source_inquiry_id: typeof raw.source_inquiry_id === "string" ? raw.source_inquiry_id : null,
    },
  };
}

/** `update ... where id = $1 and updated_at = $read`. `won: false` means another writer got there first. */
async function writeIfUnchanged(
  admin: Admin,
  transactionId: string,
  readUpdatedAt: string | null,
  metadata: Record<string, unknown>,
  nowIso: string,
): Promise<{ ok: true; won: boolean } | { ok: false; error: string }> {
  let q = admin
    .from("booking_transactions")
    .update({ metadata, updated_at: nowIso })
    .eq("id", transactionId);
  q = readUpdatedAt === null ? q.is("updated_at", null) : q.eq("updated_at", readUpdatedAt);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, won: Array.isArray(data) && data.length > 0 };
}

export async function flagPaymentForReview(
  admin: Admin,
  input: { transactionId: string; flag: PaymentReviewFlagInput; nowIso?: string },
  deps: FlagPaymentDeps = { notify: notifyPaymentNeedsAttention },
): Promise<FlagPaymentResult> {
  const flaggedAt = input.nowIso ?? new Date().toISOString();
  let row: MoneyRowRead | null = null;
  let written = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !written; attempt += 1) {
    const read = await readRow(admin, input.transactionId);
    if (!read.ok) return { ok: false, error: `payment flag read failed for ${input.transactionId}: ${read.error}` };
    if (!read.row) return { ok: false, error: `payment flag: transaction ${input.transactionId} not found` };
    row = read.row;
    const applied = applyPaymentReviewFlag(row.metadata, input.flag, flaggedAt);
    // Already there: a replay, or a simultaneous event that won the race and rang the bell.
    if (!applied.created) return { ok: true, created: false };
    const write = await writeIfUnchanged(admin, input.transactionId, row.updated_at, applied.metadata, new Date().toISOString());
    if (!write.ok) return { ok: false, error: `payment flag write failed for ${input.transactionId}: ${write.error}` };
    written = write.won;
  }
  if (!written || !row) {
    return { ok: false, error: `payment flag for ${input.transactionId}: lost the write race ${MAX_ATTEMPTS} times` };
  }

  const f = input.flag;
  logServerError(
    `stripe-webhook.payment_flag.${f.reason}`,
    new Error(
      `ALERT ${f.reason} on txn ${input.transactionId}: pi ${f.paymentIntentId ?? "?"}` +
        (f.otherPaymentIntentId ? ` (row already paid by ${f.otherPaymentIntentId})` : "") +
        `, charged ${f.chargedAmountCents ?? "?"} ${f.chargedCurrency ?? "?"}` +
        `, row ${f.expectedAmountCents ?? "?"} ${f.expectedCurrency ?? "?"} status ${f.rowStatus ?? "?"}` +
        ` (event ${f.stripeEventId}). Flagged for a person; no money moved.`,
    ),
  );

  if (row.source_tenant_id) {
    deps.notify({
      tenantId: row.source_tenant_id,
      transactionId: input.transactionId,
      bookingId: row.booking_id,
      inquiryId: row.source_inquiry_id,
      reason: f.reason,
      // The catalog entry words each reason in the bell; no free-text note.
      note: null,
      amountCents: f.chargedAmountCents,
      currency: f.chargedCurrency,
    });
  }
  return { ok: true, created: true };
}

export type ResolvePaymentFlagResult =
  | { ok: true; resolved: boolean }
  | { ok: false; error: "not_found" | "conflict" | "failed" };

/**
 * Review fix 4: a person marks one flag resolved after refunding or
 * reconciling the charge in Stripe. Scoped to the workspace (`source_tenant_id`)
 * as well as the id; writes only `metadata`; moves no money. Same conditional
 * write as the flag itself.
 */
export async function resolvePaymentFlag(
  admin: Admin,
  input: {
    tenantId: string;
    transactionId: string;
    reason: PaymentReviewReason;
    paymentIntentId: string | null;
    actorUserId: string;
    nowIso?: string;
  },
): Promise<ResolvePaymentFlagResult> {
  const at = input.nowIso ?? new Date().toISOString();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const read = await readRow(admin, input.transactionId, input.tenantId);
    if (!read.ok) {
      logServerError("payments.paymentFlag.resolve.read", read.error);
      return { ok: false, error: "failed" };
    }
    if (!read.row) return { ok: false, error: "not_found" };
    const next = resolvePaymentReviewFlag(
      read.row.metadata,
      { reason: input.reason, paymentIntentId: input.paymentIntentId },
      { at, userId: input.actorUserId },
    );
    if (!next.resolved) return { ok: true, resolved: false };
    const write = await writeIfUnchanged(admin, input.transactionId, read.row.updated_at, next.metadata, at);
    if (!write.ok) {
      logServerError("payments.paymentFlag.resolve.write", write.error);
      return { ok: false, error: "failed" };
    }
    if (write.won) return { ok: true, resolved: true };
  }
  return { ok: false, error: "conflict" };
}
