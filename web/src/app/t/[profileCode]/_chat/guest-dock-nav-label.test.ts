import assert from "node:assert/strict";
import { test } from "node:test";

import { dockTabDisplayLabel } from "./guest-dock-nav-label";

test("long people / tickets labels shorten for the dock tab cell", () => {
  assert.equal(dockTabDisplayLabel("Talent & services"), "Talent");
  assert.equal(dockTabDisplayLabel("Talento y servicios"), "Talento");
  assert.equal(dockTabDisplayLabel("Tickets & tables"), "Tickets");
  assert.equal(dockTabDisplayLabel("Entradas y mesas"), "Entradas");
});

test("short labels pass through", () => {
  assert.equal(dockTabDisplayLabel("Servicios"), "Servicios");
  assert.equal(dockTabDisplayLabel("Hablar"), "Hablar");
});
