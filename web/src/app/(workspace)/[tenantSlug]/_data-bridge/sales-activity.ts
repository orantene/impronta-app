import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isMoneyOwed, type OrderListRow } from "@/lib/orders/orders-list";
import { loadWorkspaceOrders } from "./orders";

export type SalesActivityKind = "order" | "booking" | "reservation" | "registration";

export type SalesActivityRow = {
  id: string;
  kind: SalesActivityKind;
  customerName: string | null;
  title: string | null;
  status: string;
  totalCents: number;
  collectedCents: number;
  currency: string;
  createdAt: string;
  href: string;
  owed: boolean;
};

export type SalesActivityLoad =
  | { ok: true; rows: SalesActivityRow[] }
  | { ok: false };

function orderHref(tenantSlug: string, orderId: string): string {
  return `/${tenantSlug}/admin/orders/${orderId}`;
}

function bookingHref(tenantSlug: string, bookingId: string): string {
  return `/${tenantSlug}/admin/bookings/${bookingId}`;
}

function mapOrder(tenantSlug: string, row: OrderListRow): SalesActivityRow {
  return {
    id: row.id,
    kind: "order",
    customerName: row.customerName,
    title: row.sourceChannel,
    status: row.status,
    totalCents: row.totalCents,
    collectedCents: row.collectedCents,
    currency: row.currency,
    createdAt: row.createdAt,
    href: orderHref(tenantSlug, row.id),
    owed: isMoneyOwed(row),
  };
}

/**
 * Combined Sales read: orders plus bookings/reservations/registrations that
 * do not already have a financial order. Does not manufacture orders.
 */
export async function loadWorkspaceSalesActivity(
  tenantId: string,
  tenantSlug: string,
  opts: { kind?: SalesActivityKind | "all" } = {},
): Promise<SalesActivityLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };

  const ordersLoad = await loadWorkspaceOrders(tenantId);
  if (!ordersLoad.ok) return { ok: false };

  const orderIds = new Set(ordersLoad.rows.map((row) => row.id));
  const extras: SalesActivityRow[] = [];

  const [bookingsRes, visitsRes, admissionsRes, visitOrdersRes] = await Promise.all([
    admin
      .from("agency_bookings")
      .select("id, order_id, status, payment_status, total_client_revenue, currency_code, created_at, contact_name, title")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("visits")
      .select("id, status, created_at, service_kind")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("admissions")
      .select("id, order_line_id, status, created_at, session_id")
      .eq("tenant_id", tenantId)
      .is("order_line_id", null)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("orders")
      .select("visit_id")
      .eq("tenant_id", tenantId)
      .not("visit_id", "is", null)
      .limit(500),
  ]);
  if (visitOrdersRes.error) {
    logServerError("dataBridge.salesActivity/visitOrders", visitOrdersRes.error);
    return { ok: false };
  }
  const visitsWithOrders = new Set(
    (visitOrdersRes.data ?? [])
      .map((row) => (row as { visit_id: string | null }).visit_id)
      .filter((id): id is string => Boolean(id)),
  );

  if (bookingsRes.error) {
    logServerError("dataBridge.salesActivity/bookings", bookingsRes.error);
    return { ok: false };
  }
  if (visitsRes.error) {
    logServerError("dataBridge.salesActivity/visits", visitsRes.error);
    return { ok: false };
  }
  if (admissionsRes.error) {
    logServerError("dataBridge.salesActivity/admissions", admissionsRes.error);
    return { ok: false };
  }

  for (const raw of bookingsRes.data ?? []) {
    const row = raw as {
      id: string;
      order_id: string | null;
      status: string | null;
      payment_status: string | null;
      total_client_revenue: number | string | null;
      currency_code: string | null;
      created_at: string;
      contact_name: string | null;
      title: string | null;
    };
    if (row.order_id && orderIds.has(row.order_id)) continue;
    const totalCents = Math.round(Number(row.total_client_revenue ?? 0) * 100);
    extras.push({
      id: row.id,
      kind: "booking",
      customerName: row.contact_name,
      title: row.title,
      status: row.payment_status ?? row.status ?? "confirmed",
      totalCents,
      collectedCents: 0,
      currency: row.currency_code ?? "USD",
      createdAt: row.created_at,
      href: bookingHref(tenantSlug, row.id),
      owed: totalCents > 0 && row.payment_status !== "paid",
    });
  }

  for (const raw of visitsRes.data ?? []) {
    const row = raw as {
      id: string;
      status: string | null;
      created_at: string;
      service_kind: string | null;
    };
    if (visitsWithOrders.has(row.id)) continue;
    extras.push({
      id: row.id,
      kind: "reservation",
      customerName: null,
      title: row.service_kind === "tab" ? "tab" : "table",
      status: row.status ?? "open",
      totalCents: 0,
      collectedCents: 0,
      currency: "USD",
      createdAt: row.created_at,
      href: `/${tenantSlug}/admin/tables`,
      owed: false,
    });
  }

  for (const raw of admissionsRes.data ?? []) {
    const row = raw as {
      id: string;
      status: string | null;
      created_at: string;
    };
    extras.push({
      id: row.id,
      kind: "registration",
      customerName: null,
      title: "registration",
      status: row.status ?? "valid",
      totalCents: 0,
      collectedCents: 0,
      currency: "USD",
      createdAt: row.created_at,
      href: `/${tenantSlug}/admin/sessions`,
      owed: false,
    });
  }

  const orders = ordersLoad.rows.map((row) => mapOrder(tenantSlug, row));
  let rows = [...orders, ...extras];
  const kind = opts.kind ?? "all";
  if (kind !== "all") rows = rows.filter((row) => row.kind === kind);
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { ok: true, rows };
}
