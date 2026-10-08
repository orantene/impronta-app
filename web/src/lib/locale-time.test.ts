import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayGroupLabel, formatAgeHours, formatClockTime } from "./locale-time";

// 2026-10-08T07:41:00Z is 01:41 in America/Mexico_City (UTC-6, no DST in Oct 2026).
const AT = "2026-10-08T07:41:00Z";
const MX = "America/Mexico_City";

describe("formatClockTime", () => {
  it("es renders 24h HH:mm", () => {
    assert.equal(formatClockTime(AT, "es", MX), "01:41");
    assert.equal(formatClockTime("2026-10-08T19:05:00Z", "es-MX", MX), "13:05");
  });
  it("es never renders AM/PM", () => {
    assert.doesNotMatch(formatClockTime("2026-10-08T19:05:00Z", "es", MX), /[ap]\.?\s?m/i);
  });
  it("es midnight is 00:xx, not 24:xx", () => {
    assert.equal(formatClockTime("2026-10-08T06:07:00Z", "es", MX), "00:07");
  });
  it("en renders 12h with AM/PM", () => {
    assert.match(formatClockTime(AT, "en", MX), /^1:41\s?AM$/);
    assert.match(formatClockTime("2026-10-08T19:05:00Z", "en", MX), /^1:05\s?PM$/);
  });
  it("is timezone explicit", () => {
    assert.equal(formatClockTime(AT, "es", "UTC"), "07:41");
  });
  it("invalid input returns empty string", () => {
    assert.equal(formatClockTime("nope", "es", MX), "");
  });
});

describe("formatAgeHours", () => {
  it("en keeps the historical output", () => {
    assert.equal(formatAgeHours(0.5, "en"), "now");
    assert.equal(formatAgeHours(5.9, "en"), "5h");
    assert.equal(formatAgeHours(49, undefined), "2d");
  });
  it("es says ahora / hace N min / hace N h / hace N d", () => {
    assert.equal(formatAgeHours(0, "es"), "ahora");
    assert.equal(formatAgeHours(0.5, "es"), "hace 30 min");
    assert.equal(formatAgeHours(5.9, "es"), "hace 5 h");
    assert.equal(formatAgeHours(49, "es-MX"), "hace 2 d");
  });
});

describe("dayGroupLabel", () => {
  it("es uses Hoy / Ayer", () => {
    assert.equal(dayGroupLabel("today", "es"), "Hoy");
    assert.equal(dayGroupLabel("yesterday", "es"), "Ayer");
  });
  it("en uses Today / Yesterday", () => {
    assert.equal(dayGroupLabel("today", "en"), "Today");
    assert.equal(dayGroupLabel("older", "en"), "Older");
  });
});
