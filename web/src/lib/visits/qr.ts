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
      /** The code printed on the table ("T2"), else its name; the guest page greets by it. */
      tableCode: string | null;
      openedAtIso: string | null;
      partySize: number | null;
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
    .select("id, tenant_id, space_id, public_token, status, opened_at, party_size")
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
    opened_at: string | null;
    party_size: number | string | null;
  };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "not_found" };
  if (row.status !== "open") return { ok: false, reason: "ended" };
  const partySize = row.party_size == null ? null : Number(row.party_size) || null;

  // The table's printed code, so the page can say "Welcome to table T2". A
  // failed read leaves it null and the page greets without a code; never a
  // reason to hide the check.
  let tableCode: string | null = null;
  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select("code, name")
    .eq("id", row.space_id)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (spaceError) logServerError("visits.qr.guest.space", spaceError);
  else {
    const sp = space as { code: string | null; name: string | null } | null;
    tableCode = sp?.code ?? sp?.name ?? null;
  }
  const base = { visitId: row.id, spaceId: row.space_id, tableCode, openedAtIso: row.opened_at, partySize };

  // A visit can hold several orders (two guests ordering at one table, a
  // re-opened tab). The page shows the whole table check, like the bill: every
  // order that is not cancelled, oldest first, lines and totals summed.
  // `.maybeSingle()` here threw PGRST116 as soon as a second order existed.
  const { data: orderRows, error: orderError } = await admin
    .from("orders")
    .select("id, currency, total_cents, status, created_at")
    .eq("visit_id", row.id)
    .eq("tenant_id", input.tenantId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (orderError) {
    logServerError("visits.qr.guest.order", orderError);
    return { ok: false, reason: "unavailable" };
  }
  const orders = (Array.isArray(orderRows) ? orderRows : orderRows ? [orderRows] : []) as Array<{
    id: string;
    currency: string | null;
    total_cents: number | string;
  }>;
  if (orders.length === 0) {
    return { ok: true, ...base, lines: [], totalCents: 0, currency: "USD" };
  }
  const { data: lineRows, error: linesError } = await admin
    .from("order_lines")
    .select("id, order_id, label, units, total_cents")
    .in("order_id", orders.map((o) => o.id))
    .order("sort_order", { ascending: true });
  if (linesError) {
    logServerError("visits.qr.guest.lines", linesError);
    return { ok: false, reason: "unavailable" };
  }
  const rank = new Map(orders.map((o, i) => [o.id, i] as const));
  const lines = ((lineRows ?? []) as Array<{ id: string; order_id?: string; label: string; units: number | string; total_cents: number | string }>)
    .map((l, i) => ({ l, i }))
    .sort((x, y) => (rank.get(x.l.order_id ?? "") ?? 0) - (rank.get(y.l.order_id ?? "") ?? 0) || x.i - y.i)
    .map(({ l }) => ({
      id: l.id,
      label: l.label,
      units: Number(l.units) || 0,
      totalCents: Number(l.total_cents) || 0,
    }));
  return {
    ok: true,
    ...base,
    currency: orders[0].currency ?? "USD",
    totalCents: orders.reduce((sum, o) => sum + (Number(o.total_cents) || 0), 0),
    lines,
  };
}
