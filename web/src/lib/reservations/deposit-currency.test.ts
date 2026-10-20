/**
 * P0 (TUL-1453 FIX FIRST): the table deposit's currency is never guessed.
 * Only an explicitly set, valid `display_currency` counts; anything else is
 * "not set", and a deposit without a currency is refused (online) or not
 * quoted (the POS floor).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { explicitDisplayCurrency, floorDepositQuote } from "@/lib/reservations/deposit-currency";

test("an explicit valid display_currency is returned, normalised", () => {
  assert.equal(explicitDisplayCurrency({ display_currency: "MXN" }), "MXN");
  assert.equal(explicitDisplayCurrency({ display_currency: " ars " }), "ARS");
});

test("unset, empty, malformed or non-object settings are NOT a currency (no USD fallback)", () => {
  for (const s of [null, undefined, {}, [], "MXN", { display_currency: "" }, { display_currency: "pesos" }, { display_currency: "US$" }, { display_currency: 484 }, { display_currency: null }]) {
    assert.equal(explicitDisplayCurrency(s), null, JSON.stringify(s));
  }
});

test("the floor quotes a deposit only with a known currency", () => {
  assert.deepEqual(floorDepositQuote(60_000, "MXN"), { ok: true, depositCents: 60_000, currency: "MXN" });
  assert.deepEqual(floorDepositQuote(60_000, null), { ok: false, reason: "currency_not_set" });
});

test("the floor shows no-deposit tables without needing a currency, and never invents one", () => {
  assert.deepEqual(floorDepositQuote(0, null), { ok: true, depositCents: 0, currency: null });
  assert.deepEqual(floorDepositQuote(0, "MXN"), { ok: true, depositCents: 0, currency: "MXN" });
});
