import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PASS_THROUGH_DEFAULT_TAKE_BPS } from "./commission";
import {
  feePreviewConfigFromProcessingModeRow,
  processorFeeRatesFromTable,
  readPlatformProcessingMode,
  resolvePassThroughTakeBps,
} from "./platform-processing-mode";

const US = { percent: 0.029, fixed_cents: 30, tax_on_fee: 0 };
const MX = { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 };

describe("platform-processing-mode", () => {
  it("resolvePassThroughTakeBps matches charge-path null coalesce", () => {
    assert.equal(resolvePassThroughTakeBps({ pass_through_take_bps: 200 }), 200);
    assert.equal(resolvePassThroughTakeBps({ pass_through_take_bps: null }), PASS_THROUGH_DEFAULT_TAKE_BPS);
    assert.equal(resolvePassThroughTakeBps({}), PASS_THROUGH_DEFAULT_TAKE_BPS);
  });

  it("processorFeeRatesFromTable prefers currency then default", () => {
    const table = { default: US, mxn: MX };
    assert.deepEqual(processorFeeRatesFromTable(table, "MXN"), MX);
    assert.deepEqual(processorFeeRatesFromTable(table, "USD"), US);
    assert.equal(processorFeeRatesFromTable(null, "USD"), null);
  });

  it("feePreviewConfigFromProcessingModeRow refuses missing rates", () => {
    assert.equal(
      feePreviewConfigFromProcessingModeRow(
        { processing_mode: "pass_through", pass_through_take_bps: 150, processor_fee_rates: {} },
        "USD",
      ),
      null,
    );
    const cfg = feePreviewConfigFromProcessingModeRow(
      {
        processing_mode: "pass_through",
        pass_through_take_bps: 175,
        processor_fee_rates: { default: US },
      },
      "eur",
      50,
    );
    assert.ok(cfg);
    assert.equal(cfg!.takeBps, 175);
    assert.equal(cfg!.takeFloorCents, 50);
    assert.deepEqual(cfg!.processorFeeRates, US);
  });

  it("readPlatformProcessingMode uses engine_platform_processing_mode", async () => {
    const calls: string[] = [];
    const row = {
      processing_mode: "pass_through",
      pass_through_take_bps: 200,
      processor_fee_rates: { default: US, mxn: MX },
    };
    const got = await readPlatformProcessingMode({
      rpc: async (fn) => {
        calls.push(fn);
        return { data: row };
      },
    });
    assert.deepEqual(calls, ["engine_platform_processing_mode"]);
    assert.deepEqual(got, row);

    const err = await readPlatformProcessingMode({
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    });
    assert.equal(err, null);
  });
});
