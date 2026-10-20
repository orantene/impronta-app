import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { releaseInquiryWindowResources } from "@/lib/resources/booking-resources";
import { syncConversationRecord } from "@/lib/messaging/record-sync";
import { resolveCancellationWindow } from "@/lib/bookings/cancellation-window";
import { lateCancelRefundCents, type LateCancelRefund } from "@/lib/talent-policies/answers";
import { notifyBookingSetCancelled, type BookingSetCancelNotifier } from "./cancel-notify";
import { bookingOfferingId, loadBookingCancelPolicy } from "./booking-cancel-policy";

export { bookingOfferingId };

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

/** Canonical cancel roles persisted on agency_bookings.cancelled_by. */
export type CancelBookingActor = "talent" | "client" | "staff" | "system";

/** Callers may still send the legacy Package-2 alias `customer` (= client). */
export type CancelBookingByInput = CancelBookingActor | "customer";

export type CancelBookingReason =
  | "not_cancellable"
  | "policy_keeps"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "invalid"
  | "unavailable";

export type CancelBookingResult =
  | {
      ok: true;
      bookingId: string;
      refundableCents: number;
      already?: boolean;
      by?: CancelBookingActor | null;
      actorUserId?: string | null;
    }
  | { ok: false; reason: CancelBookingReason };

/**
 * Map a caller role onto the four persisted cancel actors.
 * `customer` is the Package-2 alias for `client` (manage token / older callers).
 */
export function normalizeCancelBy(by: string): CancelBookingActor | null {
  if (by === "customer") return "client";
  if (by === "talent" || by === "client" || by === "staff" || by === "system") return by;
  return null;
}

/**
 * What a cancel hands back. Outside the free window (or with none) it is all
 * that was paid. Inside it, the talent's published late-cancel answer decides:
 * none keeps the deposit (the behaviour before policies), half returns half of
 * the deposit, full returns everything.
 */
export function refundableCentsFromPolicy(input: {
  paidCents: number;
  cancelFreeHours: number | null;
  startsAt: string | null;
  nowMs: number;
  lateCancelRefund?: LateCancelRefund;
  depositCents?: number | null;
}): number {
  const paid = Math.max(0, Math.trunc(input.paidCents));
  const window = resolveCancellationWindow({
    cancellationHours: input.cancelFreeHours,
    startsAt: input.startsAt,
    eventDate: null,
    nowMs: input.nowMs,
  });
  if (!window.enforceable) return paid;
  if (window.insideWindow) {
    return lateCancelRefundCents({
      mode: input.lateCancelRefund ?? "none",
      paidCents: paid,
      depositCents: input.depositCents ?? null,
    });
  }
  return paid;
}

export async function cancelBookingSet(
  admin: Admin,
  input: {
    tenantId: string;
    bookingId: string;
    operationKey: string;
    reason: string;
    by: CancelBookingByInput;
    /** Auth user who cancelled when known; null for guest/token/system. */
    actorUserId?: string | null;
    nowMs?: number;
    /** Test seam for the single notify hook; defaults to the real one. */
    notify?: BookingSetCancelNotifier;
  },
): Promise<CancelBookingResult> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };

  const by = normalizeCancelBy(input.by);
  if (!by) return { ok: false, reason: "invalid" };

  const actorUserId =
    typeof input.actorUserId === "string" && input.actorUserId.trim().length > 0
      ? input.actorUserId.trim()
      : null;

  // `agency_bookings` has no offering column: the offering a booking was
  // sold as is on its order's lines (`order_lines.offering_id`), the same
  // path `rescheduleBooking` reads the duration through. Selecting a column
  // that does not exist made every real cancel answer `unavailable`
  // (42703) while the mocked unit test stayed green; found by the manage
  // page on the isolated database, 2026-09-11.
  const { data: booking, error: loadErr } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, starts_at, ends_at, order_id, source_inquiry_id, currency_code")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (loadErr) {
    logServerError("scheduling.cancelBookingSet.load", loadErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!booking) return { ok: false, reason: "not_found" };
  const b = booking as {
    tenant_id: string;
    starts_at?: string | null;
    ends_at?: string | null;
    order_id?: string | null;
    source_inquiry_id?: string | null;
    currency_code?: string | null;
  };
  if (b.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const { data, error } = await admin.rpc("cancel_booking_set", {
    p_tenant_id: input.tenantId,
    p_booking_id: input.bookingId,
    p_operation_key: input.operationKey.trim(),
    p_reason: input.reason,
    p_by: by,
    p_actor_id: actorUserId,
  });
  if (error) {
    logServerError("scheduling.cancelBookingSet.rpc", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    already?: boolean;
    booking_id?: string;
    order_id?: string;
    by?: string | null;
    actor_id?: string | null;
  };
  if (reply.ok !== true) {
    const reason = reply.reason;
    if (reason === "not_cancellable" || reason === "conflict" || reason === "not_found" || reason === "invalid") {
      return { ok: false, reason };
    }
    return { ok: false, reason: "unavailable" };
  }

  // Messages v5 / S2: the RPC accepted, so the booking (and its order) are
  // cancelled; the conversation chips follow. Additive, non-fatal, and
  // placed before the refund arithmetic so a read failure below cannot hide
  // the cancellation from the thread.
  // TUL-1375: a request-sourced booking WITHOUT an order holds its chair, room or
  // station under the inquiry's key; give back only THIS booking's (its window), never
  // another booking's on the same request. Resources on an order line are released by
  // the RPC above with the order. Non-fatal and idempotent.
  if (b.source_inquiry_id && b.starts_at && b.ends_at) {
    await releaseInquiryWindowResources(admin as never, {
      tenantId: input.tenantId,
      inquiryId: b.source_inquiry_id,
      window: { startsAt: b.starts_at, endsAt: b.ends_at },
    });
  }

  const orderId = reply.order_id ?? b.order_id;
  await syncConversationRecord(admin, { tenantId: input.tenantId, kind: "appointment", recordId: input.bookingId });
  if (orderId) {
    await syncConversationRecord(admin, { tenantId: input.tenantId, kind: "order", recordId: orderId });
  }

  // The single notify hook (TUL-1268): once per accepted cancel, whatever the
  // entry point. A replayed cancel (`already`) was notified the first time.
  const notify = input.notify ?? notifyBookingSetCancelled;
  const tell = (paid: number | null, refundable: number | null) => {
    if (reply.already === true) return;
    notify({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      inquiryId: b.source_inquiry_id ?? null,
      paidCents: paid,
      refundableCents: refundable,
      currency: b.currency_code ?? null,
      by,
    });
  };

  let paidCents = 0;
  if (orderId) {
    const { data: txns, error: txnErr } = await admin
      .from("booking_transactions")
      .select("gross_amount_cents, status")
      .eq("order_id", orderId);
    if (txnErr) {
      logServerError("scheduling.cancelBookingSet.paid", txnErr);
      // The cancel is done; still tell everyone, with a generic refund line.
      tell(null, null);
      return { ok: false, reason: "unavailable" };
    }
    for (const t of (txns ?? []) as Array<{ gross_amount_cents: number; status: string }>) {
      if (t.status === "paid") paidCents += Number(t.gross_amount_cents) || 0;
    }
  }

  // One source for the window and the late-cancel rule (shared with the
  // client manage link), not the overrides table alone.
  const policy = await loadBookingCancelPolicy(admin, { tenantId: input.tenantId, orderId: orderId ?? null });

  const refundableCents = refundableCentsFromPolicy({
    paidCents,
    cancelFreeHours: policy.cancelFreeHours,
    lateCancelRefund: policy.lateCancelRefund,
    depositCents: policy.depositCents,
    startsAt: b.starts_at ?? null,
    nowMs: input.nowMs ?? Date.now(),
  });

  tell(paidCents, refundableCents);

  const replyBy = reply.by == null ? by : normalizeCancelBy(String(reply.by));

  return {
    ok: true,
    bookingId: reply.booking_id ?? input.bookingId,
    refundableCents,
    already: reply.already === true,
    by: replyBy,
    actorUserId: reply.actor_id ?? actorUserId,
  };
}
