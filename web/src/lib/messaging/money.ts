import "server-only";


import { resolveCancellationWindow } from "@/lib/bookings/cancellation-window";
import { planRefund, type PaidTransaction, type RefundableLine } from "@/lib/orders/refund-plan";
import type { PromoScope } from "@/lib/orders/promo-eligibility";
import type { RecordKind } from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * S6 (D-MSG-40): the record kinds a thread can actually cancel/preview money
 * for. `agency_bookings` / `cancel_booking_set` (the RPC named in the brief)
 * is the coordination-hub's OWN cancel path for its own booking table; it is
 * unreachable from any `RecordKind` a Messages v5 thread carries — every
 * kind that resolves to a schedulable record resolves through `admissions`
 * (D-MSG-9: `RECORD_KINDS_ON_ADMISSIONS` in thread-token.ts), and `order`
 * resolves straight to `orders`/`order_lines`. So this lane cancels through
 * the SAME writer `orders`/`order_lines`/`admissions` already have —
 * `refundOrderLines` (`lib/orders/refund-execute-lines.ts`), which already
 * voids the admission and releases its capacity allocation atomically — not
 * through `cancel_booking_set`. `project` and `offer` have no order/line
 * backing at all (mirrors D-MSG-5's same 5-of-7 gap on the merge guard) and
 * are refused `invalid`.
 */
export const MONEY_RECORD_KINDS = ["order", "appointment", "reservation", "class_enrolment", "tickets"] as const;
export type MoneyRecordKind = (typeof MONEY_RECORD_KINDS)[number];

export function isMoneyRecordKind(kind: RecordKind): kind is MoneyRecordKind {
  return (MONEY_RECORD_KINDS as readonly string[]).includes(kind);
}

type OrderRow = { id: string; tenant_id: string; inquiry_id: string | null; status: string; discount_cents: number; tip_cents: number };
type LineRow = { id: string; order_id: string; total_cents: number; refunded_cents: number; variant_id: string | null; offering_id: string | null };
type AdmissionRow = { id: string; order_line_id: string | null; starts_at: string | null; status: string };

/** Resolve the order + every one of its lines the tenant owns. */
async function loadOrderAndLines(
  admin: Admin,
  tenantId: string,
  orderId: string,
): Promise<{ order: OrderRow; lines: LineRow[] } | null> {
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id, inquiry_id, status, discount_cents, tip_cents")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return null;
  const row = order as OrderRow | null;
  if (!row || row.tenant_id !== tenantId) return null;
  const { data: lines, error: linesErr } = await admin
    .from("order_lines")
    .select("id, order_id, total_cents, refunded_cents, variant_id, offering_id")
    .eq("order_id", orderId);
  if (linesErr) return null;
  return { order: row, lines: ((lines ?? []) as LineRow[]) };
}

/** Resolve the single admission a non-order money record kind points at. */
async function loadAdmission(admin: Admin, tenantId: string, admissionId: string): Promise<AdmissionRow | null> {
  const { data, error } = await admin
    .from("admissions")
    .select("id, order_line_id, starts_at, status, tenant_id")
    .eq("id", admissionId)
    .maybeSingle();
  if (error) return null;
  const row = data as (AdmissionRow & { tenant_id: string }) | null;
  if (!row || row.tenant_id !== tenantId) return null;
  return row;
}

/** Paid legs for an order. `null` means the ledger could not be read — never
 * treat that as "nothing paid" (D-MSG-414). */
async function loadPaidTransactions(admin: Admin, orderId: string): Promise<PaidTransaction[] | null> {
  const { data: txnRows, error: txnErr } = await admin
    .from("booking_transactions")
    .select("id, gross_amount_cents")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .order("created_at", { ascending: true });
  if (txnErr) return null;
  const paid = ((txnRows ?? []) as { id: string; gross_amount_cents: number }[]);
  if (paid.length === 0) return [];
  const { data: refundRows, error: refundErr } = await admin
    .from("booking_transactions")
    .select("refund_of_transaction_id, gross_amount_cents")
    .in("refund_of_transaction_id", paid.map((t) => t.id))
    .eq("status", "refunded");
  if (refundErr) return null;
  const refunded = new Map<string, number>();
  for (const r of (refundRows ?? []) as { refund_of_transaction_id: string; gross_amount_cents: number }[]) {
    refunded.set(r.refund_of_transaction_id, (refunded.get(r.refund_of_transaction_id) ?? 0) + Number(r.gross_amount_cents ?? 0));
  }
  return paid.map((t) => ({ id: t.id, grossAmountCents: Number(t.gross_amount_cents), refundedCents: refunded.get(t.id) ?? 0 }));
}

function toRefundableLines(lines: readonly LineRow[]): RefundableLine[] {
  return lines.map((l) => ({ id: l.id, totalCents: Number(l.total_cents), refundedCents: Number(l.refunded_cents ?? 0), variantId: l.variant_id, eventId: null }));
}

async function cancellationWindowForLines(
  admin: Admin,
  tenantId: string,
  lines: readonly LineRow[],
): Promise<{ cancellationHours: number | null; startsAt: string | null }> {
  // Best-effort, single-offering read: the earliest scheduled admission on
  // these lines names the deadline, and its line's own offering names the
  // policy. An order that mixes several offerings with different windows
  // gets the EARLIEST-STARTING one's rule, which is the conservative choice
  // (it closes soonest) — documented, not silently assumed exact (D-MSG-40).
  const lineIds = lines.map((l) => l.id);
  if (lineIds.length === 0) return { cancellationHours: null, startsAt: null };
  // No `.not("starts_at", "is", null)` here on purpose: filtered client-side
  // instead, so this reads correctly against the in-memory PostgREST test
  // fixture too (`fake-admin.ts` models `eq`/`in`/`order`/`limit`, not `not`).
  const { data: admRows, error: admErr } = await admin
    .from("admissions")
    .select("order_line_id, starts_at")
    .in("order_line_id", lineIds)
    .order("starts_at", { ascending: true });
  if (admErr) return { cancellationHours: null, startsAt: null };
  const first = ((admRows ?? []) as { order_line_id: string | null; starts_at: string | null }[]).find((r) => r.starts_at);
  if (!first?.starts_at) return { cancellationHours: null, startsAt: null };
  const line = lines.find((l) => l.id === first.order_line_id);
  if (!line?.offering_id) return { cancellationHours: null, startsAt: first.starts_at };
  const { data: offRow, error: offErr } = await admin
    .from("talent_offerings")
    .select("cancellation_hours")
    .eq("id", line.offering_id)
    .maybeSingle();
  if (offErr) return { cancellationHours: null, startsAt: first.starts_at };
  const hours = (offRow as { cancellation_hours: number | null } | null)?.cancellation_hours ?? null;
  return { cancellationHours: hours, startsAt: first.starts_at };
}

export type CancelPreview =
  | {
      ok: true;
      /** Cancellation-window verdict (D-MSG-40, `resolveCancellationWindow`
       * reused verbatim, not reimplemented). Advisory only — mirrors the
       * existing `cancelBookingAction` precedent that staff keep override
       * authority and this never blocks. */
      window: { enforceable: boolean; insideWindow: boolean; deadlineIso: string | null };
      /** No fee figure exists anywhere in the codebase for this window
       * (grepped `resolveCancellationWindow`'s only caller — it stamps the
       * verdict on an audit payload and never derives cents from it). Always
       * null; a future lane that adds a real fee schedule fills this in. */
      feeCents: null;
      refundableCents: number;
      currency: string;
      /** Deposit/paid money is refundable unless the window is enforced AND
       * we are inside it — same read as `insideWindow`, named for the
       * caller. */
      depositRefundable: boolean;
      /** Admission ids that will be voided and have capacity released. */
      freesAdmissionIds: string[];
    }
  | { ok: false; reason: "not_found" | "invalid" };

export async function messagingPreviewCancelRead(
  admin: Admin,
  input: { tenantId: string; recordKind: RecordKind; recordId: string },
): Promise<CancelPreview> {
  if (!isMoneyRecordKind(input.recordKind)) return { ok: false, reason: "invalid" };

  let lines: LineRow[];
  let orderId: string;
  let currency = "USD";
  if (input.recordKind === "order") {
    const loaded = await loadOrderAndLines(admin, input.tenantId, input.recordId);
    if (!loaded) return { ok: false, reason: "not_found" };
    lines = loaded.lines;
    orderId = loaded.order.id;
  } else {
    const admission = await loadAdmission(admin, input.tenantId, input.recordId);
    if (!admission || !admission.order_line_id) return { ok: false, reason: "not_found" };
    const { data: lineRow, error: lineErr } = await admin
      .from("order_lines")
      .select("id, order_id, total_cents, refunded_cents, variant_id, offering_id")
      .eq("id", admission.order_line_id)
      .maybeSingle();
    if (lineErr) return { ok: false, reason: "not_found" };
    const line = lineRow as LineRow | null;
    if (!line) return { ok: false, reason: "not_found" };
    lines = [line];
    orderId = line.order_id;
  }
  const { data: orderCurrency, error: curErr } = await admin.from("orders").select("currency, discount_cents, tip_cents").eq("id", orderId).maybeSingle();
  if (curErr) return { ok: false, reason: "not_found" };
  const oc = orderCurrency as { currency: string; discount_cents: number; tip_cents: number } | null;
  currency = oc?.currency ?? "USD";

  const refundable = toRefundableLines(lines);
  const transactions = await loadPaidTransactions(admin, orderId);
  if (transactions == null) return { ok: false, reason: "not_found" };
  const scope: PromoScope = {};
  const plan = planRefund({
    lines: refundable,
    lineIds: refundable.map((l) => l.id),
    scope,
    discountCents: Number(oc?.discount_cents ?? 0),
    transactions,
    tipCents: input.recordKind === "order" ? Number(oc?.tip_cents ?? 0) : 0,
  });
  const refundableCents = plan.ok ? plan.totalCents : 0;

  const { cancellationHours, startsAt } = await cancellationWindowForLines(admin, input.tenantId, lines);
  const verdict = resolveCancellationWindow({ cancellationHours, startsAt, eventDate: null, nowMs: Date.now() });

  const { data: admRows, error: admListErr } = await admin
    .from("admissions")
    .select("id")
    .in("order_line_id", lines.map((l) => l.id))
    .eq("status", "valid");
  if (admListErr) return { ok: false, reason: "not_found" };
  const freesAdmissionIds = ((admRows ?? []) as { id: string }[]).map((r) => r.id);

  return {
    ok: true,
    window: { enforceable: verdict.enforceable, insideWindow: verdict.insideWindow, deadlineIso: verdict.deadlineIso },
    feeCents: null,
    refundableCents,
    currency,
    depositRefundable: !(verdict.enforceable && verdict.insideWindow),
    freesAdmissionIds,
  };
}

/** Resolve the line ids a cancel/refund of this record kind touches. */
export async function resolveMoneyRecordLines(
  admin: Admin,
  input: { tenantId: string; recordKind: RecordKind; recordId: string },
): Promise<{ ok: true; orderId: string; lineIds: string[] } | { ok: false; reason: "not_found" | "invalid" }> {
  if (!isMoneyRecordKind(input.recordKind)) return { ok: false, reason: "invalid" };
  if (input.recordKind === "order") {
    const loaded = await loadOrderAndLines(admin, input.tenantId, input.recordId);
    if (!loaded) return { ok: false, reason: "not_found" };
    return { ok: true, orderId: loaded.order.id, lineIds: loaded.lines.map((l) => l.id) };
  }
  const admission = await loadAdmission(admin, input.tenantId, input.recordId);
  if (!admission || !admission.order_line_id) return { ok: false, reason: "not_found" };
  const { data: lineRow, error: lineErr } = await admin.from("order_lines").select("id, order_id").eq("id", admission.order_line_id).maybeSingle();
  if (lineErr) return { ok: false, reason: "not_found" };
  const line = lineRow as { id: string; order_id: string } | null;
  if (!line) return { ok: false, reason: "not_found" };
  return { ok: true, orderId: line.order_id, lineIds: [line.id] };
}

/**
 * S6: everything below keeps `messaging-money-actions.ts` (under
 * `src/lib/server-actions/`) free of raw `.from("table")` calls — that
 * directory's ESLint rule (`ratchet/no-untenanted-from`) bans them outright
 * so the tenant filter can't be forgotten. `orders` / `order_lines` /
 * `admissions` route through `tenantScopedQuery` below (all three carry a
 * real `tenant_id` column); `booking_transactions` does NOT (it carries
 * `source_tenant_id` — confirmed in
 * `supabase/migrations/20260901203000_booking_transactions_refund_record_alignment.sql`),
 * so `tenantScopedQuery` (which hardcodes the `tenant_id` column name)
 * cannot be used for it — filtered by hand instead (D-MSG-40).
 */
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { executeBookingRefund, type RefundReason } from "@/lib/payments/refund-execute";
import type { RefundLinesResult } from "@/lib/orders/refund-execute-lines";

export async function isCancelTargetAlready(
  admin: Admin,
  input: { tenantId: string; recordKind: RecordKind; recordId: string; orderId: string },
): Promise<boolean> {
  if (input.recordKind === "order") {
    const { data, error } = await tenantScopedQuery(admin as never, "orders", input.tenantId)
      .select("status")
      .eq("id", input.orderId)
      .maybeSingle();
    if (error) return false;
    const status = (data as { status: string } | null)?.status ?? null;
    return status === "cancelled" || status === "refunded";
  }
  const admission = await loadAdmission(admin, input.tenantId, input.recordId);
  return !admission || admission.status !== "valid";
}

export async function stampOrderCancelStatus(
  admin: Admin,
  input: { tenantId: string; orderId: string; status: "cancelled" | "refunded" | "partially_refunded" },
): Promise<boolean> {
  const { error } = await tenantScopedQuery(admin as never, "orders", input.tenantId)
    .update({ status: input.status })
    .eq("id", input.orderId);
  return !error;
}

export async function releaseOrderLinesCapacity(admin: Admin, tenantId: string, lineIds: readonly string[]): Promise<void> {
  if (lineIds.length === 0) return;
  const { data: lines, error: linesErr } = await tenantScopedQuery(admin as never, "order_lines", tenantId)
    .select("allocation_ids")
    .in("id", lineIds);
  if (linesErr) return;
  const allocationIds = ((lines ?? []) as { allocation_ids: string[] | null }[]).flatMap((l) => l.allocation_ids ?? []);
  if (allocationIds.length === 0) return;
  const rpcAdmin = admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  await rpcAdmin.rpc("release_capacity", { p_allocation_ids: allocationIds });
}

export async function cancelRecordReminder(admin: Admin, tenantId: string, recordKind: RecordKind, recordId: string): Promise<void> {
  await tenantScopedQuery(admin as never, "scheduled_messages", tenantId)
    .update({ state: "cancelled" })
    .eq("record_kind", recordKind)
    .eq("record_id", recordId)
    .eq("state", "scheduled");
}

/** Oldest-paid-transaction-first split of an arbitrary cents amount, mirroring
 * `planRefund`'s own step order but computed directly since the caller
 * already has the total rather than deriving it from lines (D-MSG-42). */
export async function refundArbitraryAmount(
  admin: Admin,
  orderId: string,
  amountCents: number,
  reason: RefundReason,
  actorUserId: string,
  note: string,
): Promise<{ ok: true; movedCents: number } | { ok: false }> {
  const { data: txnRows, error: txnErr } = await admin
    .from("booking_transactions")
    .select("id, gross_amount_cents, order_id")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .order("created_at", { ascending: true });
  if (txnErr) return { ok: false };
  const paid = (txnRows ?? []) as { id: string; gross_amount_cents: number }[];
  let left = amountCents;
  let moved = 0;
  for (const txn of paid) {
    if (left <= 0) break;
    const take = Math.min(Number(txn.gross_amount_cents), left);
    if (take <= 0) continue;
    const res = await executeBookingRefund({ transactionId: txn.id, amountCents: take, reason, actorUserId, note });
    if (!res.ok) {
      if (moved > 0) return { ok: true, movedCents: moved }; // partial: report what landed, never retry
      return { ok: false };
    }
    moved += res.amountCents;
    left -= take;
  }
  return { ok: true, movedCents: moved };
}

export type OwnedTransaction = { id: string; orderId: string };

/** Resolves a `booking_transactions` row to its order, verifying BOTH the
 * order's own tenant (`orders.tenant_id`, real column) and — since
 * `booking_transactions` carries no `tenant_id` itself — that the row's
 * `source_tenant_id` agrees, before a caller trusts it as this tenant's. */
export async function loadOwnedTransaction(
  admin: Admin,
  tenantId: string,
  transactionId: string,
): Promise<OwnedTransaction | null> {
  const { data: txnRow, error: txnErr } = await admin
    .from("booking_transactions")
    .select("id, order_id, source_tenant_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (txnErr) return null;
  const txn = txnRow as { id: string; order_id: string | null; source_tenant_id: string | null } | null;
  if (!txn || !txn.order_id || txn.source_tenant_id !== tenantId) return null;
  const { data: orderRow, error: orderErr } = await tenantScopedQuery(admin as never, "orders", tenantId)
    .select("id, inquiry_id")
    .eq("id", txn.order_id)
    .maybeSingle();
  if (orderErr) return null;
  const order = orderRow as { id: string; inquiry_id: string | null } | null;
  if (!order) return null;
  return { id: txn.id, orderId: order.id };
}

/** Whether `orderId` is linked to `inquiryId`, either by the legacy direct
 * FK (`orders.inquiry_id`) or by a live `conversation_records` link (S3+). */
export async function orderLinkedToInquiry(admin: Admin, tenantId: string, orderId: string, inquiryId: string): Promise<boolean> {
  const { data: orderRow, error: orderErr } = await tenantScopedQuery(admin as never, "orders", tenantId)
    .select("inquiry_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return false;
  if ((orderRow as { inquiry_id: string | null } | null)?.inquiry_id === inquiryId) return true;
  const { data: linkRows, error: linkErr } = await admin
    .from("conversation_records")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("record_kind", "order")
    .eq("record_id", orderId)
    .is("unlinked_at", null);
  if (linkErr) return false;
  return ((linkRows ?? []) as { id: string }[]).length > 0;
}

/**
 * L7 (D-MSG-14x): the latest PAID transaction with money still owed on it,
 * for a "refund without cancelling" flow — `executeBookingRefund` (via
 * `messagingRefund`) takes a `paymentId`, not a record, and nothing on
 * `RecordChip` carries one. Resolves the order the same way
 * `resolveMoneyRecordLines` does, then picks the newest paid transaction
 * whose `grossAmountCents - refundedCents > 0`. Null when nothing on this
 * record is refundable (or the record kind carries no money leg at all).
 */
export async function loadRefundableTransaction(
  admin: Admin,
  input: { tenantId: string; recordKind: RecordKind; recordId: string },
): Promise<{ paymentId: string; refundableCents: number } | null> {
  const resolved = await resolveMoneyRecordLines(admin, input);
  if (!resolved.ok) return null;
  const transactions = await loadPaidTransactions(admin, resolved.orderId);
  if (transactions == null) return null;
  const refundable = transactions.map((t) => ({ id: t.id, refundableCents: t.grossAmountCents - t.refundedCents })).filter((t) => t.refundableCents > 0);
  if (refundable.length === 0) return null;
  const last = refundable[refundable.length - 1];
  return { paymentId: last.id, refundableCents: last.refundableCents };
}

export type { RefundLinesResult };
