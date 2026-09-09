import "server-only";

/**
 * Floor list: physical spaces plus the open visit (if any).
 *
 * Remaining minimum spend is a policy display (`spaces.min_spend_cents`
 * minus the open order total). It is not a charge.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function num(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export type FloorTable = {
  spaceId: string;
  name: string;
  code: string | null;
  kind: string;
  minSpendCents: number;
  visitId: string | null;
  visitVersion: number | null;
  publicToken: string | null;
  orderId: string | null;
  orderTotalCents: number;
  remainingMinSpendCents: number;
  serviceKind: "table" | "tab";
};

export async function listFloor(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; tables: FloorTable[] } | { ok: false; reason: "unavailable" }> {
  const { data: spaces, error } = await admin
    .from("spaces")
    .select("id, name, code, kind, min_spend_cents, status, sort_order")
    .eq("tenant_id", tenantId)
    .in("kind", ["table", "booth", "cabana"])
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("visits.floor.spaces", error);
    return { ok: false, reason: "unavailable" };
  }

  const { data: visits, error: visitError } = await admin
    .from("visits")
    .select("id, space_id, public_token, version, service_kind")
    .eq("tenant_id", tenantId)
    .eq("status", "open");
  if (visitError) {
    logServerError("visits.floor.visits", visitError);
    return { ok: false, reason: "unavailable" };
  }

  const visitBySpace = new Map<string, { id: string; public_token: string; version: number; service_kind: string | null }>();
  for (const v of (visits ?? []) as Array<{ id: string; space_id: string; public_token: string; version: number; service_kind?: string | null }>) {
    visitBySpace.set(v.space_id, {
      id: v.id,
      public_token: v.public_token,
      version: v.version,
      service_kind: v.service_kind ?? "table",
    });
  }

  const visitIds = [...visitBySpace.values()].map((v) => v.id);
  const orderByVisit = new Map<string, { id: string; total_cents: number }>();
  if (visitIds.length > 0) {
    const { data: orders, error: orderError } = await admin
      .from("orders")
      .select("id, visit_id, total_cents")
      .eq("tenant_id", tenantId)
      .in("visit_id", visitIds);
    if (orderError) {
      logServerError("visits.floor.orders", orderError);
      return { ok: false, reason: "unavailable" };
    }
    for (const o of (orders ?? []) as Array<{ id: string; visit_id: string; total_cents: number | string }>) {
      orderByVisit.set(o.visit_id, { id: o.id, total_cents: num(o.total_cents) });
    }
  }

  const tables: FloorTable[] = ((spaces ?? []) as Array<{
    id: string;
    name: string;
    code: string | null;
    kind: string;
    min_spend_cents: number | string | null;
  }>).map((space) => {
    const visit = visitBySpace.get(space.id) ?? null;
    const order = visit ? orderByVisit.get(visit.id) ?? null : null;
    const minSpend = num(space.min_spend_cents);
    const orderTotal = order?.total_cents ?? 0;
    return {
      spaceId: space.id,
      name: space.name,
      code: space.code,
      kind: space.kind,
      minSpendCents: minSpend,
      visitId: visit?.id ?? null,
      visitVersion: visit?.version ?? null,
      publicToken: visit?.public_token ?? null,
      orderId: order?.id ?? null,
      orderTotalCents: orderTotal,
      remainingMinSpendCents: Math.max(0, minSpend - orderTotal),
      serviceKind: visit?.service_kind === "tab" ? "tab" : "table",
    };
  });

  return { ok: true, tables };
}
