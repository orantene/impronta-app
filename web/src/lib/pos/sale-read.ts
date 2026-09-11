import "server-only";

/**
 * The POS read side: one sale, and the list of open ones.
 *
 * Split from `draft.ts` when that file crossed the 800-line cap. Commands and
 * queries was the honest seam — the writes share a version-bump and a totals
 * rebuild that these two functions have no part in, and neither of these ever
 * needs the other's helpers. Re-exported from `draft.ts` so no caller moved.
 */

import { logServerError } from "@/lib/server/safe-error";
import { loadActiveTicketForOrder } from "@/lib/preparation/tickets";
import { LINE_COLUMNS, ORDER_COLUMNS, num, type Admin, type LineRow, type OrderRow } from "./sale-rows";
import type { PosSaleView } from "./commands";

export async function loadPosSale(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<{ ok: true; sale: PosSaleView } | { ok: false; reason: "not_found" | "wrong_tenant" | "unavailable" }> {
  const { data: order, error } = await admin
    .from("orders")
    .select(
      ORDER_COLUMNS,
    )
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.loadSale", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  const row = order as OrderRow;
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const { data: lineRows, error: linesError } = await admin
    .from("order_lines")
    .select(LINE_COLUMNS)
    .eq("order_id", input.orderId)
    .order("sort_order", { ascending: true });
  if (linesError) {
    logServerError("pos.loadSale.lines", linesError);
    return { ok: false, reason: "unavailable" };
  }

  const { data: paid, error: paidError } = await admin
    .from("booking_transactions")
    .select("gross_amount_cents, status")
    .eq("order_id", input.orderId);
  if (paidError) {
    logServerError("pos.loadSale.paid", paidError);
    return { ok: false, reason: "unavailable" };
  }

  let depositPaidCents = 0;
  for (const txn of (paid ?? []) as Array<{ gross_amount_cents: number; status: string }>) {
    if (txn.status === "paid") depositPaidCents += num(txn.gross_amount_cents);
  }

  const totalCents = num(row.total_cents);
  const outstandingCents = Math.max(0, totalCents - depositPaidCents);
  const status = row.status;
  const paymentState =
    status === "paid" || status === "fulfilled"
      ? "paid"
      : status === "cancelled" || status === "refunded"
        ? "cancelled"
        : status === "pending_payment"
          ? "pending"
          : "unpaid";

  const ticketRes = await loadActiveTicketForOrder(admin, { tenantId: input.tenantId, orderId: input.orderId });
  if (!ticketRes.ok) return { ok: false, reason: "unavailable" };
  const ticket = ticketRes.ticket;
  const prepState: PosSaleView["prepState"] = !ticket
    ? "not_submitted"
    : ticket.revision > 1 && ticket.status === "queued"
      ? "amended"
      : ticket.status;

  return {
    ok: true,
    sale: {
      orderId: row.id,
      tenantId: row.tenant_id,
      status,
      currency: row.currency,
      customerId: row.customer_id,
      guestSessionId: row.guest_session_id,
      context: row.source_page,
      visitId: row.visit_id,
      spaceId: row.space_id,
      version: Number(row.version) || 1,
      subtotalCents: num(row.subtotal_cents),
      discountCents: num(row.discount_cents),
      taxCents: num(row.tax_cents),
      totalCents,
      depositPaidCents,
      outstandingCents,
      prepState,
      paymentState,
      lines: ((lineRows ?? []) as LineRow[]).map((l) => ({
        id: l.id,
        offeringId: l.offering_id,
        variantId: l.variant_id,
        sessionId: l.session_id,
        label: l.label,
        units: num(l.units),
        unitCents: num(l.unit_cents),
        totalCents: num(l.total_cents),
      })),
    },
  };
}

export async function listOpenPosSales(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; rows: Array<{ id: string; totalCents: number; createdAt: string | null }> } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("orders")
    .select("id, total_cents, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .eq("source_channel", "pos")
    .order("created_at", { ascending: false });
  if (error) {
    logServerError("pos.listOpen", error);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    rows: ((data ?? []) as Array<{ id: string; total_cents: number; created_at: string | null }>).map((r) => ({
      id: r.id,
      totalCents: num(r.total_cents),
      createdAt: r.created_at,
    })),
  };
}

/**
 * The counter's receipts (`POSReceipts`): the workspace's paid POS sales
 * since `sinceIso`, newest first, with the buyer's name and the line labels
 * so the row can say `2 latte, croissant` without a second read per row.
 *
 * `updated_at` is when the sale was last written, which for a paid order is
 * the moment it was paid (the collection is the last write on the row).
 * The money row's method is NOT read here — that is a join on
 * `booking_transactions` the receipts screen says it cannot filter by yet.
 */
export async function listPaidPosSales(
  admin: Admin,
  input: { tenantId: string; sinceIso: string; limit?: number; sourcePage?: string },
): Promise<
  | {
      ok: true;
      rows: Array<{
        id: string;
        totalCents: number;
        currency: string;
        paidAt: string | null;
        receiptCode: string | null;
        customerName: string | null;
        lineLabels: string[];
      }>;
    }
  | { ok: false; reason: "unavailable" }
> {
  type Row = {
    id: string;
    total_cents: number | string;
    currency: string | null;
    updated_at: string | null;
    receipt_code: string | null;
    customers: { display_name: string | null } | { display_name: string | null }[] | null;
    order_lines: Array<{ label: string | null; units: number | string }> | null;
  };
  let query = admin
    .from("orders")
    .select("id, total_cents, currency, updated_at, receipt_code, customers(display_name), order_lines(label, units)")
    .eq("tenant_id", input.tenantId)
    .eq("status", "paid")
    .eq("source_channel", "pos");
  // The door's Receipts rail shows the door's own sales (`source_page`
  // "door"); the counter's shows every sale through the till.
  if (input.sourcePage) query = query.eq("source_page", input.sourcePage);
  const { data, error } = await query
    .gte("updated_at", input.sinceIso)
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 200);
  if (error) {
    logServerError("pos.listPaid", error);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    // The service-role client is untyped, so the row shape is stated on the
    // callback rather than asserted over the whole result.
    rows: (data ?? []).map((r: Row) => {
      const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      return {
        id: r.id,
        totalCents: num(r.total_cents),
        currency: r.currency ?? "USD",
        paidAt: r.updated_at,
        receiptCode: r.receipt_code,
        customerName: customer?.display_name?.trim() || null,
        lineLabels: (r.order_lines ?? []).map((line) =>
          num(line.units) > 1 ? `${num(line.units)} ${line.label ?? ""}`.trim() : (line.label ?? "").trim(),
        ),
      };
    }),
  };
}
