import "server-only";

/**
 * Floor list: physical spaces plus the open visit (if any) — T01 (spec
 * docs/plans/program/specs/tables.md, "Floor — the live map of tables and
 * their state").
 *
 * THREE STATES, NOT TWO. "Free" and "occupied" fall straight out of
 * `visits.status = 'open'`. "Held" does not have a column: a table with no
 * open visit but an admission (a reservation, per L52 — there is no separate
 * reservations table) assigned to it and due any minute is not the same fact
 * as an empty table, and showing it as plain "Free" would let a host seat a
 * walk-in onto a table that is about to be needed. `deriveHeldSpaces` below
 * computes it at read time from `admissions` + the venue's own rules, reusing
 * `bookState` from `lib/reservations/book.ts` — the exact function the
 * reservations desk (T-none, `admin/reservations`) already uses to decide
 * "arriving" vs "late", so this floor and that book cannot disagree about
 * what "about to arrive" means.
 *
 * A JOINED VISIT OCCUPIES TWO SPACES. T15 lets a visit carry a second space
 * in `visits.joined_space_id` (20261231002100). Both the primary and the
 * joined space read as occupied by the SAME visit and order — there is still
 * exactly one check (L52) — and `joinedWithSpaceId` / `joinedFromSpaceId`
 * tell the floor which half is which so a card can say "joined with T8"
 * instead of showing a second, orphaned occupancy.
 *
 * Remaining minimum spend is a policy display (`spaces.min_spend_cents`
 * minus the open order total). It is not a charge.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadDefaultVenue } from "@/lib/spaces/venues";
import { loadVenueServiceConfig } from "@/lib/reservations/store";
import { bookState, turnMinutesForParty } from "@/lib/reservations";
import type { ServiceRules } from "@/lib/reservations";

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

export type FloorState = "free" | "held" | "occupied";

export type HeldReservation = {
  admissionId: string;
  holderName: string | null;
  partySize: number;
  startsAtIso: string;
  late: boolean;
};

export type CombinablePartner = {
  spaceId: string;
  partyMin: number;
  partyMax: number;
};

export type FloorTable = {
  spaceId: string;
  name: string;
  code: string | null;
  kind: string;
  /** The room or area this space sits in (`spaces.parent_id`), for grouping the map. */
  parentId: string | null;
  /** That parent's own name, or null when the space hangs off the venue directly. */
  parentName: string | null;
  /**
   * `spaces.status = 'out_of_service'`: the table is on the floor but cannot
   * be seated (T01 "Blocked"). Never folded into `state`: a blocked table can
   * still carry the open visit that was on it when it was blocked.
   */
  blocked: boolean;
  minSpendCents: number;
  partyMin: number;
  partyMax: number;
  visitId: string | null;
  visitVersion: number | null;
  /** `visits.opened_at`, ISO, when occupied; the timeline draws the block from it. */
  openedAtIso: string | null;
  publicToken: string | null;
  /**
   * The visit's FIRST open check (oldest draft order), the one "Open order"
   * opens. A visit may own more than one check after a split (D-POS-67);
   * `orderIds` lists them all and `orderTotalCents` is their sum.
   */
  orderId: string | null;
  orderIds: string[];
  /** Each open check with its own total, in `orderIds` order. */
  checks: Array<{ orderId: string; totalCents: number }>;
  orderTotalCents: number;
  /** `visits.server_user_id`: who serves this table, when somebody was named. */
  serverUserId: string | null;
  remainingMinSpendCents: number;
  serviceKind: "table" | "tab";
  state: FloorState;
  /** The party this seating was opened for. Null when free/held or unknown. */
  partySize: number | null;
  /** Minutes since `opened_at`, or null when not occupied. */
  elapsedMinutes: number | null;
  /** The configured turn time for this occupancy: the space's own override,
   *  else the venue's per-party band, else the venue default. Null when no
   *  venue service configuration exists to read one from. */
  turnMinutes: number | null;
  /** `opened_at + turnMinutes`, ISO, or null when turnMinutes is null. */
  dueAtIso: string | null;
  /** Past `dueAtIso` and still occupied. */
  overdue: boolean;
  /** T15: this space is the primary half of a visit joined to another space. */
  joinedWithSpaceId: string | null;
  /** T15: this space is the joined (secondary) half of a visit whose primary is elsewhere. */
  joinedFromSpaceId: string | null;
  /** The upcoming reservation holding this table, when `state === 'held'`. */
  held: HeldReservation | null;
  /** Free spaces this one may join with (`space_combinations`), for the seat-party join picker. */
  combinableWith: CombinablePartner[];
  /**
   * v3.1-corrections.md p.45: set when the table was vacated (closed or moved
   * away from) and has not been reset since. Only meaningful while
   * `state !== 'occupied'` — seating the space clears it. Never folded into
   * `state`: a needs-reset table is still `free` or `held`, just not "ready".
   */
  needsResetSinceIso: string | null;
  /** Active layout item, when W13 has placed this space. */
  layoutRect?: { x: number; y: number; w: number; h: number; shape: string } | null;
};

type VisitJoinRow = {
  id: string;
  space_id: string;
  joined_space_id: string | null;
  public_token: string;
  version: number;
  service_kind: string | null;
  opened_at: string | null;
  party_size: number | string | null;
  server_user_id: string | null;
};

type AdmissionRow = {
  id: string;
  starts_at: string;
  party_size: number | string | null;
  admitted_count: number | string | null;
  no_show_at: string | null;
  completed_at: string | null;
  status: string;
  holder_name: string | null;
  space_id: string | null;
};

/**
 * PURE. Which free spaces are "held" by an upcoming or just-due reservation,
 * and by whom. Given the room's admissions, which spaces are already
 * occupied (never held — an open visit outranks a booking on the same
 * table), and the venue's own grace window.
 *
 * A space is held when its nearest unresolved admission reads `arriving` or
 * `late` by the exact rule the reservations desk uses (`bookState`): due
 * inside `ARRIVING_WINDOW_MINUTES`, or past due and not yet marked a
 * no-show. `booked` (further out) and terminal states (`seated`,
 * `completed`, `no_show`) are not held — the first is not imminent yet and
 * the rest already resolved one way or the other.
 */
export function deriveHeldSpaces(
  admissions: readonly AdmissionRow[],
  occupiedSpaceIds: ReadonlySet<string>,
  now: Date,
  graceMinutes: number,
): Map<string, HeldReservation> {
  const held = new Map<string, HeldReservation>();
  for (const row of admissions) {
    if (!row.space_id || occupiedSpaceIds.has(row.space_id)) continue;
    if (row.status !== "valid") continue;
    const startsAt = new Date(row.starts_at);
    if (Number.isNaN(startsAt.getTime())) continue;
    const partySize = Math.max(1, num(row.party_size) || 1);
    const admittedCount = Math.max(0, num(row.admitted_count));
    const state = bookState(
      {
        admissionId: row.id,
        startsAt,
        partySize,
        admittedCount,
        noShowAt: row.no_show_at ? new Date(row.no_show_at) : null,
        completedAt: row.completed_at ? new Date(row.completed_at) : null,
        // The guard two lines above already refused anything but "valid" —
        // bookState's `status` only affects the isRefunded/isVoid badges the
        // reservations desk shows beside a state, never the state itself, so
        // there is nothing this function would do differently for those two.
        status: "valid",
        holderName: row.holder_name,
        spaceCode: null,
      },
      now,
      graceMinutes,
    );
    if (state !== "arriving" && state !== "late") continue;
    // Earliest imminent admission wins if a space somehow carries two.
    const existing = held.get(row.space_id);
    if (existing && new Date(existing.startsAtIso).getTime() <= startsAt.getTime()) continue;
    held.set(row.space_id, {
      admissionId: row.id,
      holderName: row.holder_name,
      partySize,
      startsAtIso: startsAt.toISOString(),
      late: state === "late",
    });
  }
  return held;
}

/**
 * Best-effort venue service rules for the turnaround display. Returns null
 * when there is no default venue or no configured rules — a workspace with
 * no reservations set up still gets a floor, just without a turn-time
 * target. Never throws: a read failure here degrades the floor to "no
 * turnaround shown", not to "no floor".
 */
async function loadRulesBestEffort(tenantId: string): Promise<ServiceRules | null> {
  try {
    const venue = await loadDefaultVenue(tenantId);
    if (!venue) return null;
    const config = await loadVenueServiceConfig(tenantId, venue.id, {});
    return config?.rules ?? null;
  } catch (err) {
    logServerError("visits.floor.rules", err);
    return null;
  }
}

async function loadHeldByAdmissions(
  tenantId: string,
  occupiedSpaceIds: ReadonlySet<string>,
  rules: ServiceRules | null,
): Promise<Map<string, HeldReservation>> {
  const admin = createServiceRoleClient();
  if (!admin) return new Map();
  try {
    const now = new Date();
    // A generous, bounded window rather than resolving the day's service
    // windows here: we only need admissions close enough to now to possibly
    // read as `arriving` or `late`, and a wide bound costs one indexed range
    // scan, not a table scan.
    const from = new Date(now.getTime() - 6 * 3_600_000).toISOString();
    const to = new Date(now.getTime() + 6 * 3_600_000).toISOString();
    const { data, error } = await admin
      .from("admissions")
      .select("id, starts_at, party_size, admitted_count, no_show_at, completed_at, status, holder_name, space_id")
      .eq("tenant_id", tenantId)
      .not("space_id", "is", null)
      .gte("starts_at", from)
      .lte("starts_at", to);
    if (error) {
      logServerError("visits.floor.admissions", error);
      return new Map();
    }
    const graceMinutes = rules?.noShowGraceMinutes ?? 15;
    return deriveHeldSpaces((data ?? []) as AdmissionRow[], occupiedSpaceIds, now, graceMinutes);
  } catch (err) {
    logServerError("visits.floor.admissions", err);
    return new Map();
  }
}

export async function listFloor(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; tables: FloorTable[] } | { ok: false; reason: "unavailable" }> {
  const { data: spaces, error } = await admin
    .from("spaces")
    .select(
      "id, name, code, kind, parent_id, min_spend_cents, party_min, party_max, turn_minutes, needs_reset_at, status, sort_order",
    )
    .eq("tenant_id", tenantId)
    .in("kind", ["table", "booth", "cabana"])
    .in("status", ["active", "out_of_service"])
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("visits.floor.spaces", error);
    return { ok: false, reason: "unavailable" };
  }

  const { data: visits, error: visitError } = await admin
    .from("visits")
    .select("id, space_id, joined_space_id, public_token, version, service_kind, opened_at, party_size, server_user_id")
    .eq("tenant_id", tenantId)
    .eq("status", "open");
  if (visitError) {
    logServerError("visits.floor.visits", visitError);
    return { ok: false, reason: "unavailable" };
  }
  const visitRows = (visits ?? []) as VisitJoinRow[];

  const visitBySpace = new Map<string, VisitJoinRow>();
  const joinedFrom = new Map<string, VisitJoinRow>(); // joined_space_id -> the visit that joined it
  for (const v of visitRows) {
    visitBySpace.set(v.space_id, v);
    if (v.joined_space_id) joinedFrom.set(v.joined_space_id, v);
  }
  const occupiedSpaceIds = new Set<string>([...visitBySpace.keys(), ...joinedFrom.keys()]);

  // EVERY OPEN CHECK ON THE VISIT, not one. A split (D-POS-67) leaves a
  // visit with two draft orders and a merge leaves the source order
  // cancelled on the same visit, so the read keeps only live checks and
  // carries them all: the first (oldest) is the one a card opens, the sum is
  // what the table owes.
  const visitIds = visitRows.map((v) => v.id);
  const ordersByVisit = new Map<string, Array<{ id: string; total_cents: number }>>();
  if (visitIds.length > 0) {
    const { data: orders, error: orderError } = await admin
      .from("orders")
      .select("id, visit_id, total_cents, status, created_at")
      .eq("tenant_id", tenantId)
      .in("visit_id", visitIds)
      .in("status", ["draft", "pending_payment"])
      .order("created_at", { ascending: true });
    if (orderError) {
      logServerError("visits.floor.orders", orderError);
      return { ok: false, reason: "unavailable" };
    }
    for (const o of (orders ?? []) as Array<{ id: string; visit_id: string; total_cents: number | string }>) {
      const list = ordersByVisit.get(o.visit_id) ?? [];
      list.push({ id: o.id, total_cents: num(o.total_cents) });
      ordersByVisit.set(o.visit_id, list);
    }
  }

  const { data: combos, error: comboError } = await admin
    .from("space_combinations")
    .select("space_id, with_space_id, party_min, party_max")
    .eq("tenant_id", tenantId);
  if (comboError) {
    // A join picker with no candidates is honest degradation, not a reason to
    // hide the whole floor.
    logServerError("visits.floor.combinations", comboError);
  }
  const combinableBySpace = new Map<string, CombinablePartner[]>();
  for (const c of (combos ?? []) as Array<{
    space_id: string;
    with_space_id: string;
    party_min: number | string;
    party_max: number | string;
  }>) {
    const list = combinableBySpace.get(c.space_id) ?? [];
    list.push({ spaceId: c.with_space_id, partyMin: num(c.party_min) || 1, partyMax: num(c.party_max) || 1 });
    combinableBySpace.set(c.space_id, list);
  }

  const rules = await loadRulesBestEffort(tenantId);
  const held = await loadHeldByAdmissions(tenantId, occupiedSpaceIds, rules);

  // The rooms and areas the tables hang off, so the map can group them the
  // way the floor plan does ("Booths", "Main hall"). A read failure leaves
  // every table ungrouped, which is a poorer map and not a wrong one.
  const parentIds = [
    ...new Set(
      ((spaces ?? []) as Array<{ parent_id: string | null }>)
        .map((s) => s.parent_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const parentNames = new Map<string, string>();
  if (parentIds.length > 0) {
    const { data: parents, error: parentError } = await admin
      .from("spaces")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", parentIds);
    if (parentError) logServerError("visits.floor.parents", parentError);
    for (const p of (parents ?? []) as Array<{ id: string; name: string }>) parentNames.set(p.id, p.name);
  }

  const now = Date.now();
  const tables: FloorTable[] = ((spaces ?? []) as Array<{
    id: string;
    name: string;
    code: string | null;
    kind: string;
    parent_id: string | null;
    status: string;
    min_spend_cents: number | string | null;
    party_min: number | string | null;
    party_max: number | string | null;
    turn_minutes: number | string | null;
    needs_reset_at: string | null;
  }>).map((space) => {
    const ownVisit = visitBySpace.get(space.id) ?? null;
    const asJoined = joinedFrom.get(space.id) ?? null; // this space is a joined-in second table
    const visit = ownVisit ?? asJoined;
    const orders = visit ? (ordersByVisit.get(visit.id) ?? []) : [];
    const order = orders[0] ?? null;
    const minSpend = num(space.min_spend_cents);
    const orderTotal = orders.reduce((sum, o) => sum + o.total_cents, 0);
    const partyMin = num(space.party_min) || 1;
    const partyMax = num(space.party_max) || partyMin;

    let elapsedMinutes: number | null = null;
    let turnMinutes: number | null = null;
    let dueAtIso: string | null = null;
    let overdue = false;
    if (visit?.opened_at) {
      const openedAt = new Date(visit.opened_at).getTime();
      if (!Number.isNaN(openedAt)) {
        elapsedMinutes = Math.max(0, Math.floor((now - openedAt) / 60_000));
        const partySize = visit.party_size == null ? null : num(visit.party_size);
        turnMinutes =
          num(space.turn_minutes) ||
          (rules ? turnMinutesForParty(rules, partySize ?? partyMin) : null) ||
          null;
        if (turnMinutes) {
          const due = openedAt + turnMinutes * 60_000;
          dueAtIso = new Date(due).toISOString();
          overdue = now > due;
        }
      }
    }

    const heldEntry = !visit ? (held.get(space.id) ?? null) : null;
    const state: FloorState = visit ? "occupied" : heldEntry ? "held" : "free";

    // Join candidates are offered for free AND held tables — a host can still
    // choose to seat a walk-in on a table that is merely held for a booking
    // that has not arrived (that override is the host's call, not a refusal
    // this module invents); an occupied table is never a join source.
    const freeCombos = state !== "occupied" ? (combinableBySpace.get(space.id) ?? []) : [];
    const freeCombinableWith = freeCombos.filter((c) => !occupiedSpaceIds.has(c.spaceId));

    return {
      spaceId: space.id,
      name: space.name,
      code: space.code,
      kind: space.kind,
      parentId: space.parent_id,
      parentName: space.parent_id ? (parentNames.get(space.parent_id) ?? null) : null,
      blocked: space.status === "out_of_service",
      minSpendCents: minSpend,
      partyMin,
      partyMax,
      visitId: visit?.id ?? null,
      visitVersion: visit?.version ?? null,
      openedAtIso: visit?.opened_at ?? null,
      publicToken: visit?.public_token ?? null,
      orderId: order?.id ?? null,
      orderIds: orders.map((o) => o.id),
      checks: orders.map((o) => ({ orderId: o.id, totalCents: o.total_cents })),
      orderTotalCents: orderTotal,
      serverUserId: visit?.server_user_id ?? null,
      remainingMinSpendCents: Math.max(0, minSpend - orderTotal),
      serviceKind: visit?.service_kind === "tab" ? "tab" : "table",
      state,
      partySize: visit?.party_size == null ? null : num(visit.party_size),
      elapsedMinutes,
      turnMinutes,
      dueAtIso,
      overdue,
      joinedWithSpaceId: ownVisit?.joined_space_id ?? null,
      joinedFromSpaceId: asJoined ? asJoined.space_id : null,
      held: heldEntry,
      combinableWith: freeCombinableWith,
      // Meaningless once occupied again — seating a space clears the column
      // (openVisit), so an occupied row's own needs_reset_at, if ever stale,
      // is deliberately not surfaced.
      needsResetSinceIso: state === "occupied" ? null : space.needs_reset_at,
    };
  });

  return { ok: true, tables };
}
