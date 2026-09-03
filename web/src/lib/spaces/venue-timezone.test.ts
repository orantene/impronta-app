/**
 * The timezone ladder. These are the cases that were previously answered by
 * five different files each deciding "UTC" on its own.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { localHourIn, pickTimezone } from "./venue-timezone";

test("the venue wins over the workspace and the legacy setting", () => {
  assert.deepEqual(
    pickTimezone({
      venue: "America/Cancun",
      workspace: "Europe/Madrid",
      appointmentsSetting: "Asia/Tokyo",
    }),
    { timezone: "America/Cancun", source: "venue" },
  );
});

test("the workspace answers when no venue is in play", () => {
  assert.deepEqual(pickTimezone({ workspace: "Europe/Madrid" }), {
    timezone: "Europe/Madrid",
    source: "workspace",
  });
});

test("the legacy appointments setting is still read", () => {
  assert.deepEqual(pickTimezone({ appointmentsSetting: "Asia/Tokyo" }), {
    timezone: "Asia/Tokyo",
    source: "appointments_setting",
  });
});

test("a rung that does not parse is skipped, not trusted", () => {
  assert.deepEqual(
    pickTimezone({ venue: "Mars/Olympus_Mons", workspace: "America/Cancun" }),
    { timezone: "America/Cancun", source: "workspace" },
  );
});

test("blank and whitespace-only values are skipped", () => {
  assert.deepEqual(
    pickTimezone({ venue: "   ", workspace: "", appointmentsSetting: "UTC" }),
    { timezone: "UTC", source: "appointments_setting" },
  );
});

test("a valid value is trimmed", () => {
  assert.deepEqual(pickTimezone({ venue: " America/Cancun " }), {
    timezone: "America/Cancun",
    source: "venue",
  });
});

test("an empty ladder ends at UTC and says nobody chose it", () => {
  assert.deepEqual(pickTimezone({}), { timezone: "UTC", source: "platform" });
  assert.deepEqual(
    pickTimezone({ venue: null, workspace: null, appointmentsSetting: null }),
    { timezone: "UTC", source: "platform" },
  );
});

test("UTC chosen by a workspace is reported as the workspace's own choice", () => {
  // "platform" means nobody decided. "workspace" means somebody picked UTC.
  // The settings screen has to show those differently.
  assert.equal(pickTimezone({ workspace: "UTC" }).source, "workspace");
});

// 2026-09-05T13:00Z. Cancun is UTC-5 all year (it dropped DST in 2015).
const AT_13Z = new Date("2026-09-05T13:00:00.000Z");

test("localHourIn reports the local hour, not the UTC hour", () => {
  assert.equal(localHourIn(AT_13Z, "America/Cancun"), 8);
  assert.equal(localHourIn(AT_13Z, "UTC"), 13);
});

test("localHourIn crosses the date boundary downward", () => {
  assert.equal(localHourIn(new Date("2026-09-05T03:00:00.000Z"), "America/Cancun"), 22);
});

test("localHourIn reports midnight as 0, never 24", () => {
  assert.equal(localHourIn(new Date("2026-09-05T05:00:00.000Z"), "America/Cancun"), 0);
});

test("localHourIn refuses an unusable zone rather than answering in UTC", () => {
  assert.equal(localHourIn(AT_13Z, "Mars/Olympus_Mons"), null);
  assert.equal(localHourIn(new Date(Number.NaN), "UTC"), null);
});

test("localHourIn follows a zone that does observe DST", () => {
  // Madrid is UTC+2 in September (CEST) and UTC+1 in January (CET).
  assert.equal(localHourIn(new Date("2026-09-05T12:00:00.000Z"), "Europe/Madrid"), 14);
  assert.equal(localHourIn(new Date("2026-01-05T12:00:00.000Z"), "Europe/Madrid"), 13);
});
