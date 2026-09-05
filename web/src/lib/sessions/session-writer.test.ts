/**
 * UNIT TEST — session-writer.ts, against a fake Postgres that enforces the two
 * unique indexes the real table has.
 *
 * WHY A FAKE AND NOT A STUB THAT RETURNS SUCCESS. The defect this file exists
 * to prevent — the same night scheduled twice becoming two sessions and two
 * pool sets — is invisible to any stub that simply says "inserted". The fake
 * below enforces uniqueness the way the database does, INCLUDING the part that
 * caused the bug: NULLs are distinct on the series key, and NOT distinct on the
 * event night key, matching `sessions_event_night_uniq ... NULLS NOT DISTINCT`.
 *
 * That asymmetry is the whole defect, so it is the thing the fake models.
 *
 * Runs in `test:sessions` (glob lane). `tsx --test` executes, it does not
 * typecheck.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createSessionWithPools } from "./session-writer";

type Row = Record<string, unknown>;

/** A tiny Postgres that only knows the two indexes on `sessions`. */
function fakeDb() {
  const sessions: Row[] = [];
  const pools: Row[] = [];
  let nextId = 1;

  function violatesUnique(row: Row): boolean {
    // sessions_series_occurrence_uniq (series_id, starts_at) — NULLS DISTINCT,
    // so a null series never collides. This is exactly why event nights slipped
    // through before the second index existed.
    if (row.series_id != null) {
      if (sessions.some((s) => s.series_id === row.series_id && s.starts_at === row.starts_at)) {
        return true;
      }
    }
    // sessions_event_night_uniq (event_id, starts_at, venue_id) NULLS NOT
    // DISTINCT WHERE event_id IS NOT NULL — a null venue DOES collide.
    if (row.event_id != null) {
      if (
        sessions.some(
          (s) =>
            s.event_id === row.event_id &&
            s.starts_at === row.starts_at &&
            (s.venue_id ?? null) === (row.venue_id ?? null),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  const admin = {
    from(table: string) {
      if (table === "sessions") {
        const filters: Array<(r: Row) => boolean> = [];
        const api: Record<string, unknown> = {
          insert(row: Row) {
            return {
              select: () => ({
                maybeSingle: async () => {
                  if (violatesUnique(row)) {
                    return { data: null, error: { code: "23505", message: "duplicate key" } };
                  }
                  const stored = { ...row, id: `sess-${nextId++}` };
                  sessions.push(stored);
                  return { data: { id: stored.id }, error: null };
                },
              }),
            };
          },
          select() {
            return api;
          },
          eq(col: string, val: unknown) {
            filters.push((r) => r[col] === val);
            return api;
          },
          is(col: string, val: unknown) {
            filters.push((r) => (r[col] ?? null) === val);
            return api;
          },
          async maybeSingle() {
            const hit = sessions.find((r) => filters.every((f) => f(r)));
            return { data: hit ? { id: hit.id } : null, error: null };
          },
        };
        return api;
      }
      // capacity_pools reads, used by ensureSessionPools
      const poolFilters: Array<(r: Row) => boolean> = [];
      const poolApi: Record<string, unknown> = {
        select: () => poolApi,
        eq(col: string, val: unknown) {
          poolFilters.push((r) => r[col] === val);
          return poolApi;
        },
        then(resolve: (v: unknown) => void) {
          resolve({ data: pools.filter((r) => poolFilters.every((f) => f(r))), error: null });
        },
      };
      return poolApi;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== "upsert_capacity_pool") return { data: null, error: null };
      const existing = pools.find(
        (p) =>
          p.subject_id === args.p_subject_id &&
          p.pool_key === args.p_pool_key &&
          p.subject_kind === args.p_subject_kind,
      );
      // ON CONFLICT DO UPDATE SET units_total = EXCLUDED — the real behaviour.
      if (existing) existing.units_total = args.p_units_total;
      else
        pools.push({
          subject_kind: args.p_subject_kind,
          subject_id: args.p_subject_id,
          pool_key: args.p_pool_key,
          units_total: args.p_units_total,
          tenant_id: args.p_tenant_id,
        });
      return { data: null, error: null };
    },
  };

  return { admin, sessions, pools };
}

const NIGHT = {
  tenantId: "t1",
  eventId: "event-1",
  venueId: "venue-1",
  startsAt: "2026-09-12T18:00:00.000Z",
  endsAt: "2026-09-12T22:00:00.000Z",
};
const TIERS = [
  { poolKey: "ga", units: 40 },
  { poolKey: "vip", units: 6 },
];

test("scheduling the SAME EVENT NIGHT twice yields ONE session and ONE pool set", async () => {
  // The defect: a double-clicked button gave a 40-seat room 80 seats across two
  // identical nights, with every screen agreeing.
  const db = fakeDb();

  const first = await createSessionWithPools(db.admin as never, NIGHT, TIERS);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.created, true);
  assert.equal(first.poolsCreated, 2);

  const second = await createSessionWithPools(db.admin as never, NIGHT, TIERS);
  assert.equal(second.ok, true);
  if (!second.ok) return;

  // Not a failure, and the SAME session.
  assert.equal(second.created, false);
  assert.equal(second.sessionId, first.sessionId);

  assert.equal(db.sessions.length, 1, "one session");
  assert.equal(db.pools.length, 2, "one pool per tier, not two");
  assert.equal(db.pools.find((p) => p.pool_key === "ga")?.units_total, 40);
});

test("a VENUELESS event night is still covered — NULLS NOT DISTINCT is the point", async () => {
  // If null venues did not collide, this index would guarantee nothing and we
  // would have shipped the same class of bug a second time.
  const db = fakeDb();
  const venueless = { ...NIGHT, venueId: null };

  const a = await createSessionWithPools(db.admin as never, venueless, TIERS);
  const b = await createSessionWithPools(db.admin as never, venueless, TIERS);
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(b.created, false);
  assert.equal(b.sessionId, a.sessionId);
  assert.equal(db.sessions.length, 1);
});

test("the SAME event at the SAME instant in a DIFFERENT room is allowed", async () => {
  // A festival with a main hall and a side room at 21:00 is two sessions, two
  // pools, one event. A key of (event, instant) would have forbidden it, and
  // forbidden it silently at the moment a venue first tried to sell it.
  const db = fakeDb();
  const hall = await createSessionWithPools(db.admin as never, NIGHT, TIERS);
  const side = await createSessionWithPools(
    db.admin as never,
    { ...NIGHT, venueId: "venue-2" },
    TIERS,
  );
  assert.equal(hall.ok && side.ok, true);
  if (!hall.ok || !side.ok) return;
  assert.equal(side.created, true);
  assert.notEqual(side.sessionId, hall.sessionId);
  assert.equal(db.sessions.length, 2);
  assert.equal(db.pools.length, 4);
});

test("a repeat FILLS a pool the first attempt missed, and does not reset one that exists", async () => {
  const db = fakeDb();
  const first = await createSessionWithPools(db.admin as never, NIGHT, [TIERS[0]!]);
  assert.equal(first.ok, true);
  assert.equal(db.pools.length, 1);

  // Somebody raised GA for a busy night after it was scheduled.
  db.pools[0]!.units_total = 60;

  // The repeat asks for both tiers.
  const second = await createSessionWithPools(db.admin as never, NIGHT, TIERS);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.created, false);
  assert.equal(second.poolsCreated, 1, "only the MISSING tier was created");
  assert.equal(db.pools.length, 2);
  // The raised count survives: ensureSessionPools never re-asserts.
  assert.equal(db.pools.find((p) => p.pool_key === "ga")?.units_total, 60);
});

test("a SERIES occurrence repeat is still idempotent, on its own index", async () => {
  const db = fakeDb();
  const occ = {
    tenantId: "t1",
    seriesId: "series-1",
    startsAt: "2026-09-19T18:00:00.000Z",
    endsAt: "2026-09-19T20:00:00.000Z",
  };
  const a = await createSessionWithPools(db.admin as never, occ, [{ poolKey: "default", units: 12 }]);
  const b = await createSessionWithPools(db.admin as never, occ, [{ poolKey: "default", units: 12 }]);
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(db.sessions.length, 1);
  assert.equal(db.pools.length, 1);
});
