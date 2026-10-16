import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { stripMxCountryCode } from "./whatsapp-prefill";

describe("stripMxCountryCode (TUL-1157)", () => {
  test("drops +52 and 52", () => {
    assert.equal(stripMxCountryCode("+529981234567"), "9981234567");
    assert.equal(stripMxCountryCode("+52 998 123 4567"), "998 123 4567");
    assert.equal(stripMxCountryCode("529981234567"), "9981234567");
  });
  test("leaves bare and other-country numbers alone", () => {
    assert.equal(stripMxCountryCode("998 123 4567"), "998 123 4567");
    assert.equal(stripMxCountryCode("+14155550123"), "+14155550123");
    assert.equal(stripMxCountryCode("5212345"), "5212345");
  });
});
