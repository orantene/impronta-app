import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { depositMoney } from "./deposit-money";

describe("depositMoney", () => {
  it("carries the currency code and no fake cents on whole amounts", () => {
    assert.match(depositMoney(85000, "MXN"), /850/);
    assert.match(depositMoney(85000, "MXN"), /MXN/);
    assert.doesNotMatch(depositMoney(85000, "MXN"), /\.00/);
  });
  it("does not divide zero-decimal currencies by 100", () => {
    assert.match(depositMoney(5000, "JPY"), /5,?000/);
  });
});
