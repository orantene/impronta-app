import assert from "node:assert/strict";
import { test } from "node:test";

import { idleBarLabel } from "./services-catalog-idle-bar";

test("idle bar label follows context (ES + EN)", () => {
  assert.equal(idleBarLabel(true, false), "Ver servicios");
  assert.equal(idleBarLabel(true, true), "Elige un servicio");
  assert.equal(idleBarLabel(false, false), "See services");
  assert.equal(idleBarLabel(false, true), "Choose a service");
});
