import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveCalendarClock } from "./calendar-clock";

// TUL-700: ES showed UTC where EN showed America/Cancun. The header zone is a
// function of the workspace and the device, never of the language.
const NOW = new Date("2026-10-13T02:30:00Z"); // 21:30 on the 12th in Cancun

test("an untouched UTC workspace follows the device zone, same answer in any language", () => {
  const a = resolveCalendarClock({ serverZone: "UTC", serverTodayYmd: "2026-10-13", browserZone: "America/Cancun", now: NOW });
  assert.deepEqual(a, { timeZone: "America/Cancun", todayYmd: "2026-10-12" });
  assert.equal(resolveCalendarClock.length, 1, "takes one options object, no locale");
});

test("a workspace with a real zone keeps it", () => {
  const a = resolveCalendarClock({ serverZone: "Europe/Madrid", serverTodayYmd: "2026-10-13", browserZone: "America/Cancun", now: NOW });
  assert.deepEqual(a, { timeZone: "Europe/Madrid", todayYmd: "2026-10-13" });
});

test("UTC stays UTC when the device is UTC or the device zone is unusable", () => {
  for (const browserZone of ["UTC", "", "Not/AZone"]) {
    const a = resolveCalendarClock({ serverZone: "UTC", serverTodayYmd: "2026-10-13", browserZone, now: NOW });
    assert.deepEqual(a, { timeZone: "UTC", todayYmd: "2026-10-13" });
  }
});

test("the board hands its clock through the resolver, with no locale in sight", () => {
  const src = readFileSync(new URL("../../components/admin/shell/internal/page-modules/CalendarResources.tsx", import.meta.url), "utf8");
  assert.match(src, /resolveCalendarClock\(/);
  const call = src.slice(src.indexOf("resolveCalendarClock("), src.indexOf("resolveCalendarClock(") + 220);
  assert.doesNotMatch(call, /locale/i);
});
