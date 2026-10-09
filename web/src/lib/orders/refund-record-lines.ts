/**
 * The ONE place a refund is written onto `order_lines.refunded_cents`.
 *
 * A refund the order does not show is the bug class (paid run #2, 2026-10-09: an MX$300 partial
 * refund via `executeBookingRefund` moved money but the order line still read unrefunded). Every
 * refund that is tied to an order records here, from `executeBookingRefund` for the direct
 * callers; `refundOrderLines` opts out of that default and records its own per-line allocation
 * through the same function, so the two can never both count one refund.
 *
 * IDEMPOTENT per Stripe refund id: the ids already applied live on the PARENT transaction's
 * metadata (`order_lines_refunds`), which exists before the webhook has written the refund row.
 * The marker is written BEFORE the lines, so a crash in between under-counts (visible, logged)
 * instead of double counting money.
 */
import { logServerError } from "@/lib/server/safe-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export const ORDER_LINES_REFUNDS_KEY = "order_lines_refunds" as const;

export type LineForRefund = { id: string; totalCents: number; refundedCents: number };
export type LineAllocation = { lineId: string; amountCents: number };

/** Oldest line first, each capped at what it can still return; the excess (tip, fees) is dropped. */
export function allocateRefundAcrossLines(lines: readonly LineForRefund[], amountCents: number): LineAllocation[] {
  const out: LineAllocation[] = [];
  let left = Math.max(0, Math.floor(amountCents));
  for (const l of lines) {
    if (left <= 0) break;
    const room = Math.max(0, l.totalCents - l.refundedCents);
    const take = Math.min(room, left);
    if (take > 0) {
      out.push({ lineId: l.id, amountCents: take });
      left -= take;
    }
  }
  return out;
}

export type RecordRefundResult =
  | { recorded: true; allocation: LineAllocation[] }
  | { recorded: false; reason: "no_order" | "already_recorded" | "no_lines" | "unavailable" };

export async function recordRefundOnOrderLines(
  admin: Admin,
  input: {
    transactionId: string;
    /** Stripe `re_...`; every refund id this allocation stands for (a multi-step plan has several). */
    refundIds: readonly string[];
    amountCents: number;
    /** Explicit per-line amounts (refund by line). Omitted: spread oldest-line-first. */
    allocation?: readonly LineAllocation[];
  },
): Promise<RecordRefundResult> {
  try {
    const { data: txn, error: txnErr } = await admin
      .from("booking_transactions")
      .select("id, order_id, metadata")
      .eq("id", input.transactionId)
      .maybeSingle();
    if (txnErr) {
      logServerError("orders.recordRefundLines/txn", txnErr);
      return { recorded: false, reason: "unavailable" };
    }
    const row = txn as { id: string; order_id: string | null; metadata?: unknown } | null;
    if (!row?.order_id) return { recorded: false, reason: "no_order" };

    const meta = ((row.metadata ?? {}) as Record<string, unknown>);
    const applied = Array.isArray(meta[ORDER_LINES_REFUNDS_KEY]) ? (meta[ORDER_LINES_REFUNDS_KEY] as string[]) : [];
    if (input.refundIds.some((id) => applied.includes(id))) return { recorded: false, reason: "already_recorded" };

    const { data: lineRows, error: lineErr } = await admin
      .from("order_lines")
      .select("id, total_cents, refunded_cents")
      .eq("order_id", row.order_id)
      .order("created_at", { ascending: true });
    if (lineErr) {
      logServerError("orders.recordRefundLines/lines", lineErr);
      return { recorded: false, reason: "unavailable" };
    }
    const lines: LineForRefund[] = ((lineRows ?? []) as Array<{ id: string; total_cents: number; refunded_cents: number | null }>).map((l) => ({
      id: l.id,
      totalCents: Number(l.total_cents),
      refundedCents: Number(l.refunded_cents ?? 0),
    }));
    if (lines.length === 0) return { recorded: false, reason: "no_lines" };
    const allocation = input.allocation ? [...input.allocation] : allocateRefundAcrossLines(lines, input.amountCents);

    // Marker first (see header): under-count beats double count.
    const { error: markErr } = await admin
      .from("booking_transactions")
      .update({ metadata: { ...meta, [ORDER_LINES_REFUNDS_KEY]: [...applied, ...input.refundIds] } })
      .eq("id", row.id);
    if (markErr) {
      logServerError("orders.recordRefundLines/mark", markErr);
      return { recorded: false, reason: "unavailable" };
    }

    for (const a of allocation) {
      const current = lines.find((l) => l.id === a.lineId)?.refundedCents ?? 0;
      const { error } = await admin.from("order_lines").update({ refunded_cents: current + a.amountCents }).eq("id", a.lineId);
      if (error) {
        logServerError(
          "orders.recordRefundLines/LINE_NOT_STAMPED_AFTER_REFUND",
          `${a.amountCents} cents refunded on line ${a.lineId} (refund ${input.refundIds.join(",")}), but refunded_cents could not be updated: ${error.message}. Needs a human.`,
        );
      }
    }
    return { recorded: true, allocation };
  } catch (err) {
    logServerError("orders.recordRefundLines", err);
    return { recorded: false, reason: "unavailable" };
  }
}
