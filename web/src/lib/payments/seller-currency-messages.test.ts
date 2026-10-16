import assert from "node:assert/strict";
import { test } from "node:test";
import { chargeRefusalMessage } from "./seller-currency-messages";

// TUL-704: the MXN refusal read "This seller's payment account cannot take MXN.
// It cannot be taken in this currency." inside the Spanish guest flow.
test("the MXN refusal is Spanish for an ES client and plain English otherwise", () => {
  const es = chargeRefusalMessage("lane", "es", { charge: "MXN" });
  assert.equal(es, "Esta cuenta no puede cobrar en MXN por ahora. Escribe a la persona que te atiende para resolverlo.");
  const en = chargeRefusalMessage("lane", "en", { charge: "MXN" });
  assert.doesNotMatch(en, /cannot be taken/);
  assert.match(en, /MXN/);
  assert.equal(chargeRefusalMessage("lane", "es-MX", { charge: "MXN" }), es);
  assert.equal(chargeRefusalMessage("lane", null, { charge: "MXN" }), en);
});

test("the other two refusals follow the locale too", () => {
  assert.match(chargeRefusalMessage("no_currency", "es"), /moneda válida/);
  assert.match(chargeRefusalMessage("not_priced", "es", { charge: "USD", priced: "MXN" }), /USD.*MXN/);
  assert.doesNotMatch(chargeRefusalMessage("not_priced", "en", { charge: "USD", priced: "MXN" }), /cannot be taken/);
});
