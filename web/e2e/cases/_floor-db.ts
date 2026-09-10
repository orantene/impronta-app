/**
 * What the Floor mode journey reads back, and what it gives the floor back.
 *
 * Its own file for the same reason `_venue-db.ts` is: each journey is proven
 * by a different session at the same time, and a shared reader everyone
 * appends to is a merge conflict pretending to be a helper. The client, the
 * tenant id and the production guard come from `_isolated-db.ts`.
 */

import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

/** The fixture floor, from `seed_journeys_program.sql`. */
export const FLOOR_T2 = "33330011-0000-4000-8000-000000000011"; // 1-2
export const FLOOR_T3 = "33330011-0000-4000-8000-000000000012"; // 1-2, combines with T2 for 3-4
export const FLOOR_T4 = "33330011-0000-4000-8000-000000000013"; // 2-4
export const FLOOR_T5 = "33330011-0000-4000-8000-000000000015"; // 1-2

const PROOF_TABLES = [FLOOR_T2, FLOOR_T3, FLOOR_T4, FLOOR_T5];

export type FloorVisitRow = {
  id: string;
  spaceId: string;
  joinedSpaceId: string | null;
  status: string;
  partySize: number | null;
  serviceKind: string | null;
  openedAt: string | null;
  closedAt: string | null;
  version: number;
};

export type FloorOrderRow = {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  visitId: string | null;
};

export type FloorTicketRow = {
  id: string;
  orderId: string;
  visitId: string | null;
  destination: string;
  status: string;
  revision: number;
  submittedAt: string | null;
};

/** The one open visit on a table, or null. */
export async function openVisitOn(spaceId: string): Promise<FloorVisitRow | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("visits")
    .select("id, space_id, joined_space_id, status, party_size, service_kind, opened_at, closed_at, version")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("space_id", spaceId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toVisit(data) : null;
}

export async function visitById(id: string): Promise<FloorVisitRow | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("visits")
    .select("id, space_id, joined_space_id, status, party_size, service_kind, opened_at, closed_at, version")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toVisit(data) : null;
}

function toVisit(row: Record<string, unknown>): FloorVisitRow {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    joinedSpaceId: row.joined_space_id == null ? null : String(row.joined_space_id),
    status: String(row.status),
    partySize: row.party_size == null ? null : Number(row.party_size),
    serviceKind: row.service_kind == null ? null : String(row.service_kind),
    openedAt: row.opened_at == null ? null : String(row.opened_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
    version: Number(row.version),
  };
}

export async function orderForVisit(visitId: string): Promise<FloorOrderRow | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("orders")
    .select("id, status, total_cents, currency, visit_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("visit_id", visitId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    status: String(data.status),
    totalCents: Number(data.total_cents),
    currency: String(data.currency),
    visitId: data.visit_id == null ? null : String(data.visit_id),
  };
}

export async function ticketsForOrder(orderId: string): Promise<FloorTicketRow[]> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("preparation_tickets")
    .select("id, order_id, visit_id, destination, status, revision, submitted_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    visitId: row.visit_id == null ? null : String(row.visit_id),
    destination: String(row.destination),
    status: String(row.status),
    revision: Number(row.revision),
    submittedAt: row.submitted_at == null ? null : String(row.submitted_at),
  }));
}

export async function needsResetAt(spaceId: string): Promise<string | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("spaces")
    .select("needs_reset_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("id", spaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.needs_reset_at == null ? null : String(data.needs_reset_at);
}

/**
 * Hand the four proof tables back: close whatever visit is still open on
 * them, cancel those visits' tickets, and clear "needs reset". The journey
 * itself ends its visits through the screen; this is for a run that stopped
 * halfway, so the next run does not meet a table this one left occupied.
 */
export async function releaseFloorProof(): Promise<void> {
  const sb = isolatedService();
  const now = new Date().toISOString();
  const { data: open, error: openErr } = await sb
    .from("visits")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("space_id", PROOF_TABLES)
    .eq("status", "open");
  if (openErr) throw new Error(openErr.message);
  const ids = (open ?? []).map((row) => String(row.id));
  if (ids.length > 0) {
    const { error: visitErr } = await sb
      .from("visits")
      .update({ status: "closed", closed_at: now, updated_at: now })
      .in("id", ids);
    if (visitErr) throw new Error(visitErr.message);
    const { error: ticketErr } = await sb
      .from("preparation_tickets")
      .update({ status: "cancelled", updated_at: now })
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .in("visit_id", ids)
      .neq("status", "cancelled");
    if (ticketErr) throw new Error(ticketErr.message);
  }
  const { error: resetErr } = await sb
    .from("spaces")
    .update({ needs_reset_at: null })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("id", PROOF_TABLES);
  if (resetErr) throw new Error(resetErr.message);
}
