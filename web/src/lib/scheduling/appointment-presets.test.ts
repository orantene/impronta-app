import test from "node:test";
import assert from "node:assert/strict";

import { getAppointmentPreset } from "./appointment-presets";
import { normalizeTenantAppointmentsSettings } from "./appointments-settings-types";

test("barbershop preset is Tue-Sat 10-19", () => {
  const p = getAppointmentPreset("barbershop");
  assert.equal(p.weekly[0].length, 0);
  assert.equal(p.weekly[1].length, 0);
  assert.deepEqual(p.weekly[2], [{ startMin: 600, endMin: 1140 }]);
  assert.deepEqual(p.weekly[6], [{ startMin: 600, endMin: 1140 }]);
  assert.equal(p.defaults.slotMinutes, 30);
});

test("normalize appointments settings defaults enabled false and never clobbers garbage", () => {
  const empty = normalizeTenantAppointmentsSettings(null);
  assert.equal(empty.enabled, false);
  assert.equal(empty.allowTalentDirectBooking, false);
  assert.equal(empty.terminology, "reservations");

  const on = normalizeTenantAppointmentsSettings({
    enabled: true,
    terminology: "appointments",
    timezone: "America/Cancun",
    allowTalentDirectBooking: true,
    presetId: "barbershop",
    defaults: { slotMinutes: 45 },
  });
  assert.equal(on.enabled, true);
  assert.equal(on.terminology, "appointments");
  assert.equal(on.timezone, "America/Cancun");
  assert.equal(on.presetId, "barbershop");
  assert.equal(on.defaults.slotMinutes, 45);
  assert.equal(on.defaults.horizonDays, 60);
});
