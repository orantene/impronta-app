/**
 * The free reservation that cancelled itself.
 *
 * Found in a browser on the isolated workspace, not in a lane: C06-CUS's table
 * reservation failed because the 4-unit table pool was fully held, and the
 * holds belonged to earlier runs of the SAME test. Each run booked a table,
 * was told "You are booked — nothing to pay", and left an order owing $0 with
 * a 15-minute payment deadline on it. Four of those close a restaurant's book,
 * and in production the sweep would instead have cancelled each reservation a
 * quarter of an hour after the guest made it.
 *
 * These tests are about the decision only. The commit that has to accompany it
 * is asserted in `purchase-refusal.test.ts`, against the pipeline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { settlesOnCreation } from "@/lib/orders/settles-on-creation";

test("a free table reservation is settled, not left owing nothing", () => {
  // The exact shape `createReservation` produces: pay-in-person because no
  // deposit is due, against an offering priced at zero.
  assert.equal(
    settlesOnCreation({ payInPerson: true, collectCents: 0, totalCents: 0 }),
    true,
    "an order for nothing has nothing left to wait for",
  );
});

test("a pay-at-door ticket is NOT settled, because $20 is genuinely owed", () => {
  // This is the case the old predicate got right and must keep getting right:
  // `loadHeldDoorOrders` finds the order by `pending_payment` + hold, and
  // `settleAtDoor` refuses `not_held` without it.
  assert.equal(
    settlesOnCreation({ payInPerson: true, collectCents: 0, totalCents: 2000 }),
    false,
  );
});

test("a card order being charged now is NOT settled — the webhook settles it", () => {
  assert.equal(
    settlesOnCreation({ payInPerson: false, collectCents: 5000, totalCents: 5000 }),
    false,
  );
  assert.equal(
    settlesOnCreation({ payInPerson: false, collectCents: 1250, totalCents: 5000 }),
    false,
    "a deposit collects part of the total and leaves a balance",
  );
});

test("the rule only ever WIDENS paid: a free reserve with a price still settles", () => {
  // `reserve_mode: 'free'` on a priced offering resolves to collect nothing
  // without pay-in-person, and settled at creation before this function
  // existed. Whether that is the right design is a separate argument; changing
  // it here would have been an unannounced regression in C01/C09/C12.
  assert.equal(
    settlesOnCreation({ payInPerson: false, collectCents: 0, totalCents: 5000 }),
    true,
  );
});

test("a total we cannot trust does not settle a pay-in-person order", () => {
  for (const totalCents of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(
      settlesOnCreation({ payInPerson: true, collectCents: 0, totalCents }),
      false,
      `${totalCents} is not "nothing owed"`,
    );
  }
});

test("a collect amount we cannot trust does not settle anything", () => {
  assert.equal(
    settlesOnCreation({ payInPerson: false, collectCents: Number.NaN, totalCents: 0 }),
    false,
  );
});
