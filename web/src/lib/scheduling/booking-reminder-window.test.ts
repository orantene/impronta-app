import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingIsRemindableTomorrow } from "./booking-reminder-window";

describe("bookingIsRemindableTomorrow", () => {
  it("prefers starts_at over event_date", () => {
    assert.equal(
      bookingIsRemindableTomorrow(
        { starts_at: "2026-09-02T15:00:00.000Z", event_date: "2026-09-01" },
        "2026-09-02",
        "2026-09-03",
      ),
      true,
    );
    assert.equal(
      bookingIsRemindableTomorrow(
        { starts_at: "2026-09-04T15:00:00.000Z", event_date: "2026-09-02" },
        "2026-09-02",
        "2026-09-03",
      ),
      false,
    );
  });

  it("falls back to event_date half-open window", () => {
    assert.equal(
      bookingIsRemindableTomorrow(
        { starts_at: null, event_date: "2026-09-02" },
        "2026-09-02",
        "2026-09-03",
      ),
      true,
    );
    assert.equal(
      bookingIsRemindableTomorrow(
        { starts_at: null, event_date: "2026-09-03T00:00:00Z" },
        "2026-09-02",
        "2026-09-03",
      ),
      false,
    );
  });
});
