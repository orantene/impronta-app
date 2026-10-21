import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfferingResourceSet } from "./offering-resource-set";
import {
  commitBookingResources,
  holdBookingResources,
  moveInquiryBookingResources,
  releaseInquiryWindowResources,
  secureInquiryBookingResources,
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
  const live: Array<{ id: string; key: string; pool: string; state: string; startsAt: string; endsAt: string; orderLineId: string | null }> = [];
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
          live.push({ id, key: String(args.p_operation_key), pool: c.pool_id, state: "hold", startsAt: c.starts_at, endsAt: c.ends_at, orderLineId: null });
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
        if (a) {
          a.state = "committed";
          if (args.p_order_line_id) a.orderLineId = String(args.p_order_line_id);
        }
      }
      return { data: { ok: true, committed: (args.p_allocation_ids as string[]).length }, error: null };
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
            ? live.map((a) => ({ id: a.id, operation_key: a.key, state: a.state, tenant_id: "t1", pool_id: a.pool, starts_at: a.startsAt, ends_at: a.endsAt, order_line_id: a.orderLineId }))
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

import { planSpacePoolForLink } from "./space-pool-for-link";

test("linking a space with no pool creates a 1-unit pool under its nearest pooled parent", () => {
  const nodes = [
    { id: "room", kind: "room" as const, parentId: null },
    { id: "chair", kind: "chair" as const, parentId: "room" },
    { id: "area", kind: "area" as const, parentId: null },
    { id: "chair2", kind: "chair" as const, parentId: "area" },
  ];
  assert.deepEqual(planSpacePoolForLink({ spaceId: "chair", nodes, pools: new Map([["room", { id: "p-room", unitsTotal: 3, parentPoolId: null }]]) }), {
    action: "create",
    parentPoolId: "p-room",
    units: 1,
  });
  // a parent that has no pool yet is not a constraint: no parent
  assert.deepEqual(planSpacePoolForLink({ spaceId: "chair", nodes, pools: new Map() }), { action: "create", parentPoolId: null, units: 1 });
  assert.deepEqual(planSpacePoolForLink({ spaceId: "chair2", nodes, pools: new Map() }), { action: "create", parentPoolId: null, units: 1 });
});

test("an existing pool is used; an empty 0-unit pool on a space with nothing inside becomes 1", () => {
  const nodes = [
    { id: "room", kind: "room" as const, parentId: null },
    { id: "t1", kind: "table" as const, parentId: "room" },
    { id: "chair", kind: "chair" as const, parentId: null },
  ];
  assert.deepEqual(planSpacePoolForLink({ spaceId: "chair", nodes, pools: new Map([["chair", { id: "pc", unitsTotal: 2, parentPoolId: null }]]) }), { action: "use", poolId: "pc" });
  assert.deepEqual(planSpacePoolForLink({ spaceId: "chair", nodes, pools: new Map([["chair", { id: "pc", unitsTotal: 0, parentPoolId: null }]]) }), {
    action: "raise",
    poolId: "pc",
    parentPoolId: null,
    units: 1,
  });
  // a room that holds tables keeps its own capacity rules: refused, never silently changed
  assert.deepEqual(planSpacePoolForLink({ spaceId: "room", nodes, pools: new Map([["room", { id: "pr", unitsTotal: 0, parentPoolId: null }]]) }), { action: "refuse" });
  // an unpooled kind (area) cannot be held
  assert.deepEqual(planSpacePoolForLink({ spaceId: "x", nodes: [{ id: "x", kind: "area" as const, parentId: null }], pools: new Map() }), { action: "refuse" });
});

test("space settings say plainly that a space is bookable (EN + ES)", () => {
  type V = { dashboard: { adminWorkspace: { venue: Record<string, string> } } };
  assert.equal((en as unknown as V).dashboard.adminWorkspace.venue.bookableAtATime, "Bookable, {n} at a time");
  assert.equal((es as unknown as V).dashboard.adminWorkspace.venue.bookableAtATime, "Reservable, {n} a la vez");
});

const W1 = { startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T16:00:00Z" };
const W2 = { startsAt: "2026-10-21T15:00:00Z", endsAt: "2026-10-21T16:00:00Z" };
const W3 = { startsAt: "2026-10-22T15:00:00Z", endsAt: "2026-10-22T16:00:00Z" };

async function bookOn(admin: never, inquiryId: string, window: typeof W1, orderLineId: string | null = null) {
  const held = await holdBookingResources(admin, { tenantId: "t1", operationKey: inquiryResourcesKey(inquiryId, window), poolIds: ["room-pool"], window });
  assert.equal(held.ok, true);
  return secureInquiryBookingResources(admin, { tenantId: "t1", inquiryId, offeringIds: [], window, orderLineId });
}

test("CANCEL SCOPE: two bookings on one inquiry; cancelling one never frees the other's room", async () => {
  const { admin, live } = fakeEngine(1);
  assert.equal(await bookOn(admin, "inq", W1), "ok");
  assert.equal(await bookOn(admin, "inq", W2), "ok", "a second offer on the same request keeps the first booking's room");
  assert.equal(live.filter((a) => a.state === "committed").length, 2);
  await releaseInquiryWindowResources(admin, { tenantId: "t1", inquiryId: "inq", window: W1 });
  assert.equal(live.find((a) => a.startsAt === W2.startsAt)!.state, "committed", "the other booking's room stays held");
  assert.equal(live.find((a) => a.startsAt === W1.startsAt)!.state, "released");
});

test("an accepted booking with an order commits its room onto the order line (engine cancel/reschedule own it)", async () => {
  const { admin, live } = fakeEngine(1);
  assert.equal(await bookOn(admin, "inq", W1, "line-1"), "ok");
  assert.equal(live[0].orderLineId, "line-1");
  await releaseInquiryWindowResources(admin, { tenantId: "t1", inquiryId: "inq", window: W1 });
  assert.equal(live[0].state, "committed", "window release only touches resources with no order line");
});

test("RESCHEDULE: the room moves to the new time; a taken new time is refused and nothing changes", async () => {
  const { admin, live } = fakeEngine(1);
  assert.equal(await bookOn(admin, "a", W1), "ok");
  assert.equal(await bookOn(admin, "b", W2), "ok");
  const taken = await moveInquiryBookingResources(admin, { tenantId: "t1", inquiryId: "a", from: W1, to: W2 });
  assert.equal(taken.ok, false);
  assert.equal(!taken.ok && taken.reason, "taken");
  assert.equal(live.find((x) => x.key.startsWith("inquiry:a:") && x.startsAt === W1.startsAt)!.state, "committed");

  const moved = await moveInquiryBookingResources(admin, { tenantId: "t1", inquiryId: "a", from: W1, to: W3 });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  await moved.finish(true);
  assert.equal(live.find((x) => x.key.startsWith("inquiry:a:") && x.startsAt === W1.startsAt)!.state, "released");
  assert.equal(live.find((x) => x.key.startsWith("inquiry:a:") && x.startsAt === W3.startsAt)!.state, "committed");
});

test("RESCHEDULE: a failed calendar write gives the new room back and keeps the old one", async () => {
  const { admin, live } = fakeEngine(1);
  assert.equal(await bookOn(admin, "a", W1), "ok");
  const moved = await moveInquiryBookingResources(admin, { tenantId: "t1", inquiryId: "a", from: W1, to: W3 });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  await moved.finish(false);
  assert.equal(live.find((x) => x.startsAt === W3.startsAt)!.state, "released");
  assert.equal(live.find((x) => x.startsAt === W1.startsAt)!.state, "committed");
});

test("RESCHEDULE RACE: two bookings moving into the same free time: exactly one gets the room", async () => {
  const { admin } = fakeEngine(1);
  assert.equal(await bookOn(admin, "a", W1), "ok");
  assert.equal(await bookOn(admin, "b", W2), "ok");
  const [x, y] = await Promise.all([
    moveInquiryBookingResources(admin, { tenantId: "t1", inquiryId: "a", from: W1, to: W3 }),
    moveInquiryBookingResources(admin, { tenantId: "t1", inquiryId: "b", from: W2, to: W3 }),
  ]);
  assert.equal([x, y].filter((r) => r.ok).length, 1);
});

// ── TUL-1473: attendees of a class share the room the session holds ──────────
import { purchaseNeedsWithLinkedResources } from "./booking-resources";

const WIN = { startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T16:00:00Z" };
const linkedStub = (seen: string[][]) =>
  (async (_a: unknown, _t: string, ids: readonly string[]) => {
    seen.push([...ids]);
    return { ok: true as const, poolsByOffering: new Map(ids.map((id) => [id, [`pool-${id}`]])) };
  }) as never;

test("two attendees of one class: neither holds the room again because the session already holds it", async () => {
  const seen: string[][] = [];
  const res = await purchaseNeedsWithLinkedResources(
    {} as never,
    { tenantId: "t", reservation: WIN, lines: [{ offeringId: "class", sessionId: "s1" }, { offeringId: "class", sessionId: "s1" }] },
    { sessionHoldsRoom: async () => true, loadLinked: linkedStub(seen) },
  );
  assert.deepEqual(res, { ok: true, needs: [] });
  assert.deepEqual(seen, [[]]);
});

test("a session with NO live room hold keeps the per-attendee hold (scheduled before the session hold existed)", async () => {
  const seen: string[][] = [];
  const res = await purchaseNeedsWithLinkedResources(
    {} as never,
    { tenantId: "t", reservation: WIN, lines: [{ offeringId: "class", sessionId: "s1" }] },
    { sessionHoldsRoom: async () => false, loadLinked: linkedStub(seen) },
  );
  assert.equal(res.ok && res.needs.length, 1);
  assert.deepEqual(seen, [["class"]]);
});

test("an unreadable session hold refuses (fail closed), never sells an unheld room", async () => {
  const res = await purchaseNeedsWithLinkedResources(
    {} as never,
    { tenantId: "t", reservation: WIN, lines: [{ offeringId: "class", sessionId: "s1" }] },
    { sessionHoldsRoom: async () => null, loadLinked: linkedStub([]) },
  );
  assert.equal(res.ok, false);
});

test("a line with no session (a chair, a one-to-one) still holds its own resource; mixed carts split correctly", async () => {
  const seen: string[][] = [];
  const res = await purchaseNeedsWithLinkedResources(
    {} as never,
    { tenantId: "t", reservation: WIN, lines: [{ offeringId: "class", sessionId: "s1" }, { offeringId: "haircut" }] },
    { sessionHoldsRoom: async () => true, loadLinked: linkedStub(seen) },
  );
  assert.deepEqual(seen, [["haircut"]]);
  assert.equal(res.ok && res.needs.length, 1);
});

test("no time window: nothing is held and the session is not even looked up", async () => {
  let looked = 0;
  const res = await purchaseNeedsWithLinkedResources(
    {} as never,
    { tenantId: "t", lines: [{ offeringId: "class", sessionId: "s1" }] },
    { sessionHoldsRoom: async () => (looked++, true), loadLinked: linkedStub([]) },
  );
  assert.deepEqual(res, { ok: true, needs: [] });
  assert.equal(looked, 0);
});
