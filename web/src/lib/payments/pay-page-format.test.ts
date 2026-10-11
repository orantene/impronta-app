import assert from "node:assert/strict";
import { test } from "node:test";

import { clockWords, dayWords, expiryParts, payMoney, payUsdLine, whenWords, zoneCity, zoneNote } from "./pay-page-format";

// 2026-10-10 15:00 UTC = 10:00 am in Cancun (UTC-5, no DST).
const AT = "2026-10-10T15:00:00Z";

test("one money format: symbol, separator, code; no decimals when whole", () => {
  assert.equal(payMoney(100000, "MXN", "es"), "$1,000 MXN");
  assert.equal(payMoney(101500, "MXN", "en"), "$1,015 MXN");
  assert.equal(payMoney(5050, "USD", "en"), "$50.50 USD");
});

test("the approximate US$ line only appears for a foreign currency with a rate", () => {
  const rates = { rateDate: "2026-10-09", perUsd: { MXN: 18.5 } };
  assert.equal(payUsdLine(100000, "MXN", rates, "es"), "≈ US$54");
  assert.equal(payUsdLine(100000, "USD", rates, "es"), null);
  assert.equal(payUsdLine(100000, "MXN", null, "es"), null);
});

test("clock is spoken in the talent's zone, 12-hour, no dots", () => {
  assert.equal(clockWords(AT, "America/Cancun", "es"), "10:00 am");
  assert.equal(clockWords(AT, "America/Cancun", "en"), "10:00 am");
  assert.equal(clockWords("2026-10-11T02:24:00Z", "America/Mexico_City", "es"), "8:24 pm");
  assert.equal(clockWords("not a date", "UTC", "es"), null);
});

test("day reads weekday day month in es, weekday month day in en", () => {
  assert.equal(dayWords(AT, "America/Cancun", "es"), "Sáb 10 oct");
  assert.equal(dayWords(AT, "America/Cancun", "en"), "Sat Oct 10");
});

test("the appointment names the city's clock, not an abbreviation; UTC and bad zones name none", () => {
  assert.equal(whenWords(AT, "America/Cancun", "es"), "Sáb 10 oct · 10:00 am · hora de Cancún");
  assert.equal(whenWords(AT, "America/Mexico_City", "es"), "Sáb 10 oct · 9:00 am · hora de Ciudad de México");
  assert.equal(whenWords(AT, "America/Los_Angeles", "en"), "Sat Oct 10 · 8:00 am · Los Angeles time");
  assert.equal(zoneNote("America/Cancun", "fr"), "heure de Cancun");
  assert.equal(zoneCity("UTC", "es"), null);
  assert.equal(zoneCity("Not/AZone", "es"), null);
  assert.equal(whenWords(AT, "UTC", "en"), "Sat Oct 10 · 3:00 pm");
});

test("expiry names the day only when it is not today in the talent's zone", () => {
  const now = Date.parse("2026-10-10T14:00:00Z");
  assert.deepEqual(expiryParts(AT, "America/Cancun", "es", now), { time: "10:00 am", day: null });
  const tomorrow = Date.parse("2026-10-09T14:00:00Z");
  assert.deepEqual(expiryParts(AT, "America/Cancun", "es", tomorrow), { time: "10:00 am", day: "Sáb 10 oct" });
  assert.equal(expiryParts("", "UTC", "es", now), null);
});
