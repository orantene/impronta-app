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

  it("the record route reads in parallel, never fails on a timer, and shows loading until settled", () => {
    const src = read("talent/agenda/BookingRecordRoute.tsx");
    assert.match(src, /readRecordInParallel/);
    assert.match(src, /recordViewState/);
    assert.match(src, /clearTimeout\(timer\)/);
    assert.doesNotMatch(src, /RECORD_LOAD_TIMEOUT_MS/);
    assert.doesNotMatch(src, /console\.error/);
  });

  it("nothing loaded renders an honest state: no stub record, no default status pill", () => {
    const src = read("talent/agenda/BookingRecordRoute.tsx");
    assert.match(src, /data-booking-record-unavailable/);
    assert.match(src, /We could not load this booking/);
    // The empty stub record (title "Booking", sourceLabel "Direct", whenLabel "No time assigned") is gone.
    assert.doesNotMatch(src, /sourceLabel: "Direct"/);
    assert.doesNotMatch(src, /whenLabel: copy\.t\("No time assigned"\)/);
    assert.doesNotMatch(src, /Agreed/);
    // Status text only for a status we actually read.
    assert.match(src, /knownStatusLabel/);
  });

  it("the server loaders read as the same effective user as the layout", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/talent-agenda/load-record-item.ts"), "utf8");
    assert.match(src, /effectiveReadContext/);
    assert.doesNotMatch(src, /loadTalentActor\(\)/);
  });
});

describe("record loaders: multi-role and past bookings", () => {
  it("read her own rows by her profile ids through the service client, with no date window on the stub", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/talent-agenda/load-record-item.ts"), "utf8");
    assert.match(src, /firstProfile: true/);
    assert.match(src, /ownProfileIds/);
    assert.doesNotMatch(src, /actor\.supabase/);
    const stub = readFileSync(join(process.cwd(), "src/lib/talent-agenda/booking-stub.ts"), "utf8");
    assert.doesNotMatch(stub, /starts_at|gte\(|tenant_id/);
  });
});
