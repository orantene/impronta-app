import test from "node:test";
import assert from "node:assert/strict";

import { dayLabel, depositLine } from "./reserve-table-island";

// ── The date chip names the VENUE's day, not the reader's ───────────────────
//
// The bug this pins: the strip used to be built from `new Date()` in the
// browser and formatted with `toLocaleDateString(undefined, …)`, so both the
// day it offered and the word it printed came from wherever the guest was
// sitting. A Cancun restaurant read from Madrid was labelled a day ahead.

test("a date chip is formatted in the venue zone, not the runner's", () => {
  // 2026-03-15 is a Sunday in Cancun. A reader in Tokyo (UTC+9) and one in
  // Los Angeles (UTC-7) must both be told the venue's Sunday.
  const inCancun = dayLabel("2026-03-15", "America/Cancun", "en", false);
  assert.match(inCancun, /Sun/);

  // Same instant, a zone far to the east. Naming the zone is what keeps this
  // stable; without it the ymd's midnight slides into the previous day.
  const inTokyo = dayLabel("2026-03-15", "Asia/Tokyo", "en", false);
  assert.match(inTokyo, /Sun/);
});

test("a ymd never slides a day for readers west of UTC", () => {
  // The old shape parsed the date at midnight UTC, which is the PREVIOUS day
  // for every zone with a negative offset. Anchoring at noon removes the whole
  // class rather than the one case someone happened to test.
  for (const zone of ["America/Cancun", "America/Los_Angeles", "Pacific/Honolulu"]) {
    assert.match(dayLabel("2026-03-15", zone, "en", false), /Sun/, zone);
  }
});

test("today is a word, not a formatted date", () => {
  // Index 0 is the venue's own today, so it says so in the reader's language
  // rather than making them compare a date to their own calendar.
  assert.equal(dayLabel("2026-03-15", "America/Cancun", "en", true), "Today");
  assert.equal(dayLabel("2026-03-15", "America/Cancun", "es", true), "Hoy");
});

test("a chip refuses rather than inventing a day", () => {
  // An unparseable date returns the raw value instead of "Invalid Date", which
  // is the difference between a visibly wrong chip and a confidently wrong one.
  assert.equal(dayLabel("not-a-date", "America/Cancun", "en", false), "not-a-date");
});

// ── Money is a sentence only at the very edge ───────────────────────────────

test("a deposit is stated in the reader's language and currency format", () => {
  const en = depositLine("en", 2500);
  const es = depositLine("es", 2500);
  assert.match(en, /25\.00/);
  assert.match(es, /25\.00/);
  assert.notEqual(en, es, "the two locales must not render the same sentence");
  // Integer cents in, no floating point out.
  assert.match(depositLine("en", 1), /0\.01/);
});
