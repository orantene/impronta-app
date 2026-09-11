import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  generateSessionsForSeries,
  sessionWindowsOverlap,
  upsertSessionSeries,
} from "./series-write";

test("overlapping windows are the venue refusal", () => {
  assert.equal(
    sessionWindowsOverlap("2026-10-05T10:00:00.000Z", "2026-10-05T11:00:00.000Z", "2026-10-05T10:30:00.000Z", "2026-10-05T11:30:00.000Z"),
    true,
  );
  assert.equal(
    sessionWindowsOverlap("2026-10-05T10:00:00.000Z", "2026-10-05T11:00:00.000Z", "2026-10-05T11:00:00.000Z", "2026-10-05T12:00:00.000Z"),
    false,
  );
});

test("upsert refuses no instructor and a past end date", async () => {
  const admin = { from: () => ({}) };
  const missing = await upsertSessionSeries(admin, {
    tenantId: "t1",
    title: "Mat",
    localTime: "10:00",
    timeZone: "UTC",
    weekdays: [1],
    durationMinutes: 60,
    seats: 10,
    startsOn: "2026-10-05",
    venueId: "11111111-1111-4111-8111-111111111111",
    instructorUserId: "",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "no_instructor");

  const past = await upsertSessionSeries(admin, {
    tenantId: "t1",
    title: "Mat",
    localTime: "10:00",
    timeZone: "UTC",
    weekdays: [1],
    durationMinutes: 60,
    seats: 10,
    startsOn: "2026-10-05",
    endsOn: "2026-10-01",
    venueId: "11111111-1111-4111-8111-111111111111",
    instructorUserId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(past.ok, false);
  if (!past.ok) assert.equal(past.reason, "past");
});

test("generate refuses a past until date and a series with no instructor", async () => {
  const past = await generateSessionsForSeries(
    { from: () => ({}) },
    { tenantId: "t1", seriesId: "s1", untilDate: "2020-01-01", now: new Date("2026-10-01T00:00:00.000Z") },
  );
  assert.equal(past.ok, false);
  if (!past.ok) assert.equal(past.reason, "past");

  const admin = {
    from: (table: string) => {
      if (table !== "session_series") throw new Error(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                tenant_id: "t1",
                title: "Mat",
                local_time: "10:00:00",
                timezone: "UTC",
                weekdays: [1],
                duration_minutes: 60,
                seats: 10,
                starts_on: "2026-10-05",
                ends_on: null,
                venue_id: "v1",
                offering_id: null,
                instructor_user_id: null,
                is_active: true,
              },
              error: null,
            }),
          }),
        }),
      };
    },
  };
  const none = await generateSessionsForSeries(admin, {
    tenantId: "t1",
    seriesId: "s1",
    untilDate: "2026-10-05",
    now: new Date("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.reason, "no_instructor");
});

test("generate refuses when another scheduled session occupies the room", async () => {
  const series = {
    tenant_id: "t1",
    title: "Mat",
    local_time: "10:00:00",
    timezone: "UTC",
    weekdays: [1],
    duration_minutes: 60,
    seats: 10,
    starts_on: "2026-10-05",
    ends_on: null,
    venue_id: "v1",
    offering_id: null,
    instructor_user_id: "u1",
    is_active: true,
  };
  const other = {
    id: "other",
    starts_at: "2026-10-05T10:00:00.000Z",
    ends_at: "2026-10-05T11:00:00.000Z",
    title: "Other",
    series_id: "other-series",
    status: "scheduled",
  };
  let sessionReads = 0;
  const thenable = (data: unknown) => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve, reject),
    };
    return api;
  };
  const admin = {
    from: (table: string) => {
      if (table === "session_series") return thenable(series);
      sessionReads += 1;
      return thenable(sessionReads === 1 ? [] : [other]);
    },
  };
  const result = await generateSessionsForSeries(admin, {
    tenantId: "t1",
    seriesId: "s1",
    untilDate: "2026-10-05",
    now: new Date("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "overlapping_room");
});

test("series editor migration adds instructor columns", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231216000_session_series_editor.sql"),
    "utf8",
  );
  assert.match(sql, /instructor_user_id/);
  assert.match(sql, /session_venue_overlaps/);
});
