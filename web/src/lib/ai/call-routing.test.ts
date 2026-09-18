import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { AI_ROUTE_MODEL_OPTIONS, AI_ROUTE_RECOMMENDED, AI_ROUTED_CALLS, isKnownRouteModel, parseRouteValue, providerForModel } from "./call-routing";
import { rateForModel } from "./ai-model-costs";

describe("call routing (pure)", () => {
  test("every recommended model is an admin option with a known rate", () => {
    for (const call of AI_ROUTED_CALLS) {
      const model = AI_ROUTE_RECOMMENDED[call];
      assert.ok(isKnownRouteModel(model), `${call}: ${model} not in the option list`);
      const rate = rateForModel(model);
      assert.ok(rate.inputPerM > 0 && rate.inputPerM < 10, `${call}: ${model} has no specific rate`);
    }
  });

  test("provider is read from the model name; unknown names route nowhere", () => {
    assert.equal(providerForModel("claude-haiku-4-5-20251001"), "anthropic");
    assert.equal(providerForModel("gpt-4.1-mini"), "openai");
    assert.equal(providerForModel("llama-3"), null);
  });

  test("setting values: known model, auto, object form, garbage", () => {
    assert.equal(parseRouteValue("claude-sonnet-5"), "claude-sonnet-5");
    assert.equal(parseRouteValue("auto"), null);
    assert.equal(parseRouteValue({ model: "gpt-4.1" }), "gpt-4.1");
    assert.equal(parseRouteValue("gpt-9-ultra"), null);
    assert.equal(parseRouteValue(42), null);
    assert.ok(AI_ROUTE_MODEL_OPTIONS.some((o) => o.value === "auto"));
  });
});
