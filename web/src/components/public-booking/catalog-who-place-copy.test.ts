import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogWhoPlaceNote } from "./catalog-who-place-copy";

test("TUL-516 E2: place note across studio / client / remote (es + en)", () => {
  assert.equal(catalogWhoPlaceNote(["client"], "es"), "Vamos a tu domicilio");
  assert.equal(catalogWhoPlaceNote(["client"], "en"), "We'll come to your place");
  assert.doesNotMatch(catalogWhoPlaceNote(["client"], "es")!, /ubicación exacta|estudio/i);

  assert.match(catalogWhoPlaceNote(["studio"], "es")!, /ubicación exacta/);
  assert.match(catalogWhoPlaceNote(["studio"], "en")!, /exact address/i);
  assert.doesNotMatch(catalogWhoPlaceNote(["studio"], "es")!, /domicilio/i);

  assert.equal(catalogWhoPlaceNote(["remote"], "es"), "La sesión es en línea");
  assert.equal(catalogWhoPlaceNote(["remote"], "en"), "This session is online");
  assert.doesNotMatch(catalogWhoPlaceNote(["remote"], "es")!, /estudio|domicilio/i);
});

test("client in a mixed where list still says we come to them", () => {
  assert.equal(catalogWhoPlaceNote(["studio", "client"], "es"), "Vamos a tu domicilio");
});
