import test from "node:test";
import assert from "node:assert/strict";

import { industryCounterOps, isServiceAppointmentsBusiness } from "./industry-ops";

test("salon / clinic / practice hide counter ops", () => {
  for (const id of ["salon_barber", "clinic", "practice", "spa_wellness", "studio_gym"]) {
    assert.equal(isServiceAppointmentsBusiness(id), true, id);
    assert.equal(industryCounterOps(id), false, id);
  }
});

test("restaurant / bar keep counter ops", () => {
  for (const id of ["restaurant", "bar_club", "beach_club"]) {
    assert.equal(isServiceAppointmentsBusiness(id), false, id);
    assert.equal(industryCounterOps(id), true, id);
  }
});

test("unknown preset fails open (counter ops stay)", () => {
  assert.equal(industryCounterOps(null), true);
  assert.equal(industryCounterOps(undefined), true);
  assert.equal(industryCounterOps("not_a_preset"), true);
});
