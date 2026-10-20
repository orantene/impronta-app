import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfferingResourceSet } from "./offering-resource-set";
import {
  commitBookingResources,
  holdBookingResources,
  inquiryResourcesKey,
  inquiryResourcesPrefix,
  releaseBookingResources,
  withLinkedResourceNeeds,
} from "./booking-resources";
import { ensureOfferBooking, type OfferBookingStore } from "@/lib/messaging/accept-offer-booking-core";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

test("a service links several resources (chair + room); the legacy single spaceId still reads", () => {
  assert.deepEqual(parseOfferingResourceSet({ resourceSet: { spaceIds: [S1, S2, S1, "nope"] } }).spaceIds, [S1, S2]);
  const legacy = parseOfferingResourceSet({ resourceSet: { spaceId: S1 } });
  assert.deepEqual(legacy.spaceIds, [S1]);
  assert.equal(legacy.spaceId, S1);
  assert.deepEqual(parseOfferingResourceSet(null).spaceIds, []);
});

test("linked resources join the purchase's capacity, once per pool, only with a time window", () => {
  const window = { startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T16:00:00Z" };
  const needs = withLinkedResourceNeeds(
    [{ offeringId: "o1", poolId: "room-pool", units: 1, startsAt: window.startsAt, endsAt: window.endsAt }],
    new Map([["o1", ["room-pool", "chair-pool"]]]),
    window,
  );
  assert.deepEqual(
    needs.map((n) => n.poolId),
    ["room-pool", "chair-pool"],
  );
  assert.equal(needs[1].startsAt, window.startsAt);
  assert.equal(needs[1].units, 1);
  // No window (a product, a gift card): nothing to hold in time.
  assert.equal(withLinkedResourceNeeds([], new Map([["o1", ["room-pool"]]]), null).length, 0);
});

/**
 * A fake of the engine RPC with the property the real one has: reservations on one
 * pool are serialized and counted, so a pool of 1 unit admits one overlapping window.
 */
function fakeEngine(unitsTotal: number) {
  const live: Array<{ id: string; key: string; pool: string; state: string; startsAt: string; endsAt: string }> = [];
  let chain = Promise.resolve();
  let n = 0;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "reserve_resource_set_v2") {
      let out: unknown;
      const run = chain.then(async () => {
        await new Promise((r) => setTimeout(r, 5));
        const cap = (args.p_capacity as Array<{ pool_id: string; starts_at: string; ends_at: string; units: number }>) ?? [];
        for (const c of cap) {
          const used = live.filter((a) => a.pool === c.pool_id && a.state !== "released" && a.startsAt < c.ends_at && c.starts_at < a.endsAt).length;
          if (used + c.units > unitsTotal) {
            out = { ok: false, reason: "sold_out", failed_pool_id: c.pool_id };
            return;
          }
        }
        const ids = cap.map((c) => {
          const id = `a${++n}`;
          live.push({ id, key: String(args.p_operation_key), pool: c.pool_id, state: "hold", startsAt: c.starts_at, endsAt: c.ends_at });
          return id;
        });
        out = { ok: true, allocation_ids: ids, hold_ids: [] };
      });
      chain = run.catch(() => undefined);
      await run;
      return { data: out, error: null };
    }
    if (name === "release_capacity") {
      for (const id of args.p_allocation_ids as string[]) {
        const a = live.find((x) => x.id === id);
        if (a) a.state = "released";
      }
      return { data: { released: (args.p_allocation_ids as string[]).length, already_released: 0 }, error: null };
    }
    if (name === "commit_capacity") {
      for (const id of args.p_allocation_ids as string[]) {
        const a = live.find((x) => x.id === id);
        if (a) a.state = "committed";
      }
      return { data: { committed: (args.p_allocation_ids as string[]).length }, error: null };
    }
    if (name === "assert_capacity_pools_for_tenant") return { data: true, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  };
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
      neq: (col: string, v: unknown) => (filters.push((r) => r[col] !== v), q),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), q),
      like: (col: string, pat: string) => (filters.push((r) => String(r[col]).startsWith(pat.replace(/%$/, ""))), q),
      then: (resolve: (v: unknown) => void) => {
        const rows =
          table === "capacity_allocations"
            ? live.map((a) => ({ id: a.id, operation_key: a.key, state: a.state, tenant_id: "t1", pool_id: a.pool, starts_at: a.startsAt, ends_at: a.endsAt }))
            : table === "capacity_pools"
              ? [{ id: "room-pool", tenant_id: "t1" }]
              : [];
        resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
      },
    };
    return q;
  };
  return { admin: { rpc, from } as never, live };
}

test("RACE: two bookings for the same room at the same time: exactly one wins", async () => {
  const { admin, live } = fakeEngine(1);
  const window = { startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T16:00:00Z" };
  const [a, b] = await Promise.all([
    holdBookingResources(admin, { tenantId: "t1", operationKey: "inquiry:A:resources", poolIds: ["room-pool"], window }),
    holdBookingResources(admin, { tenantId: "t1", operationKey: "inquiry:B:resources", poolIds: ["room-pool"], window }),
  ]);
  const oks = [a, b].filter((r) => r.ok).length;
  assert.equal(oks, 1, "one booking holds the room");
  const loser = [a, b].find((r) => !r.ok) as { ok: false; reason: string };
  assert.equal(loser.reason, "taken");
  assert.equal(live.filter((x) => x.state !== "released").length, 1);
});

test("release frees held resources (cancel / expiry), never the committed ones unless asked", async () => {
  const { admin, live } = fakeEngine(1);
  const window = { startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T16:00:00Z" };
  const key = inquiryResourcesKey("inq-1", window);
  const prefix = inquiryResourcesPrefix("inq-1");
  assert.ok(key.startsWith(`${prefix}:`));
  await holdBookingResources(admin, { tenantId: "t1", operationKey: key, poolIds: ["room-pool"], window });
  await commitBookingResources(admin, { tenantId: "t1", operationKey: prefix });
  assert.equal(live[0].state, "committed");
  await releaseBookingResources(admin, { tenantId: "t1", operationKey: prefix });
  assert.equal(live[0].state, "committed", "an accepted booking keeps its room when its request holds are cleaned up");
  await releaseBookingResources(admin, { tenantId: "t1", operationKey: prefix, includeCommitted: true });
  assert.equal(live[0].state, "released", "a cancel gives the room back");
  // the room is free again for the next booking
  const again = await holdBookingResources(admin, { tenantId: "t1", operationKey: "inquiry:other:resources", poolIds: ["room-pool"], window });
  assert.equal(again.ok, true);
});

function store(over: Partial<OfferBookingStore>): OfferBookingStore & { calls: string[] } {
  const calls: string[] = [];
  const s: OfferBookingStore & { calls: string[] } = {
    calls,
    resolveTalent: async () => "tal",
    findBooking: async () => ({ ok: true, bookingId: null, scheduled: false }),
    resolveWindow: async () => ({ ok: true, window: { talentProfileId: "tal", startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T16:00:00Z", timezone: "UTC", holdId: "h1" } }),
    insertBooking: async () => ({ ok: true, bookingId: "b1" }),
    ensureTalentLeg: async () => true,
    holdResources: async () => (calls.push("holdResources"), "ok"),
    releaseResources: async () => void calls.push("releaseResources"),
    insertMirror: async () => (calls.push("insertMirror"), "ok"),
    markUnscheduled: async () => void calls.push("markUnscheduled"),
    releaseHolds: async () => void calls.push("releaseHolds"),
    linkOrderLines: async () => undefined,
    removeBooking: async () => undefined,
    ...over,
  } as OfferBookingStore & { calls: string[] };
  return s;
}

test("offer acceptance holds the resources before confirming the time; a taken room books unscheduled", async () => {
  const ok = store({});
  const r = await ensureOfferBooking(ok, { orderId: null });
  assert.equal(r.ok && r.scheduled, true);
  assert.deepEqual(ok.calls, ["holdResources", "insertMirror", "releaseHolds"]);

  const taken = store({ holdResources: async () => "taken" });
  const r2 = await ensureOfferBooking(taken, { orderId: null });
  assert.equal(r2.ok && r2.scheduled, false);
  assert.ok(taken.calls.includes("markUnscheduled"));
  assert.ok(!taken.calls.includes("insertMirror"));

  const mirrorTaken = store({ insertMirror: async () => "taken" });
  await ensureOfferBooking(mirrorTaken, { orderId: null });
  assert.ok(mirrorTaken.calls.includes("releaseResources"), "a time the talent no longer has gives the room back");
});

test("resource picker strings exist in EN and ES with no em dashes", () => {
  type Cat = { dashboard: { catalog: Record<string, Record<string, string>> } };
  const e = (en as unknown as Cat).dashboard.catalog.resources;
  const s = (es as unknown as Cat).dashboard.catalog.resources;
  assert.ok(e && s, "dashboard.catalog.resources block missing");
  assert.deepEqual(Object.keys(e).sort(), Object.keys(s).sort());
  for (const v of [...Object.values(e), ...Object.values(s)]) assert.equal(String(v).includes("—"), false);
});
