// Pins the timezone-safe DATE-only contract (bug verified live 2026-07-23:
// event_date 2026-08-15 rendered "Aug 14, 2026" on client surfaces because
// new Date("YYYY-MM-DD") parses as UTC midnight).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDateOnly, parseDateOnlyLocal } from "./date-only";

describe("parseDateOnlyLocal", () => {
  it("parses YYYY-MM-DD as the LOCAL calendar day (never shifts)", () => {
    const dt = parseDateOnlyLocal("2026-08-15");
    assert.ok(dt);
    assert.equal(dt!.getFullYear(), 2026);
    assert.equal(dt!.getMonth(), 7);
    assert.equal(dt!.getDate(), 15); // the whole point: 15, not 14
    assert.equal(dt!.getHours(), 0); // local midnight, not UTC midnight
  });

  it("returns null for non-date-only strings", () => {
    assert.equal(parseDateOnlyLocal("2026-08-15T10:00:00Z"), null);
    assert.equal(parseDateOnlyLocal("not a date"), null);
    assert.equal(parseDateOnlyLocal("2026-13-45"), null); // invalid calendar values
  });
});

describe("formatDateOnly", () => {
  it("formats a date-only string as the same calendar day in en-US", () => {
    assert.equal(formatDateOnly("2026-08-15", "en-US"), "Aug 15, 2026");
  });

  it("falls through to normal Date parsing for full ISO timestamps", () => {
    // A real timestamp carries timezone info; it should not be re-interpreted.
    const out = formatDateOnly("2026-08-15T12:00:00Z", "en-US");
    assert.match(out, /Aug 1[45], 2026/); // legitimate zone-dependent render
  });

  it("returns unparseable input unchanged", () => {
    assert.equal(formatDateOnly("garbage", "en-US"), "garbage");
  });
});
