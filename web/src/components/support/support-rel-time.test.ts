import assert from "node:assert/strict";
import { test } from "node:test";
import { relTime } from "./support-rel-time";

test("relTime: minutes, hours, days", () => {
  const now = Date.parse("2026-08-28T12:00:00.000Z");
  assert.equal(relTime("2026-08-28T11:48:00.000Z", now), "12m");
  assert.equal(relTime("2026-08-28T09:00:00.000Z", now), "3h");
  assert.equal(relTime("2026-08-26T12:00:00.000Z", now), "2d");
});
