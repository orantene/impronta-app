/**
 * TUL-1366 (consultant P1-1, P1-3): the service fee fails closed and is armed
 * only by the settings row; before the migration it stays off with no 150 fallback.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { decideFromRow, decidePassThrough, FeeUnavailableError } from "./pass-through-arming";

const migrated = { processing_mode: "pass_through", pass_through_take_bps: 150, plan_service_fee_bps: { agency: 300 }, processor_fee_rates: { default: { percent: 0.029, fixed_cents: 30 } } };
const legacyProd = { processing_mode: "pass_through", pass_through_take_bps: 150, processor_fee_rates: { default: { percent: 0.029, fixed_cents: 30 } } };

describe("arming comes from the settings row", () => {
  test("kill switch '0' is off whatever the row says", () => {
    assert.deepEqual(decideFromRow(migrated, { COMMISSION_PROCESSING_PASS_THROUGH: "0" }), { mode: "off" });
  });
  test("no settings row: OFF (no 150 fallback)", () => {
    assert.deepEqual(decideFromRow(null, {}), { mode: "off" });
    assert.deepEqual(decideFromRow(null, { COMMISSION_PROCESSING_PASS_THROUGH: "1" }), { mode: "off" });
  });
  test("row says included: OFF", () => {
    assert.deepEqual(decideFromRow({ processing_mode: "included", pass_through_take_bps: 150 }, { COMMISSION_PROCESSING_PASS_THROUGH: "1" }), { mode: "off" });
  });
  test("before the migration, an unarmed environment stays OFF even though the row says pass_through", () => {
    assert.deepEqual(decideFromRow(legacyProd, {}), { mode: "off" });
  });
  test("production today (env '1' + row pass_through, no migration yet) stays ON", () => {
    const d = decideFromRow(legacyProd, { COMMISSION_PROCESSING_PASS_THROUGH: "1" });
    assert.equal(d.mode, "on");
    if (d.mode === "on") assert.equal(d.platformBps, 150);
  });
  test("after the migration it is ON by default, with the per-plan map", () => {
    const d = decideFromRow(migrated, {});
    assert.equal(d.mode, "on");
    if (d.mode === "on") assert.deepEqual(d.planFeeBps, { agency: 300 });
  });
});

describe("fails closed", () => {
  test("armed but the platform rate is missing or invalid: unavailable, never 150", () => {
    for (const bad of [null, undefined, "150", -1, 2001, 1.5]) {
      const d = decideFromRow({ ...migrated, pass_through_take_bps: bad as never }, {});
      assert.equal(d.mode, "unavailable", String(bad));
    }
  });
  test("RPC error, throw: unavailable (the checkout is refused)", async () => {
    assert.equal((await decidePassThrough({ rpc: async () => ({ data: null, error: { message: "boom" } }) }, {})).mode, "unavailable");
    assert.equal((await decidePassThrough({ rpc: async () => { throw new Error("down"); } }, {})).mode, "unavailable");
  });
  test("RPC ok with the migrated row: on; with no row: off; kill switch never calls the RPC", async () => {
    assert.equal((await decidePassThrough({ rpc: async () => ({ data: migrated }) }, {})).mode, "on");
    assert.equal((await decidePassThrough({ rpc: async () => ({ data: null }) }, {})).mode, "off");
    assert.equal(
      (await decidePassThrough({ rpc: async () => { throw new Error("must not be called"); } }, { COMMISSION_PROCESSING_PASS_THROUGH: "0" })).mode,
      "off",
    );
  });
  test("FeeUnavailableError carries the detail", () => {
    assert.equal(new FeeUnavailableError("x").detail, "x");
  });
});
