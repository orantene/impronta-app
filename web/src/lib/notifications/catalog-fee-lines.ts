import "server-only";

import { bookingClientFeeLines } from "@/lib/billing/processing-fee-payer";
import { loadBookingCommissionSnapshots } from "@/lib/billing/commission-engine";
import { validClientFeeLines } from "@/lib/payments/fee-lines-payload";
import type { AudienceContext, NotificationEvent } from "./types";
import { loadInquiryView } from "./catalog-audiences";

/**
 * `loadInquiryView` plus the booking's validated client fee lines, for the
 * payment receipt. The lines come from the frozen commission snapshot via the
 * existing engine helpers (never recomputed here) and are kept only when they
 * sum exactly to the amount paid. Any failure leaves the payload without
 * `feeLines`, so the receipt renders its single total exactly as before.
 */
export async function loadInquiryViewWithFeeLines(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const base = await loadInquiryView(event, ctx);
  try {
    const bookingId = typeof event.payload.bookingId === "string" ? event.payload.bookingId : null;
    const raw = event.payload.grossAmountCents;
    const charge = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!bookingId || !Number.isInteger(charge)) return base;
    const snaps = await loadBookingCommissionSnapshots(ctx.admin, bookingId);
    const lines = validClientFeeLines(bookingClientFeeLines(snaps, charge), charge);
    return lines.length ? { ...base, feeLines: lines } : base;
  } catch {
    return base;
  }
}
