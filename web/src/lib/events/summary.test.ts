import assert from "node:assert/strict";
import test from "node:test";

import {
  doorCounts,
  doorTakings,
  summariseEvent,
  summariseTier,
  type TierPoolState,
} from "./summary";

const GA = { poolKey: "ga", label: "General admission", amountCents: 3000 };
const VIP = { poolKey: "vip", label: "VIP table for 6", amountCents: 60000 };

function pool(over: Partial<TierPoolState> = {}): TierPoolState {
  return { poolKey: "ga", unitsTotal: 300, unitsCommitted: 0, unitsHeld: 0, ...over };
}

test("remaining subtracts HELD as well as sold", () => {
  const s = summariseTier(GA, pool({ unitsCommitted: 88, unitsHeld: 14 }));
  assert.equal(s.sold, 88);
  assert.equal(s.held, 14);
  // 300 - 88 - 14. A seat inside someone's ten-minute checkout is not available,
  // and advertising it is how two people buy the last ticket.
  assert.equal(s.remaining, 198);
  assert.equal(s.soldOut, false);
  assert.equal(s.grossCents, 88 * 3000);
});

test("sold out is remaining <= 0, not sold >= capacity", () => {
  // Every seat is either sold or inside a live checkout. `sold >= capacity`
  // would be false here and the page would keep saying "2 left".
  const s = summariseTier(GA, pool({ unitsTotal: 300, unitsCommitted: 298, unitsHeld: 2 }));
  assert.equal(s.remaining, 0);
  assert.equal(s.soldOut, true);

  // And when those holds lapse, the seats come back.
  const after = summariseTier(GA, pool({ unitsTotal: 300, unitsCommitted: 298, unitsHeld: 0 }));
  assert.equal(after.remaining, 2);
  assert.equal(after.soldOut, false);
});

test("no pool means UNCAPPED, not sold out", () => {
  // set_offering_stock(NULL) deactivates the pool and clears the reference, so
  // an uncapped tier has nothing to point at. Reading that as zero would stop a
  // free RSVP event from taking anyone.
  const s = summariseTier({ poolKey: "rsvp", label: "Free entry", amountCents: 0 }, null);
  assert.equal(s.capacity, null);
  assert.equal(s.remaining, null);
  assert.equal(s.soldOut, false);
});

test("a total with an uncapped tier in it is not a number", () => {
  const pools = new Map<string, TierPoolState>([
    ["ga", pool({ unitsTotal: 300, unitsCommitted: 88, unitsHeld: 14 })],
  ]);
  // VIP has no pool: uncapped.
  const e = summariseEvent([GA, VIP], pools);

  // Summing only the capped tiers would report "300 capacity" for a night that
  // can also admit unlimited VIP -- wrong in the direction that matters, because
  // it under-reports how many people are coming.
  assert.equal(e.totalCapacity, null);
  assert.equal(e.totalRemaining, null);
  // The facts that ARE known stay known.
  assert.equal(e.totalSold, 88);
  assert.equal(e.totalHeld, 14);
  assert.equal(e.grossCents, 88 * 3000);
  assert.equal(e.soldOut, false);
});

test("an event is sold out only when every tier is, and an empty one never is", () => {
  const full = new Map<string, TierPoolState>([
    ["ga", pool({ unitsTotal: 10, unitsCommitted: 10 })],
    ["vip", pool({ poolKey: "vip", unitsTotal: 6, unitsCommitted: 6 })],
  ]);
  assert.equal(summariseEvent([GA, VIP], full).soldOut, true);

  const partial = new Map<string, TierPoolState>([
    ["ga", pool({ unitsTotal: 10, unitsCommitted: 10 })],
    ["vip", pool({ poolKey: "vip", unitsTotal: 6, unitsCommitted: 1 })],
  ]);
  assert.equal(summariseEvent([GA, VIP], partial).soldOut, false);

  // Nothing to sell is not the same as nothing left.
  assert.equal(summariseEvent([], new Map()).soldOut, false);
});

test("the door counts PEOPLE, not units of capacity", () => {
  // One GA ticket (1 person) and one VIP table (6 people). Capacity sold is 2
  // units; the door should expect 7 people. A door reading the pool would tell
  // the venue to expect 2.
  const counts = doorCounts([
    { partySize: 1, admittedCount: 0, status: "valid" },
    { partySize: 6, admittedCount: 0, status: "valid" },
  ]);
  assert.equal(counts.expected, 7);
  assert.equal(counts.arrived, 0);
  assert.equal(counts.stillToCome, 7);
});

test("part-arrived parties, refunds and no-shows each count once", () => {
  const counts = doorCounts([
    { partySize: 4, admittedCount: 2, status: "valid" },              // half a party in
    { partySize: 1, admittedCount: 1, status: "refunded" },           // came in, refunded after
    { partySize: 2, admittedCount: 0, status: "void" },               // cancelled, not expected
    { partySize: 3, admittedCount: 0, status: "valid", noShowAt: "2026-09-13T22:30:00.000Z" },
  ]);

  // Expected counts only live tickets that have not been called a no-show.
  assert.equal(counts.expected, 4);
  // Arrived is a fact about the room: the refunded guest was still in it.
  assert.equal(counts.arrived, 3);
  assert.equal(counts.stillToCome, 1);
  // A no-show is a human's positive call, never inferred from a zero count --
  // at 21:30 almost every row has a zero count and almost none is a no-show.
  assert.equal(counts.noShows, 3);
});

test("door takings sum only priced walk-ups, count unpriced ones apart, and ignore order-backed rows", () => {
  const t = doorTakings([
    { walkUp: true, status: "valid", doorAmountCents: 1500, doorPaidVia: "cash" },
    { walkUp: true, status: "valid", doorAmountCents: 0, doorPaidVia: "cash" }, // a comp: priced, worth 0
    { walkUp: true, status: "valid", doorAmountCents: 2000, doorPaidVia: "card_terminal" },
    { walkUp: true, status: "void", doorAmountCents: 9999, doorPaidVia: "cash" }, // handed back
    { walkUp: true, status: "valid", doorAmountCents: null, doorPaidVia: null }, // arrived some other way
    { walkUp: false, status: "valid", doorAmountCents: null, doorPaidVia: null }, // online: money is on the order
  ]);
  assert.deepEqual(t.byMethod, { cash: 1500, card_terminal: 2000, other: 0 });
  assert.equal(t.totalCents, 3500);
  assert.equal(t.pricedWalkUps, 3);
  assert.equal(t.unpricedWalkUps, 1);
});
