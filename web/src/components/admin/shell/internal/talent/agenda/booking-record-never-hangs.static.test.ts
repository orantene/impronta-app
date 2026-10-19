import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * /talent/bookings/<id> must render or fall back for every talent, never sit on the
 * router fallback ("Loading ... Almost there"). Source pins: on main the
 * "booking-record" case only set `page` when agendaV2 was on, so talents outside the
 * TALENT_AGENDA_V2 rollout (hub talent TAL-93046) hung forever, and the record route
 * returned null forever when its read threw.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), "src/components/admin/shell/internal", rel), "utf8");

describe("talent booking record never hangs", () => {
  it("the booking-record router case renders the record without an agendaV2 gate", () => {
    const src = read("talent.tsx");
    const start = src.indexOf('case "booking-record"');
    const end = src.indexOf('case "calendar-availability"');
    assert.ok(start > 0 && end > start);
    const body = src.slice(start, end);
    assert.doesNotMatch(body, /if \(agendaV2\)/);
    assert.match(body, /<BookingRecordRoute/);
  });

  it("the record route settles on error and on a timeout instead of rendering null forever", () => {
    const src = read("talent/agenda/BookingRecordRoute.tsx");
    assert.match(src, /RECORD_LOAD_TIMEOUT_MS/);
    assert.match(src, /setTimeout\(/);
    assert.match(src, /clearTimeout\(timer\)/);
    assert.match(src, /catch \{\s*if \(!cancelled\) setLoaded\(\{ id: bookingId, item: null \}\)/);
  });
});
