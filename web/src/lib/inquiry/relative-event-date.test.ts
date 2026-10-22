/**
 * TUL-1415 / TUL-1587: "el sábado" is the next Saturday in the workspace's zone, not a model guess.
 * QA on build 8 got Thursday 29 Oct for "Saturday" said on Thursday 22 Oct.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { localDateIso, resolveRelativeEventDate, todayLine } from "./relative-event-date";

// Thursday 22 Oct 2026, 11:00 in Cancun (UTC-5).
const THU = new Date("2026-10-22T16:00:00Z");
const CANCUN = "America/Cancun";

test("the QA sentence resolves to Saturday 24 Oct", () => {
  assert.equal(resolveRelativeEventDate("chef para 10 personas el sábado y 2 meseros", THU, CANCUN), "2026-10-24");
  assert.equal(resolveRelativeEventDate("chef for 10 people Saturday and 2 waiters", THU, CANCUN), "2026-10-24");
});

test("today, tomorrow and the day after", () => {
  assert.equal(resolveRelativeEventDate("hoy", THU, CANCUN), "2026-10-22");
  assert.equal(resolveRelativeEventDate("mañana por favor", THU, CANCUN), "2026-10-23");
  assert.equal(resolveRelativeEventDate("pasado mañana", THU, CANCUN), "2026-10-24");
  assert.equal(resolveRelativeEventDate("tomorrow", THU, CANCUN), "2026-10-23");
});

test("the same weekday as today means next week; the morning is not tomorrow", () => {
  assert.equal(resolveRelativeEventDate("el jueves", THU, CANCUN), "2026-10-29");
  assert.equal(resolveRelativeEventDate("por la mañana", THU, CANCUN), null);
  assert.equal(resolveRelativeEventDate("esta mañana", THU, CANCUN), null);
});

test("the day is the workspace's, not UTC's: 22:30 Cancun is already the next day in UTC", () => {
  const lateThu = new Date("2026-10-23T03:30:00Z");
  assert.equal(localDateIso(lateThu, CANCUN), "2026-10-22");
  assert.equal(resolveRelativeEventDate("mañana", lateThu, CANCUN), "2026-10-23");
  assert.equal(resolveRelativeEventDate("mañana", lateThu, "UTC"), "2026-10-24");
});

test("an explicit date is left to the model", () => {
  assert.equal(resolveRelativeEventDate("el sábado 31 de octubre", THU, CANCUN), null);
  assert.equal(resolveRelativeEventDate("saturday 2026-11-07", THU, CANCUN), null);
  assert.equal(resolveRelativeEventDate("el 24/10", THU, CANCUN), null);
  assert.equal(resolveRelativeEventDate("a quote please", THU, CANCUN), null);
});

test("an unknown zone falls back to UTC and the model reads the weekday", () => {
  assert.equal(localDateIso(THU, "Not/AZone"), "2026-10-22");
  assert.equal(todayLine(THU, CANCUN), "Thursday 2026-10-22");
});
