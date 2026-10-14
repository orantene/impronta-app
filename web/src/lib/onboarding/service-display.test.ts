import assert from "node:assert/strict";
import test from "node:test";

import { localizeServicesDisplay } from "./service-display";

test("an English pack service shows in Spanish on the Spanish flow", () => {
  assert.equal(localizeServicesDisplay("haircut", "es"), "Corte de cabello");
  assert.equal(localizeServicesDisplay("Haircuts · Manicure", "es"), "Corte de cabello · Manicura");
});

test("English flow keeps English; unknown names are kept as said", () => {
  assert.equal(localizeServicesDisplay("haircut", "en"), "Haircut");
  assert.equal(localizeServicesDisplay("Reiki", "es"), "Reiki");
  assert.equal(localizeServicesDisplay("", "es"), "");
});
