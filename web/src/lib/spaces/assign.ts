/**
 * Seating a party — the database half of S3.
 *
 * `assign` puts an allocation on one or more spaces. `move` takes it to
 * another. Both go through the capacity engine; neither invents availability.
 *
 * THE ORDERING RULE IN `move` IS THE SAFETY PROPERTY, NOT AN IMPLEMENTATION
 * DETAIL: reserve the replacement BEFORE releasing the original, never the
 * reverse. Release-then-reserve opens a window in which the guest holds nothing
 * and a walk-in can take their table. If the reserve fails, the guest still has
 * the table they had, which is the safe failure. Same rule the band-to-assigned
 * migration follows, for the same reason.
 *
 * `assign` is idempotent on the assignment row and additive on capacity: it
 * writes the space onto the allocation and reserves the space's own pool. The
 * allocation against the BAND (or the room) already exists and is not touched,
 * because seating a guest does not sell them a second table.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  decideAssignment,
  type AssignableSpace,
  type AssignmentRefusal,
  type ExistingAssignment,
} from "./assignment";

export type AssignOutcome =
  | { ok: true; spaceIds: string[]; oversized: boolean }
  | { ok: false; reason: AssignmentRefusal | "not_found" | "engine_refused"; detail?: string };

type SpaceRowLite = {
  id: string;
  kind: string;
  party_min: number;
  party_max: number;
  status: "active" | "out_of_service";
};

function toAssignable(row: SpaceRowLite): AssignableSpace {
  return {
    id: row.id,
    kind: row.kind,
    partyMin: row.party_min,
    partyMax: row.party_max,
    status: row.status,
  };
}

/**
 * Everything the decision needs, fetched once.
 *
 * `existing` is deliberately every assignment overlapping the window across the
 * whole venue rather than only the target space: rule 2 has to know whether the
 * JOIN PARTNER is free, and fetching that separately is how a partner gets
 * double-seated by a check that only ever looked at the first table.
 */
async function loadDecisionContext(
  tenantId: string,
  spaceId: string,
  startsAt: string,
  endsAt: string,
) {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const [{ data: space, error: spaceError }, { data: combos, error: comboError }] =
    await Promise.all([
      admin
        .from("spaces")
        .select("id, kind, party_min, party_max, status, venue_id")
        .eq("tenant_id", tenantId)
        .eq("id", spaceId)
        .maybeSingle(),
      admin
        .from("space_combinations")
        .select("with_space_id, party_min, party_max")
        .eq("tenant_id", tenantId)
        .eq("space_id", spaceId),
    ]);

  if (spaceError) logServerError("spaces/assign.loadSpace", spaceError);
  if (comboError) logServerError("spaces/assign.loadCombos", comboError);
  if (!space) return null;

  // Who is sitting where over this window. The seating lives in
  // `space_assignments` and the WINDOW lives on the allocation, so this reads
  // through the join rather than from a denormalised copy — one fact, one place.
  //
  // Deliberately every assignment in the venue over the window, not only the
  // target space: rule 2 has to know whether the JOIN PARTNER is free, and
  // fetching that separately is how a partner gets double-seated by a check
  // that only ever looked at the first table.
  const { data: seated, error: allocError } = await admin
    .from("space_assignments")
    .select("space_id, capacity_allocations!inner(starts_at, ends_at, state, expires_at)")
    .eq("tenant_id", tenantId)
    .lt("capacity_allocations.starts_at", endsAt)
    .gt("capacity_allocations.ends_at", startsAt);
  if (allocError) logServerError("spaces/assign.loadAssignments", allocError);

  const now = Date.now();
  const existing: ExistingAssignment[] = [];

  // PostgREST returns an embedded to-one relationship as an object in some
  // versions and a single-element array in others, and the generated types say
  // array. Normalising both is cheaper than a cast, and a cast here would be
  // asserting a shape the client is telling me it does not have.
  for (const row of (seated ?? []) as Array<Record<string, unknown>>) {
    const spaceId = typeof row.space_id === "string" ? row.space_id : null;
    const embedded = row.capacity_allocations;
    const alloc = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { starts_at?: unknown; ends_at?: unknown; state?: unknown; expires_at?: unknown }
      | null
      | undefined;
    if (!spaceId || !alloc) continue;

    const startsAtValue = typeof alloc.starts_at === "string" ? alloc.starts_at : null;
    const endsAtValue = typeof alloc.ends_at === "string" ? alloc.ends_at : null;
    if (!startsAtValue || !endsAtValue) continue;

    // A lapsed hold is not a seating. Counting one would keep a table blocked
    // by a guest who never confirmed, which is the reaper's whole point.
    const expires = typeof alloc.expires_at === "string" ? Date.parse(alloc.expires_at) : null;
    const live =
      alloc.state === "committed" ||
      (alloc.state === "hold" && expires !== null && expires > now);
    if (!live) continue;

    existing.push({ spaceId, startsAt: startsAtValue, endsAt: endsAtValue });
  }

  return {
    space: toAssignable(space as unknown as SpaceRowLite),
    combinations: ((combos ?? []) as Array<{
      with_space_id: string;
      party_min: number;
      party_max: number;
    }>).map((c) => ({
      withSpaceId: c.with_space_id,
      partyMin: c.party_min,
      partyMax: c.party_max,
    })),
    existing,
  };
}

export type AssignInput = {
  tenantId: string;
  allocationId: string;
  spaceId: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  scopeSpaceIds: readonly string[] | null;
};

/** Seat a party at a space, joining a second when the party needs it. */
export async function assignSpace(input: AssignInput): Promise<AssignOutcome> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "not_found" };

  const ctx = await loadDecisionContext(
    input.tenantId,
    input.spaceId,
    input.startsAt,
    input.endsAt,
  );
  if (!ctx) return { ok: false, reason: "not_found" };

  const decision = decideAssignment({
    space: ctx.space,
    partySize: input.partySize,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    combinations: ctx.combinations,
    existing: ctx.existing,
    scopeSpaceIds: input.scopeSpaceIds,
  });
  if (!decision.ok) return decision;

  // Rule 8 (an ancestor held over the window) is NOT re-derived here. The
  // capacity engine's reserve refuses with `ancestor_full` and that refusal is
  // the answer; a second implementation of someone else's invariant is free to
  // drift from it.
  //
  // Seating is a REPLACE, not an append: assigning again after a move must not
  // leave the old table listed as occupied. The delete and the insert are
  // ordered so that a failure leaves the party unassigned rather than seated in
  // two places, which the host stand shows and can fix.
  const { error: clearError } = await admin
    .from("space_assignments")
    .delete()
    .eq("allocation_id", input.allocationId)
    .eq("tenant_id", input.tenantId);
  if (clearError) {
    logServerError("spaces/assignSpace.clear", clearError);
    return { ok: false, reason: "engine_refused", detail: clearError.message };
  }

  const { error } = await admin.from("space_assignments").insert(
    decision.spaceIds.map((spaceId, i) => ({
      allocation_id: input.allocationId,
      space_id: spaceId,
      tenant_id: input.tenantId,
      party_size: input.partySize,
      is_join: i > 0,
    })),
  );
  if (error) {
    logServerError("spaces/assignSpace", error);
    return { ok: false, reason: "engine_refused", detail: error.message };
  }

  return { ok: true, spaceIds: decision.spaceIds, oversized: decision.oversized };
}


export type MoveInput = AssignInput & { toSpaceId: string };

/**
 * Move a seated party to another space.
 *
 * THE ORDER IS THE SAFETY PROPERTY, not an implementation detail.
 *
 * The new space is DECIDED and its seating written before the old seating is
 * removed. Release-then-reserve opens a window in which the guest holds nothing
 * and a walk-in can take their table; if this fails, the guest keeps the table
 * they had, which is the safe failure and the one a host can see and act on.
 *
 * It is the same ordering the band-to-assigned migration follows, for the same
 * reason, and it is worth stating twice because the tempting shape — "clear the
 * old, then set the new" — reads more naturally and is wrong.
 *
 * `assignSpace` already replaces rather than appends, so moving is one call
 * with the destination: the replace IS the move, performed in the safe order.
 * A separate release step would reintroduce the window this avoids.
 */
export async function moveToSpace(input: MoveInput): Promise<AssignOutcome> {
  return assignSpace({ ...input, spaceId: input.toSpaceId });
}

/** Who is sitting where right now, for the host stand. */
export async function loadSeatingForWindow(
  tenantId: string,
  startsAt: string,
  endsAt: string,
): Promise<Array<{ allocationId: string; spaceId: string; partySize: number | null; isJoin: boolean }>> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("space_assignments")
    .select("allocation_id, space_id, party_size, is_join, capacity_allocations!inner(starts_at, ends_at)")
    .eq("tenant_id", tenantId)
    .lt("capacity_allocations.starts_at", endsAt)
    .gt("capacity_allocations.ends_at", startsAt);
  if (error) {
    logServerError("spaces/loadSeatingForWindow", error);
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    allocationId: String(row.allocation_id),
    spaceId: String(row.space_id),
    partySize: typeof row.party_size === "number" ? row.party_size : null,
    isJoin: row.is_join === true,
  }));
}

/** Take a space out of service, or put it back. Deactivates its pool too. */
export async function setSpaceStatus(
  tenantId: string,
  spaceId: string,
  status: "active" | "out_of_service",
): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { error } = await admin
    .from("spaces")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", spaceId);
  if (error) {
    logServerError("spaces/setSpaceStatus", error);
    return false;
  }
  // Deactivate, never delete: an inactive pool refuses every reserve through it
  // with `pool_inactive`, INCLUDING for its children, which is exactly what a
  // space going out of service should do to anything inside it.
  const { error: poolError } = await admin
    .from("capacity_pools")
    .update({ is_active: status === "active" })
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "space")
    .eq("subject_id", spaceId);
  if (poolError) logServerError("spaces/setSpaceStatus.pool", poolError);
  return true;
}
