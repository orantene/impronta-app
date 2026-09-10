import "server-only";

/**
 * Visit / occupancy commands (L52).
 *
 * A visit is who is being served, where, during this seating. It owns table
 * state, reset, and the opaque token a table QR redirects to. It is not a
 * commercial record — that remains `orders`.
 */

import { logServerError } from "@/lib/server/safe-error";
import { generateOpaqueCode } from "@/lib/links/code";
import { createDraftOrder } from "@/lib/pos/draft";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as POS.
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

export type VisitRow = {
  id: string;
  tenantId: string;
  spaceId: string;
  publicToken: string;
  status: "open" | "closed";
  version: number;
  openedAt: string | null;
  closedAt: string | null;
  /** C07: a bar tab is occupancy that is not a table check. */
  serviceKind: "table" | "tab";
  /** T05/T07: the party this seating was opened for. Null for a bar tab. */
  partySize: number | null;
  /** T15: a second physical space joined to this same visit, or null. */
  joinedSpaceId: string | null;
};

export type OpenVisitResult =
  | { ok: true; visit: VisitRow; orderId: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "wrong_tenant"
        | "already_open"
        | "unavailable"
        | "invalid"
        | "party_too_small"
        | "party_too_large"
        | "not_combinable"
        | "joined_unavailable";
      error: string;
    };

type SpaceFitRow = {
  id: string;
  tenant_id: string;
  status: string;
  party_min?: number | null;
  party_max?: number | null;
};

export async function openVisit(
  admin: Admin,
  input: {
    tenantId: string;
    spaceId: string;
    actorUserId: string;
    serviceKind?: "table" | "tab";
    /** T05/T07: refused against the space's (or the join's) party_min/party_max when given. */
    partySize?: number;
    /** T15: a second free space to join to this one seating. Must have a `space_combinations` row with `spaceId`. */
    joinedSpaceId?: string;
  },
): Promise<OpenVisitResult> {
  if (!input.tenantId || !input.spaceId) {
    return { ok: false, reason: "invalid", error: "Missing table." };
  }
  if (input.joinedSpaceId && input.joinedSpaceId === input.spaceId) {
    return { ok: false, reason: "invalid", error: "A table cannot join itself." };
  }
  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select("id, tenant_id, status, party_min, party_max")
    .eq("id", input.spaceId)
    .maybeSingle();
  if (spaceError) {
    logServerError("visits.openVisit.space", spaceError);
    return { ok: false, reason: "unavailable", error: "Could not read the table." };
  }
  if (!space) return { ok: false, reason: "not_found", error: "That table is not on this floor." };
  const spaceRow = space as SpaceFitRow;
  if (spaceRow.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That table is not on this floor." };
  }
  if (spaceRow.status !== "active") {
    return { ok: false, reason: "invalid", error: "That table is out of service." };
  }

  const { data: existing, error: existingError } = await admin
    .from("visits")
    .select("id")
    .eq("space_id", input.spaceId)
    .eq("status", "open")
    .maybeSingle();
  if (existingError) {
    logServerError("visits.openVisit.existing", existingError);
    return { ok: false, reason: "unavailable", error: "Could not open the table." };
  }
  if (existing) {
    return { ok: false, reason: "already_open", error: "This table already has an open visit." };
  }
  const { data: joinedIntoOther, error: joinedIntoOtherError } = await admin
    .from("visits")
    .select("id")
    .eq("status", "open")
    .eq("joined_space_id", input.spaceId)
    .maybeSingle();
  if (joinedIntoOtherError) {
    logServerError("visits.openVisit.joinedIntoOther", joinedIntoOtherError);
    return { ok: false, reason: "unavailable", error: "Could not open the table." };
  }
  if (joinedIntoOther) {
    return { ok: false, reason: "already_open", error: "This table already has an open visit." };
  }

  // Fit bounds default to the primary space alone. Joining widens them to the
  // combination's own range (T15: "T7 and T8 join for a party of 5 to 8" is
  // not the same range as either table on its own).
  let fitMin = spaceRow.party_min ?? 1;
  let fitMax = spaceRow.party_max ?? fitMin;

  if (input.joinedSpaceId) {
    const { data: joinedSpace, error: joinedSpaceError } = await admin
      .from("spaces")
      .select("id, tenant_id, status")
      .eq("id", input.joinedSpaceId)
      .maybeSingle();
    if (joinedSpaceError) {
      logServerError("visits.openVisit.joinedSpace", joinedSpaceError);
      return { ok: false, reason: "unavailable", error: "Could not read the second table." };
    }
    const joinedRow = joinedSpace as { id: string; tenant_id: string; status: string } | null;
    if (!joinedRow || joinedRow.tenant_id !== input.tenantId || joinedRow.status !== "active") {
      return { ok: false, reason: "joined_unavailable", error: "That table is not on this floor." };
    }
    const { data: joinedOpen, error: joinedOpenError } = await admin
      .from("visits")
      .select("id, space_id, joined_space_id")
      .eq("status", "open")
      .eq("space_id", input.joinedSpaceId)
      .maybeSingle();
    if (joinedOpenError) {
      logServerError("visits.openVisit.joinedOpen", joinedOpenError);
      return { ok: false, reason: "unavailable", error: "Could not open the table." };
    }
    // A space already carrying an open visit through EITHER column is not a
    // candidate: `already occupied` is refused for a join exactly as it is
    // for a single table (actions.md: "occupied → refused").
    const { data: joinedAsSecondary, error: joinedAsSecondaryError } = await admin
      .from("visits")
      .select("id")
      .eq("status", "open")
      .eq("joined_space_id", input.joinedSpaceId)
      .maybeSingle();
    if (joinedAsSecondaryError) {
      logServerError("visits.openVisit.joinedAsSecondary", joinedAsSecondaryError);
      return { ok: false, reason: "unavailable", error: "Could not open the table." };
    }
    if (joinedOpen || joinedAsSecondary) {
      return { ok: false, reason: "joined_unavailable", error: "That table already has an open visit." };
    }

    const { data: combo, error: comboError } = await admin
      .from("space_combinations")
      .select("party_min, party_max")
      .eq("tenant_id", input.tenantId)
      .eq("space_id", input.spaceId)
      .eq("with_space_id", input.joinedSpaceId)
      .maybeSingle();
    if (comboError) {
      logServerError("visits.openVisit.combo", comboError);
      return { ok: false, reason: "unavailable", error: "Could not open the table." };
    }
    if (!combo) {
      return { ok: false, reason: "not_combinable", error: "These tables cannot be joined." };
    }
    const comboRow = combo as { party_min: number | string | null; party_max: number | string | null };
    fitMin = num(comboRow.party_min) || fitMin;
    fitMax = num(comboRow.party_max) || fitMax;
  }

  if (typeof input.partySize === "number") {
    if (input.partySize < fitMin) {
      return { ok: false, reason: "party_too_small", error: "This party is smaller than the table allows." };
    }
    if (input.partySize > fitMax) {
      return { ok: false, reason: "party_too_large", error: "This party is larger than the table allows." };
    }
  }

  const serviceKind = input.serviceKind === "tab" ? "tab" : "table";
  const publicToken = generateOpaqueCode();
  const now = new Date().toISOString();
  try {
    const { data: visit, error } = await admin
      .from("visits")
      .insert({
        tenant_id: input.tenantId,
        space_id: input.spaceId,
        joined_space_id: input.joinedSpaceId ?? null,
        public_token: publicToken,
        status: "open",
        version: 1,
        opened_at: now,
        opened_by: input.actorUserId,
        service_kind: serviceKind,
        party_size: typeof input.partySize === "number" ? input.partySize : null,
      })
      .select(
        "id, tenant_id, space_id, joined_space_id, public_token, status, version, opened_at, closed_at, service_kind, party_size",
      )
      .single();
    if (error || !visit) {
      if (error && (error as { code?: string }).code === "23505") {
        return { ok: false, reason: "already_open", error: "This table already has an open visit." };
      }
      logServerError("visits.openVisit.insert", error);
      return { ok: false, reason: "unavailable", error: "Could not open the table." };
    }
    const row = visit as {
      id: string;
      tenant_id: string;
      space_id: string;
      joined_space_id: string | null;
      public_token: string;
      status: "open" | "closed";
      version: number;
      opened_at: string | null;
      closed_at: string | null;
      service_kind?: string | null;
      party_size: number | string | null;
    };
    const drafted = await createDraftOrder(admin, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      context: serviceKind === "tab" ? `tab:${input.spaceId}` : `table:${input.spaceId}`,
      visitId: row.id,
      spaceId: input.spaceId,
    });
    if (!drafted.ok) {
      await admin.from("visits").update({ status: "closed", closed_at: now, version: 2 }).eq("id", row.id);
      return { ok: false, reason: "unavailable", error: drafted.error };
    }
    // Seating a space resolves "Needs reset" for it — the host is looking at
    // it right now, occupied or not, so the stale flag would only confuse the
    // next read. Best-effort, like the flag's other writers.
    const seatedSpaceIds = [input.spaceId, input.joinedSpaceId].filter((id): id is string => Boolean(id));
    const { error: clearResetError } = await admin
      .from("spaces")
      .update({ needs_reset_at: null })
      .in("id", seatedSpaceIds);
    if (clearResetError) logServerError("visits.openVisit.clearNeedsReset", clearResetError);
    return {
      ok: true,
      visit: mapVisit(row),
      orderId: drafted.orderId,
    };
  } catch (error) {
    logServerError("visits.openVisit", error);
    return { ok: false, reason: "unavailable", error: "Could not open the table." };
  }
}

export async function openTab(
  admin: Admin,
  input: { tenantId: string; spaceId: string; actorUserId: string },
): Promise<OpenVisitResult> {
  return openVisit(admin, { ...input, serviceKind: "tab" });
}

export type CloseVisitResult =
  | { ok: true; visitId: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "wrong_tenant"
        | "already_closed"
        | "outstanding"
        | "version_conflict"
        | "unavailable";
      error: string;
    };

export async function closeVisit(
  admin: Admin,
  input: {
    tenantId: string;
    visitId: string;
    expectedVersion?: number;
  },
): Promise<CloseVisitResult> {
  const { data: visit, error } = await admin
    .from("visits")
    .select("id, tenant_id, status, version, space_id, joined_space_id")
    .eq("id", input.visitId)
    .maybeSingle();
  if (error) {
    logServerError("visits.closeVisit.load", error);
    return { ok: false, reason: "unavailable", error: "Could not close the table." };
  }
  if (!visit) return { ok: false, reason: "not_found", error: "That visit is not on this floor." };
  const row = visit as {
    id: string;
    tenant_id: string;
    status: string;
    version: number;
    space_id: string;
    joined_space_id: string | null;
  };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That visit is not on this floor." };
  }
  if (row.status !== "open") {
    return { ok: false, reason: "already_closed", error: "That visit is already closed." };
  }
  if (input.expectedVersion != null && input.expectedVersion !== row.version) {
    return { ok: false, reason: "version_conflict", error: "The table changed. Reload and try again." };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, total_cents")
    .eq("visit_id", input.visitId)
    .maybeSingle();
  if (orderError) {
    logServerError("visits.closeVisit.order", orderError);
    return { ok: false, reason: "unavailable", error: "Could not close the table." };
  }
  if (order) {
    const o = order as { status: string; total_cents: number | string };
    const unpaid = o.status === "draft" || o.status === "quoted" || o.status === "pending_payment";
    if (unpaid && num(o.total_cents) > 0) {
      return { ok: false, reason: "outstanding", error: "Collect or cancel the check before resetting the table." };
    }
  }

  const now = new Date().toISOString();
  const { error: updError } = await admin
    .from("visits")
    .update({
      status: "closed",
      closed_at: now,
      version: row.version + 1,
      updated_at: now,
    })
    .eq("id", input.visitId)
    .eq("status", "open")
    .eq("version", row.version);
  if (updError) {
    logServerError("visits.closeVisit.update", updError);
    return { ok: false, reason: "unavailable", error: "Could not close the table." };
  }
  // v3.1-corrections.md p.45: closing does not hand the table straight back as
  // "Free" — it is unbussed until T24 clears this. Best-effort: a failure here
  // would hide a real close behind a display-only flag, which is a worse
  // outcome than an unmarked table, so it is not allowed to fail the request.
  const spaceIds = [row.space_id, row.joined_space_id].filter((id): id is string => id !== null);
  if (spaceIds.length > 0) {
    const { error: resetError } = await admin
      .from("spaces")
      .update({ needs_reset_at: now })
      .in("id", spaceIds);
    if (resetError) logServerError("visits.closeVisit.needsReset", resetError);
  }
  return { ok: true, visitId: input.visitId };
}

export type MoveVisitResult =
  | { ok: true; visitId: string; spaceId: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "wrong_tenant"
        | "already_open"
        | "not_open"
        | "version_conflict"
        | "unavailable"
        | "invalid"
        | "joined_visit"
        | "party_too_small"
        | "party_too_large";
      error: string;
    };

export async function moveVisitToSpace(
  admin: Admin,
  input: {
    tenantId: string;
    visitId: string;
    spaceId: string;
    expectedVersion?: number;
  },
): Promise<MoveVisitResult> {
  if (!input.spaceId) return { ok: false, reason: "invalid", error: "Missing table." };
  const { data: visit, error } = await admin
    .from("visits")
    .select("id, tenant_id, status, version, space_id, joined_space_id, party_size")
    .eq("id", input.visitId)
    .maybeSingle();
  if (error) {
    logServerError("visits.move.load", error);
    return { ok: false, reason: "unavailable", error: "Could not move the check." };
  }
  if (!visit) return { ok: false, reason: "not_found", error: "That visit is not on this floor." };
  const row = visit as {
    id: string;
    tenant_id: string;
    status: string;
    version: number;
    space_id: string;
    joined_space_id: string | null;
    party_size: number | string | null;
  };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That visit is not on this floor." };
  }
  if (row.status !== "open") {
    return { ok: false, reason: "not_open", error: "A closed visit cannot move." };
  }
  if (input.expectedVersion != null && input.expectedVersion !== row.version) {
    return { ok: false, reason: "version_conflict", error: "The table changed. Reload and try again." };
  }
  if (row.space_id === input.spaceId) {
    return { ok: true, visitId: row.id, spaceId: row.space_id };
  }
  // A joined seating spans two tables (T15). Moving one half and leaving the
  // other behind would silently orphan it as "occupied" with no visit anyone
  // can find from the floor, so a joined visit un-joins (T12) before it moves.
  if (row.joined_space_id) {
    return { ok: false, reason: "joined_visit", error: "Un-join the tables before moving this visit." };
  }

  const { data: target, error: targetError } = await admin
    .from("spaces")
    .select("id, tenant_id, status, party_min, party_max")
    .eq("id", input.spaceId)
    .maybeSingle();
  if (targetError || !target) {
    return { ok: false, reason: "not_found", error: "That table is not on this floor." };
  }
  const spaceRow = target as SpaceFitRow;
  if (spaceRow.tenant_id !== input.tenantId || spaceRow.status !== "active") {
    return { ok: false, reason: "not_found", error: "That table is not on this floor." };
  }

  const partySize = row.party_size == null ? null : num(row.party_size);
  if (partySize) {
    const fitMin = spaceRow.party_min ?? 1;
    const fitMax = spaceRow.party_max ?? fitMin;
    if (partySize < fitMin) {
      return { ok: false, reason: "party_too_small", error: "This party is smaller than the table allows." };
    }
    if (partySize > fitMax) {
      return { ok: false, reason: "party_too_large", error: "This party is larger than the table allows." };
    }
  }

  const { data: occupying, error: occupyingError } = await admin
    .from("visits")
    .select("id")
    .eq("space_id", input.spaceId)
    .eq("status", "open")
    .maybeSingle();
  if (occupyingError) {
    logServerError("visits.move.occupying", occupyingError);
    return { ok: false, reason: "unavailable", error: "Could not move the check." };
  }
  if (occupying) {
    return { ok: false, reason: "already_open", error: "The destination table already has an open visit." };
  }
  const { data: occupyingAsJoined, error: occupyingAsJoinedError } = await admin
    .from("visits")
    .select("id")
    .eq("joined_space_id", input.spaceId)
    .eq("status", "open")
    .maybeSingle();
  if (occupyingAsJoinedError) {
    logServerError("visits.move.occupyingJoined", occupyingAsJoinedError);
    return { ok: false, reason: "unavailable", error: "Could not move the check." };
  }
  if (occupyingAsJoined) {
    return { ok: false, reason: "already_open", error: "The destination table already has an open visit." };
  }

  // Captured before the update below touches the visits row: a client that
  // hands back the SAME object it was given (this module's own test fakes,
  // deliberately) would otherwise have `row.space_id` change out from under
  // this function the moment the update lands, and the wrong table would be
  // the one marked "Needs reset".
  const originSpaceId = row.space_id;

  const now = new Date().toISOString();
  const { error: updError } = await admin
    .from("visits")
    .update({ space_id: input.spaceId, version: row.version + 1, updated_at: now })
    .eq("id", input.visitId)
    .eq("status", "open")
    .eq("version", row.version);
  if (updError) {
    logServerError("visits.move.update", updError);
    return { ok: false, reason: "unavailable", error: "Could not move the check." };
  }
  await admin
    .from("orders")
    .update({ space_id: input.spaceId, source_page: `table:${input.spaceId}` })
    .eq("visit_id", input.visitId)
    .eq("tenant_id", input.tenantId);
  // v3.1-corrections.md p.45: the ORIGIN table (the one just vacated) reads
  // "Needs reset", never a stale "Free" — best-effort, see closeVisit above.
  const { error: resetError } = await admin
    .from("spaces")
    .update({ needs_reset_at: now })
    .eq("id", originSpaceId);
  if (resetError) logServerError("visits.move.needsReset", resetError);
  return { ok: true, visitId: input.visitId, spaceId: input.spaceId };
}

export type ResetTableResult =
  | { ok: true; spaceId: string }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "already_open" | "unavailable"; error: string };

/**
 * T24 — clear "Needs reset" back to plain "Free". Refused while a visit is
 * open on the space: a table cannot be BOTH occupied and reset at once, and
 * the honest next step there is to close the visit, not to paper over it.
 */
export async function resetTable(
  admin: Admin,
  input: { tenantId: string; spaceId: string },
): Promise<ResetTableResult> {
  const { data: space, error } = await admin
    .from("spaces")
    .select("id, tenant_id")
    .eq("id", input.spaceId)
    .maybeSingle();
  if (error) {
    logServerError("visits.resetTable.space", error);
    return { ok: false, reason: "unavailable", error: "Could not reset the table." };
  }
  if (!space) return { ok: false, reason: "not_found", error: "That table is not on this floor." };
  const spaceRow = space as { id: string; tenant_id: string };
  if (spaceRow.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That table is not on this floor." };
  }
  const { data: open, error: openError } = await admin
    .from("visits")
    .select("id")
    .eq("status", "open")
    .eq("space_id", input.spaceId)
    .maybeSingle();
  if (openError) {
    logServerError("visits.resetTable.open", openError);
    return { ok: false, reason: "unavailable", error: "Could not reset the table." };
  }
  if (open) {
    return { ok: false, reason: "already_open", error: "This table has an open visit. Close it first." };
  }
  const { error: updError } = await admin.from("spaces").update({ needs_reset_at: null }).eq("id", input.spaceId);
  if (updError) {
    logServerError("visits.resetTable.update", updError);
    return { ok: false, reason: "unavailable", error: "Could not reset the table." };
  }
  return { ok: true, spaceId: input.spaceId };
}

function mapVisit(row: {
  id: string;
  tenant_id: string;
  space_id: string;
  joined_space_id?: string | null;
  public_token: string;
  status: "open" | "closed";
  version: number;
  opened_at: string | null;
  closed_at: string | null;
  service_kind?: string | null;
  party_size?: number | string | null;
}): VisitRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    spaceId: row.space_id,
    publicToken: row.public_token,
    status: row.status,
    version: row.version,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    serviceKind: row.service_kind === "tab" ? "tab" : "table",
    joinedSpaceId: row.joined_space_id ?? null,
    partySize: row.party_size == null ? null : num(row.party_size) || null,
  };
}
