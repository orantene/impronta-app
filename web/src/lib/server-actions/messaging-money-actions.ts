"use server";

/**
 * S6 — cancel, refund and outside payment from the thread.
 *
 * Split out of `messaging-engine.ts` (786 lines against the 800-line
 * ratchet before this lane started) rather than pushed into it. Same
 * `messagingStaff()` guard, same `ActionResult` shape, same refusal
 * vocabulary — a second file, not a second convention.
 *
 * PRINCIPLE 0: nothing here is a new writer. Cancellation and refund both
 * run through `refundOrderLines` / `executeBookingRefund`
 * (`lib/orders/refund-execute-lines.ts`, `lib/payments/refund-execute.ts`) —
 * the same engine the Orders desk uses. Outside payment runs through
 * `markInquiryPaidInCash`'s own server action (workspace path) or
 * `recordVerifiedCollection` (the POS `pos_reserve_collection` settle path
 * for orders). See decisions.md D-MSG-40..43 for the seams this lane found.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { messagingStaff } from "@/lib/messaging/staff-guard";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logAction } from "@/lib/messaging/action-log";
import { insertMessage } from "@/lib/messaging/insert-message";
import { fail } from "@/lib/messaging/refusals";
import {
  hasMessagingMoneyPermission,
  type MessagingMoneyPermission,
} from "@/lib/messaging/money-permissions";
import {
  messagingPreviewCancelRead,
  resolveMoneyRecordLines,
  isMoneyRecordKind,
  isCancelTargetAlready,
  stampOrderCancelStatus,
  releaseOrderLinesCapacity,
  cancelRecordReminder,
  refundArbitraryAmount,
  loadOwnedTransaction,
  loadRefundableTransaction,
  orderLinkedToInquiry,
  type CancelPreview,
} from "@/lib/messaging/money";
import { refundOrderLines } from "@/lib/orders/refund-execute-lines";
import { executeBookingRefund, type RefundReason } from "@/lib/payments/refund-execute";
import { recordVerifiedCollection } from "@/lib/pos/collection";
import { markInquiryPaidInCash } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { RECORD_KINDS, type ActionFail, type ActionResult, type RecordKind } from "@/lib/messaging/types";

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();

async function requirePermission(
  admin: SupabaseClient,
  tenantId: string,
  userId: string,
  permission: MessagingMoneyPermission,
): Promise<{ ok: true } | ActionFail> {
  const ok = await hasMessagingMoneyPermission(admin, { tenantId, userId, permission });
  return ok ? { ok: true } : fail("not_allowed");
}

async function loadInquiryVersion(
  admin: SupabaseClient,
  tenantId: string,
  inquiryId: string,
): Promise<{ ok: true; version: number } | { ok: false; reason: "not_found" | "unavailable" }> {
  const { data, error } = await tenantScopedQuery(admin, "inquiries", tenantId)
    .select("id, version")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, version: (data as { version: number }).version };
}

// ─── messagingPreviewCancel ────────────────────────────────────────────────

export async function messagingPreviewCancel(input: {
  inquiryId: string;
  recordKind: RecordKind;
  recordId: string;
}): Promise<ActionResult<{ preview: CancelPreview }>> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const parsed = z
    .object({ inquiryId: uuid, recordKind: z.enum(RECORD_KINDS), recordId: uuid })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const inq = await loadInquiryVersion(g.admin, g.tenantId, parsed.data.inquiryId);
  if (!inq.ok) return fail(inq.reason);
  const preview = await messagingPreviewCancelRead(g.admin, {
    tenantId: g.tenantId,
    recordKind: parsed.data.recordKind as RecordKind,
    recordId: parsed.data.recordId,
  });
  if (!preview.ok) return fail(preview.reason);
  return { ok: true, preview };
}

// ─── messagingCancelRecord ──────────────────────────────────────────────────

function refundReasonFor(reason: string): RefundReason {
  return reason.toLowerCase().includes("client") ? "requested_by_client" : "booking_cancelled";
}

export async function messagingCancelRecord(input: {
  inquiryId: string;
  recordKind: RecordKind;
  recordId: string;
  reason: string;
  refund: { mode: "full" | "partial" | "keep"; amountCents?: number };
  expectedVersion: number;
}): Promise<ActionResult<{ recordKind: RecordKind; recordId: string; refundedCents: number }>> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      recordKind: z.enum(RECORD_KINDS),
      recordId: uuid,
      reason: z.string().trim().min(2).max(400),
      refund: z.object({
        mode: z.enum(["full", "partial", "keep"]),
        amountCents: z.number().int().positive().optional(),
      }),
      expectedVersion: version,
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.refund.mode === "partial" && parsed.data.refund.amountCents == null) return fail("invalid");

  const perm = await requirePermission(g.admin, g.tenantId, g.userId, "messages.cancel");
  if (!perm.ok) return perm;

  const inq = await loadInquiryVersion(g.admin, g.tenantId, parsed.data.inquiryId);
  if (!inq.ok) return fail(inq.reason);
  if (inq.version !== parsed.data.expectedVersion) return fail("conflict");

  const recordKind = parsed.data.recordKind as RecordKind;
  if (!isMoneyRecordKind(recordKind)) return fail("invalid");

  const resolved = await resolveMoneyRecordLines(g.admin, { tenantId: g.tenantId, recordKind, recordId: parsed.data.recordId });
  if (!resolved.ok) return fail(resolved.reason);

  // "already" — the target has no live money/capacity left to cancel.
  if (await isCancelTargetAlready(g.admin, { tenantId: g.tenantId, recordKind, recordId: parsed.data.recordId, orderId: resolved.orderId })) {
    return fail("already");
  }

  const preview = await messagingPreviewCancelRead(g.admin, { tenantId: g.tenantId, recordKind, recordId: parsed.data.recordId });
  if (!preview.ok) return fail(preview.reason);
  if (parsed.data.refund.mode === "partial") {
    const amt = parsed.data.refund.amountCents as number;
    if (amt > preview.refundableCents) return fail("invalid");
  }

  let refundedCents = 0;
  if (parsed.data.refund.mode === "full") {
    const result = await refundOrderLines(g.admin, {
      orderId: resolved.orderId,
      lineIds: resolved.lineIds,
      reason: refundReasonFor(parsed.data.reason),
      actorUserId: g.userId,
      note: parsed.data.reason,
    });
    if (!result.ok) {
      if (result.reason === "order_not_found") return fail("not_found");
      if (result.reason === "line_already_refunded") return fail("already");
      if (result.reason === "unavailable" || result.reason === "refund_refused" || result.reason === "partial_failure") {
        return fail("unavailable");
      }
      return fail("invalid");
    }
    refundedCents = result.refundedCents;
  } else if (parsed.data.refund.mode === "partial") {
    // D-MSG-42 (seam): `refundOrderLines` always refunds a line's FULL
    // remaining amount — there is no existing writer for "refund part of a
    // line and still void it atomically". A partial-refund cancel therefore
    // moves the money leg directly (`executeBookingRefund`, the same
    // primitive `refundOrderLines` calls internally, oldest-transaction
    // first) and releases capacity via `release_capacity` — the SAME RPC
    // `cancel_booking_set` calls for this exact purpose — but does NOT void
    // the admission's own `status` column (only `refundOrderLines`'s call to
    // `refund_admission` does that atomically). The ticket/seat is freed for
    // resale; a door/scanner surface reading `admissions.status` directly
    // would still see it `valid`. Filed for a follow-up lane.
    const amt = parsed.data.refund.amountCents as number;
    const moved = await refundArbitraryAmount(g.admin, resolved.orderId, amt, refundReasonFor(parsed.data.reason), g.userId, parsed.data.reason);
    if (!moved.ok) return fail("unavailable");
    refundedCents = moved.movedCents;
    await releaseOrderLinesCapacity(g.admin, g.tenantId, resolved.lineIds);
  } else {
    // "keep": same capacity-release-only path, same D-MSG-42 gap, no money moves.
    await releaseOrderLinesCapacity(g.admin, g.tenantId, resolved.lineIds);
  }

  // Order-kind: stamp the order's own status so the existing
  // `orders_auto_cancel_reminders` trigger (20261231222000) fires and stops
  // this order's scheduled reminders — no hand-cancel needed for this kind.
  if (recordKind === "order") {
    const nextStatus = refundedCents <= 0 ? "cancelled" : refundedCents >= preview.refundableCents ? "refunded" : "partially_refunded";
    const stamped = await stampOrderCancelStatus(g.admin, { tenantId: g.tenantId, orderId: resolved.orderId, status: nextStatus });
    if (!stamped) {
      // Money (if any) already moved; never turn that into a reported
      // failure (same rule `refundOrderLines` itself follows). Logged, not
      // swallowed — D-MSG-42.
      await logAction(g.admin, {
        inquiryId: parsed.data.inquiryId,
        actorUserId: g.userId,
        actionType: "messaging_cancel_record_status_stamp_failed",
        metadata: { orderId: resolved.orderId, nextStatus },
      });
    }
  } else {
    // Admissions-kind: `orders_auto_cancel_reminders` only watches
    // `orders.status` (D-MSG-42) — this kind's own reminder is cancelled
    // by hand, same shape `messagingCancelReminder` already uses.
    await cancelRecordReminder(g.admin, g.tenantId, recordKind, parsed.data.recordId);
  }

  await logAction(g.admin, {
    inquiryId: parsed.data.inquiryId,
    actorUserId: g.userId,
    actionType: "messaging_cancel_record",
    metadata: { recordKind, recordId: parsed.data.recordId, reason: parsed.data.reason, refundMode: parsed.data.refund.mode, refundedCents },
  });

  await insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: "change_result",
    body: "",
    payload: {
      state: "sent",
      summary: refundedCents > 0 ? `Cancelled, refunded ${(refundedCents / 100).toFixed(2)}` : "Cancelled, no refund",
      recordKind,
      recordId: parsed.data.recordId,
      refundMode: parsed.data.refund.mode,
      refundedCents,
      reason: parsed.data.reason,
    },
    senderUserId: g.userId,
  });

  return { ok: true, recordKind, recordId: parsed.data.recordId, refundedCents };
}

// ─── messagingLoadRefundableTransaction (L7, D-MSG-14x) ────────────────────

/**
 * The "Refund" sheet (no cancellation) needs a `paymentId`, which nothing on
 * `RecordChip` carries. This resolves the latest paid transaction on the
 * record with money still owed on it, the way `messagingPreviewCancel`
 * resolves the record itself. Read-only; no permission gate beyond
 * `messagingStaff()` (the write path, `messagingRefund`, already gates on
 * `messages.refund`).
 */
export async function messagingLoadRefundableTransaction(input: {
  recordKind: RecordKind;
  recordId: string;
}): Promise<ActionResult<{ paymentId: string | null; refundableCents: number }>> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const parsed = z.object({ recordKind: z.enum(RECORD_KINDS), recordId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const found = await loadRefundableTransaction(g.admin, { tenantId: g.tenantId, recordKind: parsed.data.recordKind as RecordKind, recordId: parsed.data.recordId });
  return { ok: true, paymentId: found?.paymentId ?? null, refundableCents: found?.refundableCents ?? 0 };
}

// ─── messagingRefund (no cancellation) ─────────────────────────────────────

export async function messagingRefund(input: {
  inquiryId: string;
  paymentId: string;
  mode: "full" | "partial";
  amountCents?: number;
  reason: string;
  expectedVersion: number;
}): Promise<ActionResult<{ refundedCents: number }>> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      paymentId: uuid,
      mode: z.enum(["full", "partial"]),
      amountCents: z.number().int().positive().optional(),
      reason: z.string().trim().min(2).max(400),
      expectedVersion: version,
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.mode === "partial" && parsed.data.amountCents == null) return fail("invalid");

  const perm = await requirePermission(g.admin, g.tenantId, g.userId, "messages.refund");
  if (!perm.ok) return perm;

  const inq = await loadInquiryVersion(g.admin, g.tenantId, parsed.data.inquiryId);
  if (!inq.ok) return fail(inq.reason);
  if (inq.version !== parsed.data.expectedVersion) return fail("conflict");

  // The transaction must belong to an order this tenant owns AND this
  // inquiry's own order — defence in depth beyond the staff guard, so one
  // inquiry's thread cannot refund another's payment by id-guessing.
  const owned = await loadOwnedTransaction(g.admin, g.tenantId, parsed.data.paymentId);
  if (!owned) return fail("not_found");
  if (!(await orderLinkedToInquiry(g.admin, g.tenantId, owned.orderId, parsed.data.inquiryId))) return fail("not_found");

  const result = await executeBookingRefund({
    transactionId: parsed.data.paymentId,
    amountCents: parsed.data.mode === "full" ? null : parsed.data.amountCents,
    reason: "goodwill",
    actorUserId: g.userId,
    note: parsed.data.reason,
  });
  if (!result.ok) return fail(result.code === "amount" ? "invalid" : "unavailable");

  await logAction(g.admin, {
    inquiryId: parsed.data.inquiryId,
    actorUserId: g.userId,
    actionType: "messaging_refund",
    metadata: { paymentId: parsed.data.paymentId, mode: parsed.data.mode, refundedCents: result.amountCents, reason: parsed.data.reason },
  });

  await insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: "change_result",
    body: "",
    payload: {
      state: "cancelled",
      summary: `Refunded ${(result.amountCents / 100).toFixed(2)} ${result.currency}`,
      paymentId: parsed.data.paymentId,
      refundedCents: result.amountCents,
      currency: result.currency,
      reason: parsed.data.reason,
    },
    senderUserId: g.userId,
  });

  return { ok: true, refundedCents: result.amountCents };
}

// ─── messagingRecordOutsidePayment ──────────────────────────────────────────

const OFF_PLATFORM_METHODS = ["cash", "transfer", "terminal_offline"] as const;
type OffPlatformMethod = (typeof OFF_PLATFORM_METHODS)[number];

export async function messagingRecordOutsidePayment(input: {
  inquiryId: string;
  recordId: string;
  amountCents: number;
  method: OffPlatformMethod;
  reference: string;
  expectedVersion: number;
  /** Booking path only. Omitted callers keep today's whole-sale settlement. */
  amountKind?: "deposit" | "full";
}): Promise<ActionResult<{ recordId: string }>> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      recordId: uuid,
      amountCents: z.number().int().positive(),
      method: z.enum(OFF_PLATFORM_METHODS),
      reference: z.string().trim().min(3).max(200),
      expectedVersion: version,
      amountKind: z.enum(["deposit", "full"]).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");

  const perm = await requirePermission(g.admin, g.tenantId, g.userId, "messages.discount");
  if (!perm.ok) return perm;

  const inq = await loadInquiryVersion(g.admin, g.tenantId, parsed.data.inquiryId);
  if (!inq.ok) return fail(inq.reason);
  if (inq.version !== parsed.data.expectedVersion) return fail("conflict");

  // D-MSG-43: `recordId` carries no kind. Whether it names an `orders` row
  // (POS collection path) or something else (the workspace booking path,
  // keyed on `inquiryId` — `markInquiryPaidInCash` takes no record id at
  // all) is resolved by asking `orders` first.
  const { data: orderRow } = await tenantScopedQuery(g.admin, "orders", g.tenantId)
    .select("id, currency")
    .eq("id", parsed.data.recordId)
    .maybeSingle();

  if (orderRow) {
    const order = orderRow as { id: string; currency: string };
    // "card" vs "cash" here only distinguishes a counter tender from a
    // provider session (comment in `recordVerifiedCollection`); neither of
    // our three methods is a provider session, so `terminal_offline` (a
    // card-present tender with no online authorization) maps to "card" and
    // `cash`/`transfer` both map to "cash" — D-MSG-43.
    const paidVia = parsed.data.method === "terminal_offline" ? "card" : "cash";
    const result = await recordVerifiedCollection(g.admin, {
      tenantId: g.tenantId,
      orderId: order.id,
      actorUserId: g.userId,
      paidVia,
      amountCents: parsed.data.amountCents,
      currency: order.currency,
    });
    if (!result.ok) {
      if (/payout/i.test(result.error)) return fail("no_payout_receiver");
      if (result.reason === "not_found" || result.reason === "wrong_tenant") return fail("not_found");
      if (result.reason === "amount") return fail("invalid");
      return fail("unavailable");
    }
    await recordOutsidePaymentFollowUp(g, parsed.data, "order");
    return { ok: true, recordId: parsed.data.recordId };
  }

  // Workspace/appointment booking path. `markInquiryPaidInCash` resolves the
  // booking from the inquiry itself and takes no record id — D-MSG-43 notes
  // this, since a caller-supplied `recordId` that names neither an order nor
  // (implicitly) this inquiry's own booking is silently ignored rather than
  // checked, because the function offers nothing to check it against.
  const cashMethod = parsed.data.method === "transfer" ? "wire" : parsed.data.method === "terminal_offline" ? "other" : "cash";
  const checkoutType = parsed.data.amountKind === "deposit" ? "deposit" : "full";
  const wrapped = await markInquiryPaidInCash(g.tenantSlug, parsed.data.inquiryId, cashMethod, parsed.data.reference, checkoutType);
  if (!wrapped.ok) {
    if (wrapped.error && /payout/i.test(wrapped.error)) return fail("no_payout_receiver");
    return fail("unavailable");
  }
  await recordOutsidePaymentFollowUp(g, parsed.data, "appointment");
  return { ok: true, recordId: parsed.data.recordId };
}

async function recordOutsidePaymentFollowUp(
  g: { admin: SupabaseClient; tenantId: string; userId: string },
  data: { inquiryId: string; recordId: string; amountCents: number; method: OffPlatformMethod; reference: string },
  path: "order" | "appointment",
): Promise<void> {
  await logAction(g.admin, {
    inquiryId: data.inquiryId,
    actorUserId: g.userId,
    actionType: "messaging_record_outside_payment",
    metadata: { recordId: data.recordId, amountCents: data.amountCents, method: data.method, reference: data.reference, path },
  });
  await insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: data.inquiryId,
    kind: "change_result",
    body: "",
    payload: {
      state: "sent",
      summary: `Recorded ${(data.amountCents / 100).toFixed(2)} paid (${data.method}), ref ${data.reference}`,
      recordId: data.recordId,
      amountCents: data.amountCents,
      method: data.method,
      reference: data.reference,
    },
    senderUserId: g.userId,
  });
}

// ─── permission-gated read paths (D-MSG-40, item 5) ────────────────────────

export async function messagingCanReadNotes(): Promise<ActionResult<{ allowed: boolean }>> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const allowed = await hasMessagingMoneyPermission(g.admin, {
    tenantId: g.tenantId,
    userId: g.userId,
    permission: "messages.notes.read",
  });
  return { ok: true, allowed };
}
