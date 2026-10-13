import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsHoursSetupNudge } from "./hours-setup-nudge";
import type { BookingHours } from "./hours-types";

const base = {
  timezone: "America/Mexico_City",
  exceptions: [],
  slotMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  horizonDays: 60,
} as unknown as BookingHours;

describe("needsHoursSetupNudge (TUL-634)", () => {
  it("shows when the hours row has weekly = {} (QA Free)", () => {
    assert.equal(needsHoursSetupNudge({ ...base, weekly: {} } as BookingHours, null), true);
  });
  it("shows when there is no hours row at all", () => {
    assert.equal(needsHoursSetupNudge(null, null), true);
  });
  it("hides when at least one open window exists", () => {
    const h = { ...base, weekly: { mon: [{ startMin: 540, endMin: 1020 }] } } as unknown as BookingHours;
    assert.equal(needsHoursSetupNudge(h, null), false);
  });
  it("hides when the agenda failed to load (unknown, not empty)", () => {
    assert.equal(needsHoursSetupNudge(null, "Could not load"), false);
  });
});

describe("Today wiring (TUL-634)", () => {
  it("renders the nudge on AgendaTodayPage in first-run and populated modes", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx",
      "utf8",
    );
    assert.match(src, /needsHoursSetupNudge\(hours, loadError\)/);
    assert.equal((src.match(/\{hoursNudge\}/g) ?? []).length, 2);
  });
});
