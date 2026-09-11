import "server-only";

/**
 * Preparation tickets (L52, L53). Separate from payment.
 *
 * Newly submitted, changed after submission, cancelled, station, acknowledged,
 * duplicate-vs-amendment: two burgers then one "no onion" is a revision bump
 * on the same ticket, not a second ticket. Sellable limits stay on
 * `offering_stock`; this module does not invent inventory.
 */

import { logServerError } from "@/lib/server/safe-error";
import { notifyTicketReady } from "@/lib/preparation/notify-ready";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PrepDestination = "table" | "pickup" | "counter";
export type PrepStatus = "queued" | "acknowledged" | "ready" | "cancelled";

export type PrepTicketView = {
  id: string;
  orderId: string;
  visitId: string | null;
  station: string;
  destination: PrepDestination;
  status: PrepStatus;
  revision: number;
  promisedAt: string | null;
  handedOffAt: string | null;
  /**
   * The table the food goes to, as the code printed on the floor ("T4", or
   * "T2 + T3" when two were pushed together). Null for a counter or pickup
   * ticket, and for a table ticket whose visit could not be read.
   *
   * WHY IT IS ON THE TICKET. A station board with two "House pizza × 1" cards
   * both marked "Destination: Table" is a board a cook cannot run: the ticket
   * has to say WHERE, or the food goes to whoever shouts first. Seen on the QA
   * host with two open table checks on one evening.
   */
  tableCode: string | null;
  snapshotLines: Array<{ id: string; label: string; units: number }>;
};

/**
 * The table code(s) for each visit, looked up once for a set of visits.
 *
 * A read failure returns an empty map rather than failing the board: the
 * ticket is still the ticket, and a missing table code is a lesser wrong than
 * a station that cannot see its queue. Logged so it is not silent.
 */
async function tableCodesForVisits(
  admin: Admin,
  visitIds: readonly string[],
): Promise<Map<string, string>> {
  const codes = new Map<string, string>();
  if (visitIds.length === 0) return codes;
  const { data: visits, error: visitError } = await admin
    .from("visits")
    .select("id, space_id, joined_space_id")
    .in("id", visitIds);
  if (visitError) {
    logServerError("prep.board.visits", visitError);
    return codes;
  }
  const visitRows = (visits ?? []) as Array<{
    id: string;
    space_id: string | null;
    joined_space_id: string | null;
  }>;
  const spaceIds = Array.from(
    new Set(
      visitRows
        .flatMap((v) => [v.space_id, v.joined_space_id])
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (spaceIds.length === 0) return codes;
  const { data: spaces, error: spaceError } = await admin
    .from("spaces")
    .select("id, code, name")
    .in("id", spaceIds);
  if (spaceError) {
    logServerError("prep.board.spaces", spaceError);
    return codes;
  }
  const labels = new Map<string, string>();
  for (const s of (spaces ?? []) as Array<{ id: string; code: string | null; name: string | null }>) {
    const label = s.code ?? s.name;
    if (label) labels.set(s.id, label);
  }
  for (const v of visitRows) {
    const parts = [v.space_id, v.joined_space_id]
      .map((id) => (id ? labels.get(id) : undefined))
      .filter((label): label is string => Boolean(label));
    if (parts.length > 0) codes.set(v.id, parts.join(" + "));
  }
  return codes;
}

type LineSnap = { id: string; label: string; units: number | string };

function snapLines(rows: LineSnap[]): Array<{ id: string; label: string; units: number }> {
  return rows.map((l) => ({ id: l.id, label: l.label, units: Number(l.units) || 0 }));
}

type SnapshotLines = PrepTicketView["snapshotLines"];

async function loadSnapshotLines(
  admin: Admin,
  ticketId: string,
  revision: number,
): Promise<{ ok: true; lines: SnapshotLines } | { ok: false }> {
  const { data: rev, error } = await admin
    .from("preparation_ticket_revisions")
    .select("snapshot")
    .eq("ticket_id", ticketId)
    .eq("revision", revision)
    .maybeSingle();
  if (error) {
    logServerError("prep.revision", error);
    return { ok: false };
  }
  const snapshot = (rev as { snapshot?: { lines?: SnapshotLines } } | null)?.snapshot;
  return { ok: true, lines: snapshot?.lines ?? [] };
}

export type SubmitPrepResult =
  | { ok: true; ticketId: string; revision: number; amended: boolean }
  | {
      ok: false;
      reason: "not_found" | "wrong_tenant" | "empty" | "unavailable";
      error: string;
    };

export async function submitOrderToPreparation(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    destination?: PrepDestination;
    station?: string;
    promisedAt?: string | null;
  },
): Promise<SubmitPrepResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, visit_id, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("prep.submit.load", error);
    return { ok: false, reason: "unavailable", error: "Could not send to preparation." };
  }
  if (!order) return { ok: false, reason: "not_found", error: "Sale not found." };
  const row = order as { id: string; tenant_id: string; visit_id: string | null; status: string };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "Sale not found." };
  }

  const { data: lineRows, error: linesError } = await admin
    .from("order_lines")
    .select("id, label, units")
    .eq("order_id", input.orderId)
    .order("sort_order", { ascending: true });
  if (linesError) {
    logServerError("prep.submit.lines", linesError);
    return { ok: false, reason: "unavailable", error: "Could not send to preparation." };
  }
  const lines = (lineRows ?? []) as LineSnap[];
  if (lines.length === 0) {
    return { ok: false, reason: "empty", error: "Add items before sending to preparation." };
  }

  const destination: PrepDestination =
    input.destination ?? (row.visit_id ? "table" : "counter");
  const station = (input.station ?? "kitchen").trim() || "kitchen";
  const snapshot = { lines: snapLines(lines), destination, station };
  const now = new Date().toISOString();

  const { data: active, error: activeError } = await admin
    .from("preparation_tickets")
    .select("id, revision, status")
    .eq("order_id", input.orderId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (activeError) {
    logServerError("prep.submit.active", activeError);
    return { ok: false, reason: "unavailable", error: "Could not send to preparation." };
  }

  if (active) {
    const ticket = active as { id: string; revision: number; status: string };
    const nextRevision = ticket.revision + 1;
    const { error: updError } = await admin
      .from("preparation_tickets")
      .update({
        revision: nextRevision,
        status: "queued",
        destination,
        station,
        promised_at: input.promisedAt ?? null,
        submitted_at: now,
        acknowledged_at: null,
        ready_at: null,
        updated_at: now,
      })
      .eq("id", ticket.id)
      .neq("status", "cancelled");
    if (updError) {
      logServerError("prep.submit.amend", updError);
      return { ok: false, reason: "unavailable", error: "Could not amend the ticket." };
    }
    const { error: revError } = await admin.from("preparation_ticket_revisions").insert({
      ticket_id: ticket.id,
      revision: nextRevision,
      snapshot,
    });
    if (revError) {
      logServerError("prep.submit.amendRevision", revError);
      return { ok: false, reason: "unavailable", error: "Could not amend the ticket." };
    }
    return { ok: true, ticketId: ticket.id, revision: nextRevision, amended: true };
  }

  const { data: created, error: insError } = await admin
    .from("preparation_tickets")
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId,
      visit_id: row.visit_id,
      station,
      destination,
      status: "queued",
      revision: 1,
      promised_at: input.promisedAt ?? null,
      submitted_at: now,
    })
    .select("id")
    .single();
  if (insError || !created) {
    logServerError("prep.submit.insert", insError);
    return { ok: false, reason: "unavailable", error: "Could not send to preparation." };
  }
  const ticketId = (created as { id: string }).id;
  const { error: revError } = await admin.from("preparation_ticket_revisions").insert({
    ticket_id: ticketId,
    revision: 1,
    snapshot,
  });
  if (revError) {
    logServerError("prep.submit.revision", revError);
    return { ok: false, reason: "unavailable", error: "Could not send to preparation." };
  }
  return { ok: true, ticketId, revision: 1, amended: false };
}

export type TicketActionResult =
  | { ok: true; ticketId: string }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "invalid_state" | "unavailable"; error: string };

async function loadTicket(
  admin: Admin,
  tenantId: string,
  ticketId: string,
): Promise<{ id: string; tenant_id: string; status: string } | { ok: false; reason: "not_found" | "wrong_tenant" | "unavailable" }> {
  const { data, error } = await admin
    .from("preparation_tickets")
    .select("id, tenant_id, status")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) {
    logServerError("prep.ticket.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as { id: string; tenant_id: string; status: string };
  if (row.tenant_id !== tenantId) return { ok: false, reason: "wrong_tenant" };
  return row;
}

export async function acknowledgeTicket(
  admin: Admin,
  input: { tenantId: string; ticketId: string },
): Promise<TicketActionResult> {
  const loaded = await loadTicket(admin, input.tenantId, input.ticketId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Ticket not found." };
  if (loaded.status !== "queued") {
    return { ok: false, reason: "invalid_state", error: "Only a queued ticket can be acknowledged." };
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("preparation_tickets")
    .update({ status: "acknowledged", acknowledged_at: now, updated_at: now })
    .eq("id", input.ticketId)
    .eq("status", "queued");
  if (error) {
    logServerError("prep.acknowledge", error);
    return { ok: false, reason: "unavailable", error: "Could not acknowledge." };
  }
  return { ok: true, ticketId: input.ticketId };
}

export async function markTicketReady(
  admin: Admin,
  input: { tenantId: string; ticketId: string },
): Promise<TicketActionResult> {
  const loaded = await loadTicket(admin, input.tenantId, input.ticketId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Ticket not found." };
  if (loaded.status !== "queued" && loaded.status !== "acknowledged") {
    return { ok: false, reason: "invalid_state", error: "This ticket cannot be marked ready." };
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("preparation_tickets")
    .update({ status: "ready", ready_at: now, updated_at: now })
    .eq("id", input.ticketId)
    .in("status", ["queued", "acknowledged"]);
  if (error) {
    logServerError("prep.ready", error);
    return { ok: false, reason: "unavailable", error: "Could not mark ready." };
  }
  void notifyTicketReady(admin, input);
  return { ok: true, ticketId: input.ticketId };
}

export async function recordHandoff(
  admin: Admin,
  input: { tenantId: string; ticketId: string },
): Promise<TicketActionResult> {
  const loaded = await loadTicket(admin, input.tenantId, input.ticketId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Ticket not found." };
  if (loaded.status !== "ready") {
    return { ok: false, reason: "invalid_state", error: "Handoff is only for a ready order." };
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("preparation_tickets")
    .update({ handed_off_at: now, updated_at: now })
    .eq("id", input.ticketId)
    .eq("status", "ready");
  if (error) {
    logServerError("prep.handoff", error);
    return { ok: false, reason: "unavailable", error: "Could not record handoff." };
  }
  return { ok: true, ticketId: input.ticketId };
}

export async function cancelTicket(
  admin: Admin,
  input: { tenantId: string; ticketId: string },
): Promise<TicketActionResult> {
  const loaded = await loadTicket(admin, input.tenantId, input.ticketId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Ticket not found." };
  if (loaded.status === "cancelled") {
    return { ok: false, reason: "invalid_state", error: "Already cancelled." };
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("preparation_tickets")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", input.ticketId)
    .neq("status", "cancelled");
  if (error) {
    logServerError("prep.cancel", error);
    return { ok: false, reason: "unavailable", error: "Could not cancel." };
  }
  return { ok: true, ticketId: input.ticketId };
}

export async function loadActiveTicketForOrder(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<{ ok: true; ticket: PrepTicketView | null } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("preparation_tickets")
    .select("id, order_id, visit_id, station, destination, status, revision, promised_at, handed_off_at")
    .eq("order_id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error) {
    logServerError("prep.activeTicket", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: true, ticket: null };
  const row = data as {
    id: string;
    order_id: string;
    visit_id: string | null;
    station: string;
    destination: PrepDestination;
    status: PrepStatus;
    revision: number;
    promised_at: string | null;
    handed_off_at: string | null;
  };
  const snap = await loadSnapshotLines(admin, row.id, row.revision);
  if (!snap.ok) return { ok: false, reason: "unavailable" };
  const codes = await tableCodesForVisits(admin, row.visit_id ? [row.visit_id] : []);
  return {
    ok: true,
    ticket: {
      id: row.id,
      orderId: row.order_id,
      visitId: row.visit_id,
      station: row.station,
      destination: row.destination,
      status: row.status,
      revision: row.revision,
      promisedAt: row.promised_at,
      handedOffAt: row.handed_off_at,
      tableCode: row.visit_id ? (codes.get(row.visit_id) ?? null) : null,
      snapshotLines: snap.lines,
    },
  };
}

export async function listBoard(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; tickets: PrepTicketView[] } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("preparation_tickets")
    .select("id, order_id, visit_id, station, destination, status, revision, promised_at, handed_off_at")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .order("submitted_at", { ascending: true });
  if (error) {
    logServerError("prep.board", error);
    return { ok: false, reason: "unavailable" };
  }
  const tickets: PrepTicketView[] = [];
  const rows = (data ?? []) as Array<{ visit_id: string | null }>;
  const codes = await tableCodesForVisits(
    admin,
    rows.map((r) => r.visit_id).filter((id): id is string => typeof id === "string"),
  );
  for (const row of (data ?? []) as Array<{
    id: string;
    order_id: string;
    visit_id: string | null;
    station: string;
    destination: PrepDestination;
    status: PrepStatus;
    revision: number;
    promised_at: string | null;
    handed_off_at: string | null;
  }>) {
    const snap = await loadSnapshotLines(admin, row.id, row.revision);
    if (!snap.ok) return { ok: false, reason: "unavailable" };
    tickets.push({
      id: row.id,
      orderId: row.order_id,
      visitId: row.visit_id,
      station: row.station,
      destination: row.destination,
      status: row.status,
      revision: row.revision,
      promisedAt: row.promised_at,
      handedOffAt: row.handed_off_at,
      tableCode: row.visit_id ? (codes.get(row.visit_id) ?? null) : null,
      snapshotLines: snap.lines,
    });
  }
  return { ok: true, tickets };
}
