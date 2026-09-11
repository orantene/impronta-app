import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveHeldSpaces, listFloor } from "./floor";

type Row = Record<string, unknown>;

function makeStore() {
  return {
    spaces: [] as Row[],
    visits: [] as Row[],
    orders: [] as Row[],
    space_combinations: [] as Row[],
  };
}

function fakeAdmin(store: ReturnType<typeof makeStore>) {
  const tables: Record<string, Row[]> = store;
  const from = (table: string) => {
    const preds: Array<(row: Row) => boolean> = [];
    const match = () => (tables[table] ?? []).filter((row) => preds.every((p) => p(row)));
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        preds.push((row) => row[k] === v);
        return api;
      },
      in: (k: string, vals: unknown[]) => {
        preds.push((row) => vals.includes(row[k]));
        return api;
      },
      order: () => api,
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: match(), error: null }).then(resolve),
    };
    return api;
  };
  return { from };
}

function seedSpace(store: ReturnType<typeof makeStore>, over: Partial<Row> = {}) {
  store.spaces.push({
    id: "space-t7",
    tenant_id: "t1",
    name: "Table 7",
    code: "t7",
    kind: "table",
    min_spend_cents: 0,
    party_min: 2,
    party_max: 4,
    turn_minutes: null,
    status: "active",
    sort_order: 1,
    ...over,
  });
}

test("a free table with no admission reads free, not held", async () => {
  const store = makeStore();
  seedSpace(store);
  const res = await listFloor(fakeAdmin(store), "t1");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.tables[0]!.state, "free");
  assert.equal(res.tables[0]!.held, null);
  assert.equal(res.tables[0]!.partyMin, 2);
  assert.equal(res.tables[0]!.partyMax, 4);
});

test("an occupied table reports elapsed time and no held reservation", async () => {
  const store = makeStore();
  seedSpace(store);
  const openedAt = new Date(Date.now() - 20 * 60_000).toISOString();
  store.visits.push({
    id: "v1",
    tenant_id: "t1",
    space_id: "space-t7",
    joined_space_id: null,
    public_token: "tok1",
    version: 1,
    status: "open",
    service_kind: "table",
    opened_at: openedAt,
    party_size: 3,
  });
  const res = await listFloor(fakeAdmin(store), "t1");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const table = res.tables[0]!;
  assert.equal(table.state, "occupied");
  assert.equal(table.partySize, 3);
  assert.ok(table.elapsedMinutes !== null && table.elapsedMinutes >= 19 && table.elapsedMinutes <= 21);
  // No venue service config reachable in this test environment (no real
  // Supabase creds), so the turn-time target degrades to null rather than a
  // guessed number — see loadRulesBestEffort in floor.ts.
  assert.equal(table.turnMinutes, null);
});

test("a joined visit marks both spaces occupied by the same visit", async () => {
  const store = makeStore();
  seedSpace(store, { id: "space-a", code: "a", party_min: 2, party_max: 2 });
  seedSpace(store, { id: "space-b", code: "b", party_min: 2, party_max: 2 });
  store.visits.push({
    id: "v1",
    tenant_id: "t1",
    space_id: "space-a",
    joined_space_id: "space-b",
    public_token: "tok1",
    version: 1,
    status: "open",
    service_kind: "table",
    opened_at: new Date().toISOString(),
    party_size: 4,
  });
  const res = await listFloor(fakeAdmin(store), "t1");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const a = res.tables.find((t) => t.spaceId === "space-a")!;
  const b = res.tables.find((t) => t.spaceId === "space-b")!;
  assert.equal(a.state, "occupied");
  assert.equal(b.state, "occupied");
  assert.equal(a.joinedWithSpaceId, "space-b");
  assert.equal(b.joinedFromSpaceId, "space-a");
  assert.equal(a.visitId, "v1");
  assert.equal(b.visitId, "v1");
});

test("a free space lists only its FREE combinable partners", async () => {
  const store = makeStore();
  seedSpace(store, { id: "space-a", code: "a" });
  seedSpace(store, { id: "space-b", code: "b" });
  seedSpace(store, { id: "space-c", code: "c" });
  store.space_combinations.push(
    { tenant_id: "t1", space_id: "space-a", with_space_id: "space-b", party_min: 5, party_max: 8 },
    { tenant_id: "t1", space_id: "space-a", with_space_id: "space-c", party_min: 5, party_max: 8 },
  );
  // space-c is already occupied, so it must not appear as a join candidate.
  store.visits.push({
    id: "v1",
    tenant_id: "t1",
    space_id: "space-c",
    joined_space_id: null,
    public_token: "tok1",
    version: 1,
    status: "open",
    service_kind: "table",
    opened_at: new Date().toISOString(),
    party_size: 2,
  });
  const res = await listFloor(fakeAdmin(store), "t1");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const a = res.tables.find((t) => t.spaceId === "space-a")!;
  assert.deepEqual(
    a.combinableWith.map((c) => c.spaceId),
    ["space-b"],
  );
});

test("deriveHeldSpaces: arriving and late admissions hold a free space; booked and seated do not", () => {
  const now = new Date("2026-09-10T20:00:00.000Z");
  const admissions = [
    // Arriving in 5 minutes — held.
    {
      id: "adm-arriving",
      starts_at: "2026-09-10T20:05:00.000Z",
      party_size: 2,
      admitted_count: 0,
      no_show_at: null,
      completed_at: null,
      status: "valid",
      holder_name: "Priya",
      space_id: "space-1",
    },
    // Started 30 minutes ago, grace is 15 — past grace, still held (not yet a no-show).
    {
      id: "adm-late",
      starts_at: "2026-09-10T19:30:00.000Z",
      party_size: 2,
      admitted_count: 0,
      no_show_at: null,
      completed_at: null,
      status: "valid",
      holder_name: "Deshawn",
      space_id: "space-2",
    },
    // An hour out — NOT held yet, it is merely "booked".
    {
      id: "adm-far",
      starts_at: "2026-09-10T21:00:00.000Z",
      party_size: 2,
      admitted_count: 0,
      no_show_at: null,
      completed_at: null,
      status: "valid",
      holder_name: "Later",
      space_id: "space-3",
    },
    // Already admitted — the party is seated elsewhere, this space is not held.
    {
      id: "adm-seated",
      starts_at: "2026-09-10T19:55:00.000Z",
      party_size: 2,
      admitted_count: 2,
      no_show_at: null,
      completed_at: null,
      status: "valid",
      holder_name: "Already here",
      space_id: "space-4",
    },
  ];
  const held = deriveHeldSpaces(admissions, new Set(), now, 15);
  assert.equal(held.size, 2);
  assert.equal(held.get("space-1")?.holderName, "Priya");
  assert.equal(held.get("space-1")?.late, false);
  assert.equal(held.get("space-2")?.holderName, "Deshawn");
  assert.equal(held.get("space-2")?.late, true);
  assert.equal(held.has("space-3"), false);
  assert.equal(held.has("space-4"), false);
});

test("deriveHeldSpaces never holds a space that already has an open visit", () => {
  const now = new Date("2026-09-10T20:00:00.000Z");
  const admissions = [
    {
      id: "adm-arriving",
      starts_at: "2026-09-10T20:05:00.000Z",
      party_size: 2,
      admitted_count: 0,
      no_show_at: null,
      completed_at: null,
      status: "valid",
      holder_name: "Priya",
      space_id: "space-1",
    },
  ];
  const held = deriveHeldSpaces(admissions, new Set(["space-1"]), now, 15);
  assert.equal(held.size, 0);
});

test("a table marked needs_reset_at surfaces it while free, and never while occupied", async () => {
  const store = makeStore();
  seedSpace(store, { id: "space-a", code: "a", needs_reset_at: "2026-09-10T20:00:00.000Z" });
  seedSpace(store, { id: "space-b", code: "b", needs_reset_at: "2026-09-10T20:00:00.000Z" });
  store.visits.push({
    id: "v1",
    tenant_id: "t1",
    space_id: "space-b",
    joined_space_id: null,
    public_token: "tok1",
    version: 1,
    status: "open",
    service_kind: "table",
    opened_at: new Date().toISOString(),
    party_size: 2,
  });
  const res = await listFloor(fakeAdmin(store), "t1");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const a = res.tables.find((t) => t.spaceId === "space-a")!;
  const b = res.tables.find((t) => t.spaceId === "space-b")!;
  assert.equal(a.state, "free");
  assert.equal(a.needsResetSinceIso, "2026-09-10T20:00:00.000Z");
  // b is occupied (re-seated over a stale flag) — the flag is not shown.
  assert.equal(b.state, "occupied");
  assert.equal(b.needsResetSinceIso, null);
});
