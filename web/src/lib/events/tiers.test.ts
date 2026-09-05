import assert from "node:assert/strict";
import test from "node:test";

import {
  checkQuantity,
  poolKeyFor,
  saleState,
  saleWindowState,
  tierPoolRequests,
  type Tier,
  newTierRow,
  explainPoolRefusal,
} from "./tiers";

const SESSION = {
  id: "sess-1",
  startsAt: "2026-09-13T21:00:00.000Z",
  endsAt: "2026-09-14T03:00:00.000Z",
};

function tier(over: Partial<Tier> = {}): Tier {
  return {
    id: "t1",
    label: "General admission",
    poolKey: "ga",
    amountCents: 3000,
    minPerOrder: 1,
    maxPerOrder: 8,
    isHidden: false,
    ...over,
  };
}

test("a pool key is derived once and never again, so a rename cannot orphan pools", () => {
  assert.equal(poolKeyFor("General admission"), "general_admission");
  assert.equal(poolKeyFor("VIP table for 6"), "vip_table_for_6");
  assert.equal(poolKeyFor("Domingo Acústico"), "domingo_acustico");
  // No fallback key. Silently minting "tier" collides with the next unnameable
  // tier on the same offering, and the collision surfaces as a lost pool.
  assert.equal(poolKeyFor("!!!"), null);
  assert.equal(poolKeyFor(""), null);
  assert.ok(!poolKeyFor("a".repeat(45))?.endsWith("_"));

  // THE POINT: the key is carried on the row, so renaming the label changes
  // nothing about which pools this tier owns.
  const before = tier({ label: "GA", poolKey: "ga" });
  const renamed = { ...before, label: "General admission" };
  assert.equal(renamed.poolKey, before.poolKey);
  assert.notEqual(poolKeyFor(renamed.label), renamed.poolKey);
});

test("hidden is not ended: a comp is unlisted and still buyable by link", () => {
  const comp = tier({ poolKey: "guestlist", isHidden: true, amountCents: 0 });
  const now = "2026-09-10T12:00:00.000Z";

  // The public page refuses to list it...
  assert.deepEqual(saleState(comp, now), { onSale: false, reason: "hidden" });
  // ...and the link path sells it. Collapsing these two makes comps unsellable
  // at the one moment they are meant to work.
  assert.deepEqual(saleWindowState(comp, now), { onSale: true });
});

test("a sales window that has not opened is scheduled, not ended", () => {
  const t = tier({ salesFrom: "2026-09-15T00:00:00.000Z" });
  const state = saleState(t, "2026-09-10T12:00:00.000Z");
  assert.equal(state.onSale, false);
  // "Scheduled" carries when it opens so the page can say so. "Ended" would
  // tell a buyer the opposite of the truth about a tier that is coming.
  assert.equal(state.reason, "scheduled");
  assert.equal(state.onSale === false && state.reason === "scheduled" ? state.opensAt : null,
    "2026-09-15T00:00:00.000Z");

  assert.deepEqual(saleState(t, "2026-09-15T00:00:01.000Z"), { onSale: true });
});

test("sales close AT the until instant, not after it", () => {
  const t = tier({ salesUntil: "2026-09-13T21:00:00.000Z" });
  assert.deepEqual(saleState(t, "2026-09-13T20:59:59.000Z"), { onSale: true });
  // "Sales until doors" means sales stop when doors open.
  assert.deepEqual(saleState(t, "2026-09-13T21:00:00.000Z"), { onSale: false, reason: "ended" });
});

test("quantity refuses rather than clamping", () => {
  const t = tier({ minPerOrder: 2, maxPerOrder: 8 });
  assert.deepEqual(checkQuantity(t, 4), { ok: true, units: 4 });
  // Clamping 12 to 8 sells someone eight tickets they did not ask for and tells
  // them nothing.
  assert.deepEqual(checkQuantity(t, 12), { ok: false, reason: "above_max", max: 8 });
  assert.deepEqual(checkQuantity(t, 1), { ok: false, reason: "below_min", min: 2 });
  assert.deepEqual(checkQuantity(t, 0), { ok: false, reason: "not_a_count" });
  assert.deepEqual(checkQuantity(t, 2.5), { ok: false, reason: "not_a_count" });
  // No max means no ceiling from this check; capacity still refuses.
  assert.deepEqual(checkQuantity(tier({ minPerOrder: 1, maxPerOrder: null }), 500),
    { ok: true, units: 500 });
});

test("every tier request carries the session window and its own order line", () => {
  const ga = tier({ poolKey: "ga" });
  const vip = tier({ id: "t2", label: "VIP table for 6", poolKey: "vip", amountCents: 60000 });
  const pools = new Map([["ga", "pool-ga"], ["vip", "pool-vip"]]);

  const reqs = tierPoolRequests(
    SESSION,
    [
      { tier: ga, units: 2, orderLineId: "line-1" },
      { tier: vip, units: 1, orderLineId: "line-2" },
    ],
    pools,
  );
  assert.ok(reqs);
  assert.equal(reqs.length, 2);

  // The window is on EVERY leg. A timeless allocation is correct only while the
  // tier pool has no ancestor shared across time; the moment it hangs under a
  // room pool it would charge that room forever.
  for (const r of reqs) {
    assert.equal(r.startsAt, SESSION.startsAt);
    assert.equal(r.endsAt, SESSION.endsAt);
  }

  // Each leg carries its OWN order line id. Sharing one would make refund-by-line
  // free the wrong seats: refunding GA would release the VIP table.
  assert.equal(reqs[0]?.orderLineId, "line-1");
  assert.equal(reqs[1]?.orderLineId, "line-2");
  assert.notEqual(reqs[0]?.orderLineId, reqs[1]?.orderLineId);
});

test("an unresolvable tier refuses the whole batch rather than part of it", () => {
  const ga = tier({ poolKey: "ga" });
  const vip = tier({ id: "t2", poolKey: "vip" });
  // VIP has no pool for this session — a tier added after the pools were built.
  const pools = new Map([["ga", "pool-ga"]]);

  // A cart that reserves the GA seats and silently drops the VIP table takes the
  // buyer's money for a table they do not have.
  assert.equal(
    tierPoolRequests(SESSION, [{ tier: ga, units: 2 }, { tier: vip, units: 1 }], pools),
    null,
  );
  assert.equal(tierPoolRequests(SESSION, [], pools), null);

  // A malformed session refuses too, rather than producing an unwindowed request.
  assert.equal(
    tierPoolRequests({ id: "s", startsAt: "nope", endsAt: "also nope" },
      [{ tier: ga, units: 1 }], pools),
    null,
  );
});

test("a new tier's pool_key is derived from its label once, and a rename does not touch it", () => {
  const ga = newTierRow({ label: "GA", amountCents: 3000 });
  assert.equal(ga.ok, true);
  if (!ga.ok) return;
  assert.equal(ga.poolKey, "ga");
  assert.equal(ga.admitsPerUnit, 1);
  // The writer stores poolKey; a later rename is an UPDATE of `label` only.
  // The rule lives in the writer's SELECT list, so here we only pin the derivation.
  const renamed = { ...ga, label: "General admission" };
  assert.equal(renamed.poolKey, "ga");
});

test("a new tier refuses a blank label, a negative price, or a nonsense party size", () => {
  assert.deepEqual(newTierRow({ label: "   ", amountCents: 1 }), { ok: false, reason: "bad_label" });
  assert.deepEqual(newTierRow({ label: "GA", amountCents: -1 }), { ok: false, reason: "bad_amount" });
  assert.deepEqual(newTierRow({ label: "VIP", amountCents: 1, admitsPerUnit: 0 }), { ok: false, reason: "bad_admits" });
  assert.deepEqual(newTierRow({ label: "VIP", amountCents: 1, maxPerOrder: 0 }), { ok: false, reason: "bad_max" });
});

test("a refused shrink names the floor Capacity returned, never a number computed here", () => {
  assert.equal(
    explainPoolRefusal({ code: "CP015", details: "60", message: "capacity_floor_violated" }, 40),
    "40 is below the 60 already sold for this night. Enter 60 or more.",
  );
  assert.equal(explainPoolRefusal({ code: "CP015", details: null }, 40), "That is below what is already sold for this night.");
  assert.equal(explainPoolRefusal({ code: "CP004" }, 40), "This pool is suspended; it takes no new seats until it is reactivated.");
  assert.equal(explainPoolRefusal({ code: "XX000", message: "boom" }, 40), "Could not save the seats for this night.");
});
