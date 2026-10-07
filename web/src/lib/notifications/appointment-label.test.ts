/**
 * TUL-108: a talent-site appointment reminder shows the appointment's own
 * date and time in the talent's zone (its inquiry has no event_date).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAppointmentLabel } from "./catalog-render";

test("formats in the talent's zone and the email language", () => {
  // 14:45Z on Oct 9 is 9:45 in Cancun (UTC-5).
  const es = formatAppointmentLabel("2026-10-09T14:45:00Z", "America/Cancun", "es");
  assert.ok(es && /9:45/.test(es) && /oct/i.test(es), es);
  const en = formatAppointmentLabel("2026-10-09T14:45:00Z", "America/Cancun", "en");
  assert.ok(en && /9:45/.test(en) && /Oct/.test(en), en);
});

test("missing or bad input falls back (undefined)", () => {
  assert.equal(formatAppointmentLabel(null, "America/Cancun", "es"), undefined);
  assert.equal(formatAppointmentLabel("2026-10-09T14:45:00Z", null, "es"), undefined);
  assert.equal(formatAppointmentLabel("not a date", "America/Cancun", "es"), undefined);
  assert.equal(formatAppointmentLabel("2026-10-09T14:45:00Z", "Not/AZone", "es"), undefined);
});
