import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatHoursDate,
  formatHoursRange,
  formatHoursTime,
  hoursDatePlaceholder,
  minuteChoices,
  parseHoursDate,
  usesTwentyFourHour,
} from "./hours-display-format";

describe("hours display format (DS-39)", () => {
  it("es is 24h, en is 12h", () => {
    assert.equal(usesTwentyFourHour("es"), true);
    assert.equal(usesTwentyFourHour("es-MX"), true);
    assert.equal(usesTwentyFourHour("en"), false);
  });
  it("formats times and ranges by locale", () => {
    assert.equal(formatHoursRange("10:00", "18:00", "es"), "10:00 – 18:00");
    assert.equal(formatHoursRange("10:00", "18:00", "en"), "10:00 AM – 6:00 PM");
    assert.equal(formatHoursTime("00:30", "en"), "12:30 AM");
    assert.equal(formatHoursTime("12:00", "en"), "12:00 PM");
    assert.equal(formatHoursTime("9:05", "es"), "09:05");
    assert.equal(formatHoursTime("nope", "es"), "nope");
  });
  it("formats ISO dates by locale", () => {
    assert.equal(formatHoursDate("2026-10-07", "es"), "07/10/2026");
    assert.equal(formatHoursDate("2026-10-07", "en"), "10/07/2026");
    assert.equal(formatHoursDate("", "es"), "");
    assert.equal(hoursDatePlaceholder("es"), "dd/mm/aaaa");
    assert.equal(hoursDatePlaceholder("en"), "mm/dd/yyyy");
  });
  it("parses typed dates back to ISO", () => {
    assert.equal(parseHoursDate("07/10/2026", "es"), "2026-10-07");
    assert.equal(parseHoursDate("7-10-2026", "es"), "2026-10-07");
    assert.equal(parseHoursDate("10/07/2026", "en"), "2026-10-07");
    assert.equal(parseHoursDate("31/02/2026", "es"), null);
    assert.equal(parseHoursDate("13/01/2026", "en"), null);
    assert.equal(parseHoursDate("07/10/26", "es"), null);
    assert.equal(parseHoursDate("", "es"), null);
  });
  it("minute choices keep a stored odd minute", () => {
    assert.equal(minuteChoices(null).length, 12);
    assert.ok(minuteChoices(7).includes(7));
    assert.deepEqual(minuteChoices(10), minuteChoices(null));
  });
});
