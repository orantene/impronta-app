import "server-only";

/**
 * The Links destination (`POSPaymentLink`): every payment link this
 * workspace has sent, newest first, with who it was for and what it
 * resolves to. Read-only over `payment_links`; the write is
 * `createPaymentLink` and the state change is the `/pay/<code>` page or the
 * expire-orders cron.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "@/lib/pos/sale-rows";

export type PaymentLinkBoardRow = {
  readonly code: string;
  readonly orderId: string;
  readonly amountCents: number;
  readonly currency: string;
  /** `open` · `paid` · `expired` · `cancelled` */
  readonly status: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** The customer on the order, when named. */
  readonly customerName: string | null;
  /** The order's own receipt code, for a paid link's receipt door. */
  readonly receiptCode: string | null;
  /** The project or booking the order belongs to, when it has one. */
  readonly title: string | null;
};

export async function listWorkspacePaymentLinks(
  admin: Admin,
  input: { tenantId: string; limit?: number },
): Promise<{ ok: true; rows: PaymentLinkBoardRow[] } | { ok: false; reason: "unavailable" }> {
  const links = await admin
    .from("payment_links")
    .select("code, order_id, amount_cents, currency, status, created_at, expires_at")
    .eq("tenant_id", input.tenantId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (links.error) {
    logServerError("payments.linksBoard", links.error);
    return { ok: false, reason: "unavailable" };
  }
  type LinkRow = { code: string; order_id: string; amount_cents: number | string; currency: string | null; status: string; created_at: string; expires_at: string };
  const linkRows = (links.data ?? []) as LinkRow[];
  if (linkRows.length === 0) return { ok: true, rows: [] };

  const orderIds = [...new Set(linkRows.map((l) => l.order_id))];
  const orders = await admin
    .from("orders")
    .select("id, customer_id, receipt_code, customers:customer_id(display_name, email)")
    .eq("tenant_id", input.tenantId)
    .in("id", orderIds);
  if (orders.error) {
    logServerError("payments.linksBoard.orders", orders.error);
    return { ok: false, reason: "unavailable" };
  }
  type OrderRow = { id: string; receipt_code: string | null; customers: { display_name: string | null; email: string | null } | { display_name: string | null; email: string | null }[] | null };
  const byOrder = new Map<string, OrderRow>();
  for (const o of (orders.data ?? []) as OrderRow[]) byOrder.set(o.id, o);

  const bookings = await admin.from("agency_bookings").select("order_id, title").eq("tenant_id", input.tenantId).in("order_id", orderIds);
  if (bookings.error) logServerError("payments.linksBoard.bookings", bookings.error);
  const titleByOrder = new Map<string, string>();
  for (const b of (bookings.data ?? []) as Array<{ order_id: string | null; title: string | null }>) {
    if (b.order_id && b.title?.trim()) titleByOrder.set(b.order_id, b.title.trim());
  }

  return {
    ok: true,
    rows: linkRows.map((l) => {
      const order = byOrder.get(l.order_id);
      const customer = Array.isArray(order?.customers) ? order?.customers[0] : order?.customers;
      return {
        code: l.code,
        orderId: l.order_id,
        amountCents: Number(l.amount_cents) || 0,
        currency: l.currency ?? "USD",
        status: l.status,
        createdAt: l.created_at,
        expiresAt: l.expires_at,
        customerName: customer?.display_name?.trim() || customer?.email || null,
        receiptCode: order?.receipt_code ?? null,
        title: titleByOrder.get(l.order_id) ?? null,
      };
    }),
  };
}
