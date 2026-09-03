/**
 * Reading and writing the spaces tree — the persistence half of the editor.
 *
 * WHY BULK, AND WHY IT IS THE WHOLE DESIGN
 * The exit proof for this slice is "a restaurant defines four two-tops and six
 * four-tops in under two minutes without drawing anything". Adding tables one
 * at a time cannot meet that, and a floor plan certainly cannot. So the primitive
 * is "add N tables that seat between X and Y", which creates the tables, binds a
 * pool to each per SS-1, and puts them in a band group in one call.
 *
 * A group created this way is `sell_mode = 'band'` because that is what a
 * restaurant with no floor plan is actually doing: selling "a four-top at 8pm",
 * not a specific table. Per SS-2 the group carries the pool and the members do
 * not, and the group pool is PARENTLESS so a later band-to-assigned migration
 * cannot deadlock against the room. S3 flips a venue to assigned mode.
 *
 * All venue and space persistence lives in lib/spaces/, never in a "use server"
 * file: the tenant-scoping ratchet rejects raw `.from()` there, and it is right
 * to — one module owning the table means no caller can reach it another way.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { SpaceKind, SpaceNode } from "./tree";
import { bindTreePools, type BindableSpace } from "./pools";

export type SpaceRow = {
  id: string;
  tenant_id: string;
  venue_id: string;
  parent_id: string | null;
  kind: SpaceKind;
  name: string;
  code: string | null;
  party_min: number;
  party_max: number;
  seat_count: number | null;
  status: "active" | "out_of_service";
  sort_order: number;
};

export type SpaceGroupRow = {
  id: string;
  name: string;
  kind: "party_band" | "tier" | "pool";
  party_min: number;
  party_max: number;
  sell_mode: "band" | "assigned";
  member_count: number;
};

const SPACE_COLUMNS =
  "id, tenant_id, venue_id, parent_id, kind, name, code, party_min, party_max, seat_count, status, sort_order";

export async function loadSpaces(tenantId: string, venueId: string): Promise<SpaceRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("spaces")
    .select(SPACE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    logServerError("spaces/loadSpaces", error);
    return [];
  }
  return (data as SpaceRow[] | null) ?? [];
}

export async function loadSpaceGroups(
  tenantId: string,
  venueId: string,
): Promise<SpaceGroupRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("space_groups")
    .select("id, name, kind, party_min, party_max, sell_mode, space_group_members(space_id)")
    .eq("tenant_id", tenantId)
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    logServerError("spaces/loadSpaceGroups", error);
    return [];
  }
  const rows = (data ?? []) as Array<
    Omit<SpaceGroupRow, "member_count"> & { space_group_members: { space_id: string }[] | null }
  >;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    party_min: r.party_min,
    party_max: r.party_max,
    sell_mode: r.sell_mode,
    member_count: r.space_group_members?.length ?? 0,
  }));
}

export async function addRoom(
  tenantId: string,
  venueId: string,
  name: string,
): Promise<SpaceRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("spaces")
    .insert({ tenant_id: tenantId, venue_id: venueId, kind: "room", name })
    .select(SPACE_COLUMNS)
    .maybeSingle();
  if (error) {
    logServerError("spaces/addRoom", error);
    return null;
  }
  const room = (data as SpaceRow | null) ?? null;
  if (room) {
    // A room can be held whole (a buy-out), so it carries a pool. Its capacity
    // is the tables it will contain; until they exist, the count it can sell.
    await bindTreePools([
      {
        id: room.id,
        kind: "room",
        parentId: null,
        tenantId,
        unitsTotal: 0,
        unitLabel: "room",
      },
    ]);
  }
  return room;
}

export type AddTablesInput = {
  roomId: string;
  count: number;
  partyMin: number;
  partyMax: number;
  /** "T" gives T1, T2, … Numbering continues past whatever already exists. */
  codePrefix: string;
  /** Creates or reuses a band group with these tables as members. */
  groupName: string;
};

export type AddTablesResult =
  | { ok: true; created: number; groupId: string; poolsBound: number }
  | { ok: false; error: string };

/**
 * Add N identical tables to a room, bind a pool to each, and band them.
 *
 * One call, because the exit proof is measured in minutes and the alternative
 * is ten round trips through a form. The room's own pool capacity grows by the
 * number of tables added, so a room buy-out blocks exactly what is in it.
 */
export async function addTables(
  tenantId: string,
  venueId: string,
  input: AddTablesInput,
): Promise<AddTablesResult> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Unavailable." };

  const existing = await loadSpaces(tenantId, venueId);
  const room = existing.find((s) => s.id === input.roomId && s.kind === "room");
  if (!room) return { ok: false, error: "That room is not in this venue." };

  // Continue the numbering rather than restarting it, so adding four more
  // two-tops to a room that has six does not collide on the unique code index.
  const prefix = input.codePrefix.trim() || "T";
  const used = new Set(
    existing.map((s) => (s.code ?? "").toLowerCase()).filter((c) => c.length > 0),
  );
  const codes: string[] = [];
  let n = 1;
  while (codes.length < input.count) {
    const candidate = `${prefix}${n}`;
    if (!used.has(candidate.toLowerCase())) {
      codes.push(candidate);
      used.add(candidate.toLowerCase());
    }
    n += 1;
    if (n > 10_000) return { ok: false, error: "Could not find free table codes." };
  }

  const rows = codes.map((code, i) => ({
    tenant_id: tenantId,
    venue_id: venueId,
    parent_id: room.id,
    kind: "table" as const,
    name: `${prefix}${code.slice(prefix.length)}`,
    code,
    party_min: input.partyMin,
    party_max: input.partyMax,
    seat_count: input.partyMax,
    sort_order: existing.length + i,
  }));

  const { data: inserted, error } = await admin
    .from("spaces")
    .insert(rows)
    .select(SPACE_COLUMNS);
  if (error) {
    logServerError("spaces/addTables", error);
    return { ok: false, error: "Could not add the tables." };
  }
  const tables = (inserted as SpaceRow[] | null) ?? [];

  // The group first: in band mode IT carries the pool, parentless, and the
  // tables do not (SS-2). Their own pools arrive in S3 when a venue moves to
  // assigned mode, and the group's is drained and deactivated in the same pass.
  // Look up, then insert — not an upsert. The uniqueness that matters is on
  // `lower(name)`, and PostgREST cannot use an expression index as an
  // onConflict target, so an upsert here would either fail or quietly create a
  // second "Two-tops". The index in 20261229000222 is still what guarantees it
  // under a race; this is the read path that makes the common case work.
  const existingGroup = (await loadSpaceGroups(tenantId, venueId)).find(
    (g) => g.name.toLowerCase() === input.groupName.trim().toLowerCase(),
  );

  let groupId: string;
  if (existingGroup) {
    groupId = existingGroup.id;
  } else {
    const { data: groupRow, error: groupError } = await admin
      .from("space_groups")
      .insert({
        tenant_id: tenantId,
        venue_id: venueId,
        name: input.groupName.trim(),
        kind: "party_band",
        party_min: input.partyMin,
        party_max: input.partyMax,
        sell_mode: "band",
      })
      .select("id")
      .maybeSingle();
    if (groupError || !groupRow) {
      logServerError("spaces/addTables.group", groupError ?? "no group row");
      return { ok: false, error: "Tables were added but the group was not." };
    }
    groupId = (groupRow as { id: string }).id;
  }

  const { error: memberError } = await admin.from("space_group_members").insert(
    tables.map((t, i) => ({
      group_id: groupId,
      space_id: t.id,
      tenant_id: tenantId,
      sort_order: i,
    })),
  );
  if (memberError) logServerError("spaces/addTables.members", memberError);

  // The band's pool: one unit per member table, PARENTLESS (see SS-2 and the
  // migration header — a parented band pool deadlocks its own migration).
  const memberTotal = await countGroupMembers(tenantId, groupId);
  const { error: poolError } = await admin.rpc("upsert_capacity_pool", {
    p_tenant_id: tenantId,
    p_subject_kind: "space_group",
    p_subject_id: groupId,
    p_units_total: memberTotal,
    p_pool_key: "default",
    p_parent_pool_id: null,
    p_unit_label: "table",
    p_is_active: true,
  });
  if (poolError) logServerError("spaces/addTables.groupPool", poolError);

  // The room can still be bought out, and its capacity is what it contains.
  const roomTables = (await loadSpaces(tenantId, venueId)).filter(
    (s) => s.parent_id === room.id && s.kind === "table",
  );
  const roomPool: BindableSpace = {
    id: room.id,
    kind: "room",
    parentId: null,
    tenantId,
    unitsTotal: roomTables.length,
    unitLabel: "room",
  };
  const bound = await bindTreePools([roomPool]);

  return { ok: true, created: tables.length, groupId, poolsBound: bound.bound };
}

async function countGroupMembers(tenantId: string, groupId: string): Promise<number> {
  const admin = createServiceRoleClient();
  if (!admin) return 0;
  const { count, error } = await admin
    .from("space_group_members")
    .select("space_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("group_id", groupId);
  if (error) {
    logServerError("spaces/countGroupMembers", error);
    return 0;
  }
  return count ?? 0;
}

/** The tree shape the invariant functions want, from the rows the editor holds. */
export function toNodes(rows: readonly SpaceRow[]): SpaceNode[] {
  return rows.map((r) => ({ id: r.id, kind: r.kind, parentId: r.parent_id }));
}
