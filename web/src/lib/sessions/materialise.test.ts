/**
 * UNIT TEST — materialise.ts.
 *
 * Runs in `test:sessions`, which globs `src/lib/sessions/*.test.ts`, so this
 * file gates without touching `web/package.json`. That matters: the lane list
 * is the one line every manager edits, a lane-NAME collision loses coverage
 * silently, and the collision has happened three times in one day at six
 * managers. A glob lane is the version of that problem that cannot happen.
 *
 * Run: cd web && npm run test:sessions
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  DEFAULT_HORIZON_DAYS,
  decideMaterialisation,
  type SeriesInput,
} from "./materialise";
import { localTimeIn } from "./recurrence";

const MADRID = "Europe/Madrid";

function series(over: Partial<SeriesInput> = {}): SeriesInput {
  return {
    id: "series-1",
    tenantId: "tenant-1",
    title: "Vinyasa",
    localTime: "18:00",
    timeZone: MADRID,
    weekdays: [2],
    durationMinutes: 60,
    startsOn: "2027-03-01",
    endsOn: null,
    seats: 12,
    isActive: true,
    ...over,
  };
}

// ── The refusals ───────────────────────────────────────────────────────────
// Each of these is a case where an empty `create` list would be a plausible,
// silent, wrong answer. The whole point of the layer is that they are not
// empty lists.

test("an unconfirmed timezone refuses; it never falls back to UTC", () => {
  for (const tz of [null, "", "   "]) {
    const d = decideMaterialisation(series({ timeZone: tz }), [], new Date("2027-03-01T00:00:00Z"));
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.reason, "timezone_unconfirmed");
  }
});

test("an unconfirmed zone and an unknown zone are DIFFERENT refusals", () => {
  // Two problems with two different fixes: one is "open the venue screen", the
  // other is "that string is not a zone". One reason for both would send the
  // operator to the wrong place.
  const unknown = decideMaterialisation(
    series({ timeZone: "Mars/Olympus" }),
    [],
    new Date("2027-03-01T00:00:00Z"),
  );
  assert.equal(unknown.ok === false && unknown.reason, "timezone_unknown");
});

test("an empty weekday set refuses rather than producing nothing quietly", () => {
  const d = decideMaterialisation(series({ weekdays: [] }), [], new Date("2027-03-01T00:00:00Z"));
  assert.equal(d.ok === false && d.reason, "no_weekdays");
});

test("a malformed local time refuses", () => {
  const d = decideMaterialisation(
    series({ localTime: "25:00" }),
    [],
    new Date("2027-03-01T00:00:00Z"),
  );
  assert.equal(d.ok === false && d.reason, "invalid_local_time");
});

test("an inactive series refuses, and says so rather than returning nothing", () => {
  const d = decideMaterialisation(
    series({ isActive: false }),
    [],
    new Date("2027-03-01T00:00:00Z"),
  );
  assert.equal(d.ok === false && d.reason, "series_inactive");
});

test("seats of zero is legal (a full class); negative seats is not", () => {
  const ok = decideMaterialisation(series({ seats: 0 }), [], new Date("2027-03-01T00:00:00Z"));
  assert.equal(ok.ok, true);
  const bad = decideMaterialisation(series({ seats: -1 }), [], new Date("2027-03-01T00:00:00Z"));
  assert.equal(bad.ok === false && bad.reason, "invalid_seats");
});

// ── The DST guarantee, which is the whole reason the series stores a wall clock
// ───────────────────────────────────────────────────────────────────────────

test("every occurrence across the spring transition is still 18:00 local", () => {
  // Madrid springs forward on 2027-03-28. A 90-day window from 1 March spans it.
  const d = decideMaterialisation(series(), [], new Date("2027-03-01T00:00:00Z"));
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.ok(d.create.length >= 12, `expected a quarter of Tuesdays, got ${d.create.length}`);
  for (const occ of d.create) {
    assert.equal(
      localTimeIn(new Date(occ.startsAt), MADRID),
      "18:00",
      `${occ.localDate} drifted: ${occ.startsAt}`,
    );
  }
  // And the transition really is inside the window, or the assertion above is
  // vacuous — a test that proves DST safety must contain a DST change.
  const offsets = new Set(
    d.create.map((o) => new Date(o.startsAt).getUTCHours()),
  );
  assert.equal(offsets.size, 2, "the window did not actually span a transition");
});

test("the naive expansion this replaces WOULD have drifted", () => {
  // Guard-of-a-guard: proves the test above can fail. If adding 7x24h to the
  // first occurrence gave the same answers, the assertion proves nothing.
  const d = decideMaterialisation(series(), [], new Date("2027-03-01T00:00:00Z"));
  assert.equal(d.ok, true);
  if (!d.ok) return;
  const first = new Date(d.create[0]!.startsAt).getTime();
  const naive = new Date(first + 7 * 86_400_000 * (d.create.length - 1));
  assert.notEqual(localTimeIn(naive, MADRID), "18:00");
});

// ── Idempotence, which is what makes the cron safe to re-run ────────────────

test("occurrences already in sessions are counted, not re-created", () => {
  const now = new Date("2027-03-01T00:00:00Z");
  const first = decideMaterialisation(series(), [], now);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = decideMaterialisation(
    series(),
    first.create.map((o, i) => ({ id: `s${i}`, startsAt: o.startsAt, hasPool: true })),
    now,
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.create.length, 0, "a second run wanted to create rows");
  assert.equal(second.existing, first.create.length);
});

test("an existing occurrence matches on the INSTANT, not the string", () => {
  const now = new Date("2027-03-01T00:00:00Z");
  const first = decideMaterialisation(series(), [], now);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  // Postgres serialises timestamptz with an offset, not always as Z. The same
  // instant written two ways must not produce a duplicate session.
  const asOffset = first.create.map((o, i) => ({
    id: `s${i}`,
    startsAt: new Date(o.startsAt).toISOString().replace("Z", "+00:00"),
    hasPool: true,
  }));
  const second = decideMaterialisation(series(), asOffset, now);
  assert.equal(second.ok === true && second.create.length, 0);
});

// ── The window ─────────────────────────────────────────────────────────────

test("the past is never materialised, however old the series is", () => {
  const now = new Date("2027-06-01T00:00:00Z");
  const d = decideMaterialisation(series({ startsOn: "2020-01-01" }), [], now);
  assert.equal(d.ok, true);
  if (!d.ok) return;
  for (const occ of d.create) {
    assert.ok(
      occ.localDate >= "2027-06-01",
      `materialised the past: ${occ.localDate}`,
    );
  }
});

test("a series that ended produces nothing, and that is ok, not a refusal", () => {
  // The distinction the whole module exists for: nothing to do is not an error.
  const d = decideMaterialisation(
    series({ endsOn: "2027-01-01" }),
    [],
    new Date("2027-06-01T00:00:00Z"),
  );
  assert.equal(d.ok, true);
  assert.equal(d.ok === true && d.create.length, 0);
});

test("the horizon is honoured", () => {
  const now = new Date("2027-06-01T00:00:00Z");
  const wide = decideMaterialisation(series({ startsOn: "2027-06-01" }), [], now);
  const narrow = decideMaterialisation(series({ startsOn: "2027-06-01" }), [], now, 7);
  assert.equal(wide.ok && narrow.ok, true);
  if (!wide.ok || !narrow.ok) return;
  assert.ok(narrow.create.length < wide.create.length);
  assert.ok(narrow.create.length <= 2, "a week holds at most two Tuesdays");
  assert.equal(DEFAULT_HORIZON_DAYS, 90);
});

// ── Pool backfill: the hole a session-only existence check leaves ───────────

test("an existing session with NO pool is reported for backfill, not skipped", () => {
  // The failure this exists for: the session INSERT landed, the pool creation
  // did not. A re-run that only asks "does the session exist" says yes and
  // moves on, and the class sits on the schedule for ever with nothing to sell.
  const now = new Date("2027-03-01T00:00:00Z");
  const first = decideMaterialisation(series(), [], now);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const half = first.create.map((o, i) => ({
    id: `s${i}`,
    startsAt: o.startsAt,
    hasPool: i % 2 === 0,
  }));
  const second = decideMaterialisation(series(), half, now);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.create.length, 0, "nothing to create; every session exists");
  assert.equal(
    second.poolBackfill.length,
    half.filter((h) => !h.hasPool).length,
  );
  assert.deepEqual(
    second.poolBackfill,
    half.filter((h) => !h.hasPool).map((h) => h.id),
  );
});

test("a poolless session OUTSIDE the window is not backfilled", () => {
  // Repairing a session the series no longer produces would resurrect capacity
  // for a class that is not on the schedule.
  const now = new Date("2027-03-01T00:00:00Z");
  const d = decideMaterialisation(
    series(),
    [{ id: "ancient", startsAt: "2020-01-07T17:00:00.000Z", hasPool: false }],
    now,
  );
  assert.equal(d.ok, true);
  assert.equal(d.ok === true && d.poolBackfill.length, 0);
});

test("a fully materialised, fully pooled series asks for nothing", () => {
  const now = new Date("2027-03-01T00:00:00Z");
  const first = decideMaterialisation(series(), [], now);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = decideMaterialisation(
    series(),
    first.create.map((o, i) => ({ id: `s${i}`, startsAt: o.startsAt, hasPool: true })),
    now,
  );
  assert.equal(second.ok === true && second.create.length, 0);
  assert.equal(second.ok === true && second.poolBackfill.length, 0);
});

// ── The gap collision: two wall clocks, one instant ────────────────────────

test("a SHIFTED occurrence colliding with an instant another series holds is refused", () => {
  // Madrid jumps 02:00 -> 03:00 on 2027-03-28. A 02:30 series resolves to the
  // same instant as a 03:30 series. Two sessions there means two tier pools
  // selling one room, and nothing refuses it while the pools are parentless.
  const now = new Date("2027-03-28T00:00:00Z");
  const at0330 = decideMaterialisation(
    series({ localTime: "03:30", weekdays: [7], startsOn: "2027-03-28", endsOn: "2027-03-28" }),
    [],
    now,
  );
  assert.equal(at0330.ok, true);
  if (!at0330.ok) return;
  assert.equal(at0330.create.length, 1);
  assert.equal(at0330.create[0]!.kind, "exact");

  const at0230 = decideMaterialisation(
    series({ localTime: "02:30", weekdays: [7], startsOn: "2027-03-28", endsOn: "2027-03-28" }),
    [],
    now,
    DEFAULT_HORIZON_DAYS,
    [{ sessionId: "sess-0330", startsAt: at0330.create[0]!.startsAt, title: "Salsa" }],
  );
  assert.equal(at0230.ok, true);
  if (!at0230.ok) return;
  // Same instant, proven rather than assumed — otherwise this test passes for
  // the wrong reason the day the resolver changes.
  assert.equal(at0230.skipped.length, 1, "the shifted occurrence was not refused");
  assert.equal(at0230.skipped[0]!.reason, "gap_shift_collision");
  // The refusal must NAME what it collided with. A refusal a human cannot
  // distinguish from a different refusal is the defect this scope risks.
  assert.equal(at0230.skipped[0]!.collidesWithSessionId, "sess-0330");
  assert.equal(at0230.skipped[0]!.collidesWithTitle, "Salsa");
  assert.equal(at0230.create.length, 0);
  assert.equal(
    Date.parse(at0230.skipped[0]!.startsAt),
    Date.parse(at0330.create[0]!.startsAt),
    "the fixture did not actually collide",
  );
});

test("an EXACT occurrence on an occupied instant is NOT refused", () => {
  // Two classes at 18:00 in two different rooms is normal, and a unique index
  // on (venue, starts_at) would have refused it. Only a shift is suspect.
  const now = new Date("2027-06-01T00:00:00Z");
  const first = decideMaterialisation(series({ startsOn: "2027-06-01" }), [], now);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = decideMaterialisation(
    series({ id: "series-2", startsOn: "2027-06-01" }),
    [],
    now,
    DEFAULT_HORIZON_DAYS,
    first.create.map((o, i) => ({ sessionId: `other-${i}`, startsAt: o.startsAt, title: "Vinyasa B" })),
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.skipped.length, 0, "refused a legitimate second room");
  assert.equal(second.create.length, first.create.length);
});

test("a shifted occurrence on a FREE instant is created normally", () => {
  const now = new Date("2027-03-28T00:00:00Z");
  const d = decideMaterialisation(
    series({ localTime: "02:30", weekdays: [7], startsOn: "2027-03-28", endsOn: "2027-03-28" }),
    [],
    now,
  );
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.create.length, 1);
  assert.equal(d.create[0]!.kind, "shifted");
  assert.equal(d.skipped.length, 0);
});

test("an ordinary occurrence carries kind 'exact', so the collision rule stays narrow", () => {
  const d = decideMaterialisation(series(), [], new Date("2027-06-01T00:00:00Z"));
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.ok(d.create.length > 0);
  for (const occ of d.create) assert.equal(occ.kind, "exact");
});
