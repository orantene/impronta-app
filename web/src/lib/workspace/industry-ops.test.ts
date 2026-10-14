import test from "node:test";
import assert from "node:assert/strict";

import { industryCounterOps, isServiceAppointmentsBusiness } from "./industry-ops";

test("salon / clinic / practice / home services hide counter ops", () => {
  for (const id of ["salon_barber", "clinic", "practice", "spa_wellness", "studio_gym", "home_services"]) {
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

test("TUL-568: unknown and custom get the minimal set, never a restaurant shell", () => {
  for (const id of [null, undefined, "", "not_a_preset", "custom"]) {
    assert.equal(industryCounterOps(id), false, String(id));
  }
});

test("TUL-568: counter ops only for food and drink presets", () => {
  for (const id of ["coworking", "venue_for_hire", "sports_venue", "dropoff_service", "portfolio", "agency"]) {
    assert.equal(industryCounterOps(id), false, id);
  }
});
