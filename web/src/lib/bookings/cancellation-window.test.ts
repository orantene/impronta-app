import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveCancellationWindow } from "./cancellation-window";

const NOW = Date.parse("2026-07-20T12:00:00.000Z");

describe("resolveCancellationWindow", () => {
  it("null/0/negative hours = flexible (never enforceable)", () => {
    for (const hours of [null, 0, -5, undefined]) {
      const v = resolveCancellationWindow({ cancellationHours: hours, startsAt: "2026-07-21T10:00:00Z", eventDate: null, nowMs: NOW });
      assert.deepEqual(v, { enforceable: false, insideWindow: false, deadlineIso: null });
    }
  });

  it("no schedule = unenforceable", () => {
    const v = resolveCancellationWindow({ cancellationHours: 48, startsAt: null, eventDate: null, nowMs: NOW });
    assert.equal(v.enforceable, false);
    assert.equal(v.insideWindow, false);
  });

  it("outside the window (plenty of notice) = cancellable", () => {
    // Event in 5 days, 48h window → deadline in 3 days → outside.
    const v = resolveCancellationWindow({ cancellationHours: 48, startsAt: "2026-07-25T12:00:00Z", eventDate: null, nowMs: NOW });
    assert.equal(v.enforceable, true);
    assert.equal(v.insideWindow, false);
    assert.equal(v.deadlineIso, "2026-07-23T12:00:00.000Z");
  });

  it("inside the window (short notice) = flagged", () => {
    // Event in 24h, 48h window → deadline was 24h ago → inside.
    const v = resolveCancellationWindow({ cancellationHours: 48, startsAt: "2026-07-21T12:00:00Z", eventDate: null, nowMs: NOW });
    assert.equal(v.enforceable, true);
    assert.equal(v.insideWindow, true);
  });

  it("falls back to event_date at start-of-day UTC", () => {
    // event_date tomorrow, 48h window → deadline yesterday → inside.
    const v = resolveCancellationWindow({ cancellationHours: 48, startsAt: null, eventDate: "2026-07-21", nowMs: NOW });
    assert.equal(v.enforceable, true);
    assert.equal(v.insideWindow, true);
    // event_date far out → outside.
    const v2 = resolveCancellationWindow({ cancellationHours: 48, startsAt: null, eventDate: "2026-08-01", nowMs: NOW });
    assert.equal(v2.insideWindow, false);
  });

  it("prefers starts_at over event_date", () => {
    const v = resolveCancellationWindow({
      cancellationHours: 2,
      startsAt: "2026-07-20T20:00:00Z", // deadline 18:00 → outside at 12:00
      eventDate: "2026-07-20", // would read inside if used
      nowMs: NOW,
    });
    assert.equal(v.insideWindow, false);
  });

  it("is robust to garbage timestamps", () => {
    const v = resolveCancellationWindow({ cancellationHours: 24, startsAt: "not-a-date", eventDate: "also-bad", nowMs: NOW });
    assert.equal(v.enforceable, false);
  });
});
