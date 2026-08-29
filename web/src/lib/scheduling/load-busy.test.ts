import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { collectBusyIntervals } from "./load-busy";
import { isHoldUnexpired, unexpiredHoldOrFilter } from "./hold-expiry";
import { mapHoldInsertError } from "./reservation-hold";
import { computePublicSlotStarts, clampPublicSlotDays, parsePublicSlotFrom } from "./public-slots";
import { generateSlots } from "./slots";
import type { BookingHours } from "./hours-types";

const NOW = new Date("2026-03-09T12:00:00.000Z");

function mondayHours(horizonDays = 1): BookingHours {
  return {
    timezone: "UTC",
    weekly: {
      0: [],
      1: [{ startMin: 10 * 60, endMin: 12 * 60 }],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    },
    exceptions: [],
    slotMinutes: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 0,
    horizonDays,
  };
}

test("expired holds are dropped; unexpired and null-expiry stay", () => {
  const busy = collectBusyIntervals({
    now: NOW,
    holds: [
      {
        starts_at: "2026-03-09T10:00:00.000Z",
        ends_at: "2026-03-09T10:30:00.000Z",
        expires_at: "2026-03-09T11:00:00.000Z",
      },
      {
        starts_at: "2026-03-09T10:30:00.000Z",
        ends_at: "2026-03-09T11:00:00.000Z",
        expires_at: "2026-03-09T13:00:00.000Z",
      },
      {
        starts_at: "2026-03-09T11:00:00.000Z",
        ends_at: "2026-03-09T11:30:00.000Z",
        expires_at: null,
      },
    ],
  });
  assert.deepEqual(
    busy.map((b) => b.startsAt.toISOString()),
    ["2026-03-09T10:30:00.000Z", "2026-03-09T11:00:00.000Z"],
  );
});

test("cancelled talent_bookings are not busy", () => {
  const busy = collectBusyIntervals({
    bookings: [
      {
        starts_at: "2026-03-09T10:00:00.000Z",
        ends_at: "2026-03-09T11:00:00.000Z",
        status: "cancelled",
      },
      {
        starts_at: "2026-03-09T11:00:00.000Z",
        ends_at: "2026-03-09T12:00:00.000Z",
        status: "confirmed",
      },
    ],
  });
  assert.equal(busy.length, 1);
  assert.equal(busy[0]?.startsAt.toISOString(), "2026-03-09T11:00:00.000Z");
});

test("blocks union with holds and bookings", () => {
  const busy = collectBusyIntervals({
    now: NOW,
    holds: [
      {
        starts_at: "2026-03-09T10:00:00.000Z",
        ends_at: "2026-03-09T10:30:00.000Z",
        expires_at: null,
      },
    ],
    blocks: [
      { starts_at: "2026-03-09T11:00:00.000Z", ends_at: "2026-03-09T12:00:00.000Z" },
    ],
  });
  assert.equal(busy.length, 2);
});

test("public slots return ISO starts only and hide padded busy", () => {
  const starts = computePublicSlotStarts({
    hours: mondayHours(1),
    durationMinutes: 30,
    from: new Date("2026-03-09T00:00:00.000Z"),
    days: 1,
    busy: [
      {
        startsAt: new Date("2026-03-09T10:00:00.000Z"),
        endsAt: new Date("2026-03-09T10:30:00.000Z"),
      },
    ],
  });
  assert.deepEqual(starts, [
    "2026-03-09T10:30:00.000Z",
    "2026-03-09T11:00:00.000Z",
    "2026-03-09T11:30:00.000Z",
  ]);
  assert.equal(starts.every((s) => typeof s === "string"), true);
});

test("public days clamp to hours.horizonDays", () => {
  const starts = computePublicSlotStarts({
    hours: mondayHours(1),
    durationMinutes: 60,
    from: new Date("2026-03-09T00:00:00.000Z"),
    days: 30,
  });
  const days = new Set(starts.map((s) => s.slice(0, 10)));
  assert.deepEqual([...days], ["2026-03-09"]);
});

test("missing hours fail closed (no guessed slots)", () => {
  assert.deepEqual(
    computePublicSlotStarts({
      hours: null,
      durationMinutes: 30,
      from: new Date("2026-03-09T00:00:00.000Z"),
      days: 7,
    }),
    [],
  );
});

test("busy loader output is generateSlots-shaped and hides the occupied start", () => {
  const busy = collectBusyIntervals({
    now: NOW,
    bookings: [
      {
        starts_at: "2026-03-09T10:00:00.000Z",
        ends_at: "2026-03-09T11:00:00.000Z",
        status: "confirmed",
      },
    ],
  });
  const slots = generateSlots({
    hours: mondayHours(1),
    durationMinutes: 30,
    from: new Date("2026-03-09T00:00:00.000Z"),
    busy,
  });
  const isos = slots.map((s) => s.startsAt.toISOString());
  assert.ok(!isos.includes("2026-03-09T10:00:00.000Z"));
  assert.ok(!isos.includes("2026-03-09T10:30:00.000Z"));
  assert.ok(isos.includes("2026-03-09T11:00:00.000Z"));
});

test("23P01 maps to slot_taken; other errors stay unavailable", () => {
  const taken = mapHoldInsertError({ code: "23P01", message: "exclusion violation" });
  assert.equal(taken.code, "slot_taken");
  assert.match(taken.error, /just taken/i);
  const other = mapHoldInsertError({ code: "23505", message: "unique" });
  assert.equal(other.code, "unavailable");
});

test("clampPublicSlotDays and parsePublicSlotFrom stay bounded", () => {
  assert.equal(clampPublicSlotDays("0"), 1);
  assert.equal(clampPublicSlotDays("99"), 60);
  assert.equal(clampPublicSlotDays("nope"), 7);
  assert.equal(parsePublicSlotFrom("2026-03-09", NOW).toISOString(), "2026-03-09T00:00:00.000Z");
  assert.equal(parsePublicSlotFrom("garbage", NOW).toISOString(), NOW.toISOString());
});

test("unexpiredHoldOrFilter matches the PostgREST or-shape used by staff holds", () => {
  const filter = unexpiredHoldOrFilter(NOW);
  assert.equal(filter, `expires_at.is.null,expires_at.gt.${NOW.toISOString()}`);
  assert.equal(isHoldUnexpired(null, NOW), true);
  assert.equal(isHoldUnexpired("2026-03-09T11:59:00.000Z", NOW), false);
  assert.equal(isHoldUnexpired("2026-03-09T12:00:01.000Z", NOW), true);
});

test("placeTalentHold and checkTalentAvailability filter expired holds", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "talent-calendar", "hold-actions.ts"),
    "utf8",
  );
  const uses = src.split("unexpiredHoldOrFilter").length - 1;
  assert.ok(uses >= 3, `hold-actions must import and apply unexpiredHoldOrFilter (found ${uses})`);
});

test("public slots route returns starts only and does not re-add the hold reaper", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const route = readFileSync(
    join(here, "..", "..", "app", "api", "public", "booking", "slots", "route.ts"),
    "utf8",
  );
  assert.match(route, /s-maxage=30/);
  assert.match(route, /checkBookingSlots/);
  assert.match(route, /computePublicSlotStarts/);
  assert.doesNotMatch(route, /\.from\("talent_holds"\)/);
  assert.doesNotMatch(route, /\.from\("talent_bookings"\)/);
  assert.match(route, /loadBusyIntervals/);
  assert.match(route, /resolveTalentBookingMode/);
});
