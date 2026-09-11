/**
 * What the venue journey reads back, and what it gives the floor back.
 *
 * Its own file rather than more of `_isolated-db.ts` for one reason: every
 * case in this program is being proven by a different session at the same
 * time, and a shared reader that three of them are appending to is a merge
 * conflict pretending to be a helper. The service-role client, the tenant id
 * and the production guard all still come from `_isolated-db.ts`, there is
 * exactly one of those and it is not this file's to duplicate.
 */

import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

/** T4, the four-top the fixture floor carries, from `seed_journeys_program.sql`. */
export const TABLE_FOUR_TOP_ID = "33330011-0000-4000-8000-000000000013";

/** T2 and T3, the two two-tops that combine for three to four. */
export const TABLE_TWO_TOP_ID = "33330011-0000-4000-8000-000000000011";
export const TABLE_THREE_TOP_ID = "33330011-0000-4000-8000-000000000012";

/** The band pool a walk-in claims a unit from (`Two-to-four tops`). */
export const TABLE_BAND_POOL_ID = "33330020-0000-4000-8000-000000000002";

export type VenueAdmissionRow = {
  id: string;
  spaceId: string | null;
  partySize: number;
  admittedCount: number;
  seatedAt: string | null;
  allocationId: string | null;
};

export type VenueVisitRow = {
  id: string;
  spaceId: string;
  status: string;
  partySize: number | null;
  serviceKind: string | null;
  closedAt: string | null;
};

export type VenueOrderRow = {
  id: string;
  status: string;
  totalCents: number;
  visitId: string | null;
};

export type VenueTicketRow = {
  id: string;
  orderId: string;
  visitId: string | null;
  station: string;
  destination: string;
  status: string;
  revision: number;
  acknowledgedAt: string | null;
  promisedAt: string | null;
};

export type VenueJourneyRows = {
  tableFourTopId: string;
  tableNeedsResetAt: string | null;
  admission: VenueAdmissionRow | null;
  visit: VenueVisitRow | null;
  order: VenueOrderRow | null;
  ticket: VenueTicketRow | null;
  /** How many tickets this order has AT ALL, an amendment must not add one. */
  ticketCount: number;
  /** How many snapshots the ticket carries, one per send. */
  revisionCount: number;
};

/**
 * Everything the journey wrote, looked up the way a person would: the party by
 * the name typed at the desk, the rest by what that party is attached to.
 */
export async function venueJourneyRows(
  holderName: string,
  orderId?: string,
): Promise<VenueJourneyRows> {
  const sb = isolatedService();

  const { data: space, error: spaceErr } = await sb
    .from("spaces")
    .select("id, needs_reset_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("id", TABLE_FOUR_TOP_ID)
    .maybeSingle();
  if (spaceErr) throw new Error(spaceErr.message);

  const { data: admissionRow, error: admErr } = await sb
    .from("admissions")
    .select("id, space_id, party_size, admitted_count, seated_at, allocation_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("holder_name", holderName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (admErr) throw new Error(admErr.message);

  const admission: VenueAdmissionRow | null = admissionRow
    ? {
        id: String(admissionRow.id),
        spaceId: (admissionRow.space_id as string | null) ?? null,
        partySize: Number(admissionRow.party_size),
        admittedCount: Number(admissionRow.admitted_count),
        seatedAt: (admissionRow.seated_at as string | null) ?? null,
        allocationId: (admissionRow.allocation_id as string | null) ?? null,
      }
    : null;

  // The visit is found through the ORDER when there is one, so a leftover visit
  // on the same table from another run cannot be reported as this journey's.
  let visit: VenueVisitRow | null = null;
  let order: VenueOrderRow | null = null;

  if (orderId) {
    const { data: orderRow, error: orderErr } = await sb
      .from("orders")
      .select("id, status, total_cents, visit_id")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (orderRow) {
      order = {
        id: String(orderRow.id),
        status: String(orderRow.status),
        totalCents: Number(orderRow.total_cents),
        visitId: (orderRow.visit_id as string | null) ?? null,
      };
    }
  }

  const visitId = order?.visitId ?? null;
  if (visitId) {
    const { data: visitRow, error: visitErr } = await sb
      .from("visits")
      .select("id, space_id, status, party_size, service_kind, closed_at")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("id", visitId)
      .maybeSingle();
    if (visitErr) throw new Error(visitErr.message);
    if (visitRow) {
      visit = {
        id: String(visitRow.id),
        spaceId: String(visitRow.space_id),
        status: String(visitRow.status),
        partySize: visitRow.party_size == null ? null : Number(visitRow.party_size),
        serviceKind: (visitRow.service_kind as string | null) ?? null,
        closedAt: (visitRow.closed_at as string | null) ?? null,
      };
    }
  }

  let ticket: VenueTicketRow | null = null;
  let ticketCount = 0;
  let revisionCount = 0;
  if (orderId) {
    const { data: tickets, error: ticketErr } = await sb
      .from("preparation_tickets")
      .select(
        "id, order_id, visit_id, station, destination, status, revision, acknowledged_at, promised_at",
      )
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("order_id", orderId);
    if (ticketErr) throw new Error(ticketErr.message);
    const rows = tickets ?? [];
    ticketCount = rows.length;
    const first = rows[0];
    if (first) {
      ticket = {
        id: String(first.id),
        orderId: String(first.order_id),
        visitId: (first.visit_id as string | null) ?? null,
        station: String(first.station),
        destination: String(first.destination),
        status: String(first.status),
        revision: Number(first.revision),
        acknowledgedAt: (first.acknowledged_at as string | null) ?? null,
        promisedAt: (first.promised_at as string | null) ?? null,
      };
      const { count, error: revErr } = await sb
        .from("preparation_ticket_revisions")
        .select("id", { count: "exact", head: true })
        .eq("ticket_id", first.id);
      if (revErr) throw new Error(revErr.message);
      revisionCount = count ?? 0;
    }
  }

  return {
    tableFourTopId: TABLE_FOUR_TOP_ID,
    tableNeedsResetAt: (space?.needs_reset_at as string | null) ?? null,
    admission,
    visit,
    order,
    ticket,
    ticketCount,
    revisionCount,
  };
}

/**
 * Hand the floor and the band pool back after a run.
 *
 * A walk-in COMMITS a unit of the four-unit band pool and there is no payment
 * step that would ever release it, so without this the fixture loses a table
 * per run and the fifth run reads "the room is full", a fixture fault that
 * would be reported as an availability bug.
 */
export async function releaseVenueJourneyParty(): Promise<void> {
  const sb = isolatedService();
  const now = new Date().toISOString();

  const { data: parties, error: partyErr } = await sb
    .from("admissions")
    .select("id, allocation_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .like("holder_name", "Prove Tables %");
  if (partyErr) throw new Error(partyErr.message);

  const allocationIds = (parties ?? [])
    .map((row) => (row.allocation_id as string | null) ?? null)
    .filter((id): id is string => Boolean(id));
  if (allocationIds.length > 0) {
    const { error: allocErr } = await sb
      .from("capacity_allocations")
      .update({ state: "released", released_at: now })
      .in("id", allocationIds)
      .in("state", ["hold", "committed"]);
    if (allocErr) throw new Error(allocErr.message);
  }

  const admissionIds = (parties ?? []).map((row) => String(row.id));
  if (admissionIds.length > 0) {
    const { error: voidErr } = await sb
      .from("admissions")
      .update({ status: "void", updated_at: now })
      .in("id", admissionIds);
    if (voidErr) throw new Error(voidErr.message);
  }

  const floor = [TABLE_FOUR_TOP_ID, TABLE_TWO_TOP_ID, TABLE_THREE_TOP_ID];
  const { data: openVisits, error: openErr } = await sb
    .from("visits")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("space_id", floor)
    .eq("status", "open");
  if (openErr) throw new Error(openErr.message);
  const openVisitIds = (openVisits ?? []).map((row) => String(row.id));

  const { error: visitErr } = await sb
    .from("visits")
    .update({ status: "closed", closed_at: now, updated_at: now })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("space_id", floor)
    .eq("status", "open");
  if (visitErr) throw new Error(visitErr.message);

  // A run that stopped between "sent to the kitchen" and "collected" leaves
  // its ticket queued on the board, where the next run's locator would find
  // it first. The product itself does not cancel a visit's tickets when the
  // visit closes (noted in the README); this teardown does, for its own.
  if (openVisitIds.length > 0) {
    const { error: ticketErr } = await sb
      .from("preparation_tickets")
      .update({ status: "cancelled", updated_at: now })
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .in("visit_id", openVisitIds)
      .neq("status", "cancelled");
    if (ticketErr) throw new Error(ticketErr.message);
  }

  const { error: resetErr } = await sb
    .from("spaces")
    .update({ needs_reset_at: null })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("id", floor);
  if (resetErr) throw new Error(resetErr.message);
}
