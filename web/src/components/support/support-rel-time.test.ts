import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSupportDay, relTime } from "./support-rel-time";

test("relTime: minutes, hours, days", () => {
  const now = Date.parse("2026-08-28T12:00:00.000Z");
  assert.equal(relTime("2026-08-28T11:48:00.000Z", now), "12m");
  assert.equal(relTime("2026-08-28T09:00:00.000Z", now), "3h");
  assert.equal(relTime("2026-08-26T12:00:00.000Z", now), "2d");
});

test("formatSupportDay localizes the day key", () => {
  assert.match(formatSupportDay("2026-10-07", "es"), /7.*oct.*2026/i);
  assert.match(formatSupportDay("2026-10-07", "en"), /Oct 7, 2026/);
});

test("formatSupportDay falls back to the raw key on garbage", () => {
  assert.equal(formatSupportDay("nope", "es"), "nope");
});
