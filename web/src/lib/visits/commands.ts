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
};

export type OpenVisitResult =
  | { ok: true; visit: VisitRow; orderId: string }
  | {
      ok: false;
      reason: "not_found" | "wrong_tenant" | "already_open" | "unavailable" | "invalid";
      error: string;
    };

export async function openVisit(
  admin: Admin,
  input: {
    tenantId: string;
    spaceId: string;
    actorUserId: string;
  },
): Promise<OpenVisitResult> {
  if (!input.tenantId || !input.spaceId) {
    return { ok: false, reason: "invalid", error: "Missing table." };
  }
  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select("id, tenant_id, status")
    .eq("id", input.spaceId)
    .maybeSingle();
  if (spaceError) {
    logServerError("visits.openVisit.space", spaceError);
    return { ok: false, reason: "unavailable", error: "Could not read the table." };
  }
  if (!space) return { ok: false, reason: "not_found", error: "That table is not on this floor." };
  const spaceRow = space as { id: string; tenant_id: string; status: string };
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

  const publicToken = generateOpaqueCode();
  const now = new Date().toISOString();
  try {
    const { data: visit, error } = await admin
      .from("visits")
      .insert({
        tenant_id: input.tenantId,
        space_id: input.spaceId,
        public_token: publicToken,
        status: "open",
        version: 1,
        opened_at: now,
        opened_by: input.actorUserId,
      })
      .select("id, tenant_id, space_id, public_token, status, version, opened_at, closed_at")
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
      public_token: string;
      status: "open" | "closed";
      version: number;
      opened_at: string | null;
      closed_at: string | null;
    };
    const drafted = await createDraftOrder(admin, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      context: `table:${input.spaceId}`,
      visitId: row.id,
      spaceId: input.spaceId,
    });
    if (!drafted.ok) {
      await admin.from("visits").update({ status: "closed", closed_at: now, version: 2 }).eq("id", row.id);
      return { ok: false, reason: "unavailable", error: drafted.error };
    }
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
    .select("id, tenant_id, status, version")
    .eq("id", input.visitId)
    .maybeSingle();
  if (error) {
    logServerError("visits.closeVisit.load", error);
    return { ok: false, reason: "unavailable", error: "Could not close the table." };
  }
  if (!visit) return { ok: false, reason: "not_found", error: "That visit is not on this floor." };
  const row = visit as { id: string; tenant_id: string; status: string; version: number };
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
  return { ok: true, visitId: input.visitId };
}

export type MoveVisitResult =
  | { ok: true; visitId: string; spaceId: string }
  | {
      ok: false;
      reason: "not_found" | "wrong_tenant" | "already_open" | "not_open" | "version_conflict" | "unavailable" | "invalid";
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
    .select("id, tenant_id, status, version, space_id")
    .eq("id", input.visitId)
    .maybeSingle();
  if (error) {
    logServerError("visits.move.load", error);
    return { ok: false, reason: "unavailable", error: "Could not move the check." };
  }
  if (!visit) return { ok: false, reason: "not_found", error: "That visit is not on this floor." };
  const row = visit as { id: string; tenant_id: string; status: string; version: number; space_id: string };
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

  const { data: target, error: targetError } = await admin
    .from("spaces")
    .select("id, tenant_id, status")
    .eq("id", input.spaceId)
    .maybeSingle();
  if (targetError || !target) {
    return { ok: false, reason: "not_found", error: "That table is not on this floor." };
  }
  const spaceRow = target as { id: string; tenant_id: string; status: string };
  if (spaceRow.tenant_id !== input.tenantId || spaceRow.status !== "active") {
    return { ok: false, reason: "not_found", error: "That table is not on this floor." };
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
  return { ok: true, visitId: input.visitId, spaceId: input.spaceId };
}

function mapVisit(row: {
  id: string;
  tenant_id: string;
  space_id: string;
  public_token: string;
  status: "open" | "closed";
  version: number;
  opened_at: string | null;
  closed_at: string | null;
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
  };
}
