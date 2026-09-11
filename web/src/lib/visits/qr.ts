import "server-only";

/**
 * Table QR resolves to the current visit token, never the table identity.
 *
 * The printed code on the tent stays `/q/t7` (link kind `table`, context
 * `space_id`). Last night's check is unreachable because a closed visit is
 * not returned, and the guest page looks up `visits.public_token` — not
 * `spaces.id`.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type TableQrResult =
  | { ok: true; visitId: string; publicToken: string; path: string }
  | { ok: false; reason: "not_seated" | "unavailable" | "invalid" };

export async function resolveOpenVisitForSpace(
  admin: Admin,
  input: { tenantId: string; spaceId: string },
): Promise<TableQrResult> {
  if (!input.tenantId || !input.spaceId) {
    return { ok: false, reason: "invalid" };
  }
  const { data, error } = await admin
    .from("visits")
    .select("id, public_token, status, tenant_id")
    .eq("tenant_id", input.tenantId)
    .eq("space_id", input.spaceId)
    .eq("status", "open")
    .maybeSingle();
  if (error) {
    logServerError("visits.qr.resolve", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_seated" };
  const row = data as { id: string; public_token: string; status: string; tenant_id: string };
  if (row.tenant_id !== input.tenantId || row.status !== "open") {
    return { ok: false, reason: "not_seated" };
  }
  return {
    ok: true,
    visitId: row.id,
    publicToken: row.public_token,
    path: `/visit/${row.public_token}`,
  };
}

export type GuestVisitLoad =
  | {
      ok: true;
      visitId: string;
      spaceId: string;
      lines: Array<{ id: string; label: string; units: number; totalCents: number }>;
      totalCents: number;
      currency: string;
    }
  | { ok: false; reason: "not_found" | "ended" | "unavailable" };

export async function loadOpenVisitByToken(
  admin: Admin,
  input: { tenantId: string; publicToken: string },
): Promise<GuestVisitLoad> {
  const token = input.publicToken.trim();
  if (!input.tenantId || !token) return { ok: false, reason: "not_found" };

  const { data: visit, error } = await admin
    .from("visits")
    .select("id, tenant_id, space_id, public_token, status")
    .eq("tenant_id", input.tenantId)
    .eq("public_token", token)
    .maybeSingle();
  if (error) {
    logServerError("visits.qr.guest", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!visit) return { ok: false, reason: "not_found" };
  const row = visit as {
    id: string;
    tenant_id: string;
    space_id: string;
    public_token: string;
    status: string;
  };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "not_found" };
  if (row.status !== "open") return { ok: false, reason: "ended" };

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, currency, total_cents")
    .eq("visit_id", row.id)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (orderError) {
    logServerError("visits.qr.guest.order", orderError);
    return { ok: false, reason: "unavailable" };
  }
  const orderRow = order as { id: string; currency: string; total_cents: number | string } | null;
  if (!orderRow) {
    return {
      ok: true,
      visitId: row.id,
      spaceId: row.space_id,
      lines: [],
      totalCents: 0,
      currency: "USD",
    };
  }
  const { data: lineRows, error: linesError } = await admin
    .from("order_lines")
    .select("id, label, units, total_cents")
    .eq("order_id", orderRow.id)
    .order("sort_order", { ascending: true });
  if (linesError) {
    logServerError("visits.qr.guest.lines", linesError);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    visitId: row.id,
    spaceId: row.space_id,
    currency: orderRow.currency,
    totalCents: Number(orderRow.total_cents) || 0,
    lines: ((lineRows ?? []) as Array<{ id: string; label: string; units: number | string; total_cents: number | string }>).map(
      (l) => ({
        id: l.id,
        label: l.label,
        units: Number(l.units) || 0,
        totalCents: Number(l.total_cents) || 0,
      }),
    ),
  };
}
