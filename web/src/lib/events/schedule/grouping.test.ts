import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GENERAL_GROUP_KEY,
  UNPLACED_GROUP_KEY,
  detectOverlaps,
  groupItemsByNight,
  groupItemsBySpace,
  scheduleTimeLabel,
  sortScheduleItems,
} from "./grouping";
import type { ScheduleItem } from "./model";

// America/Cancun is UTC-5 all year. Saturday 21 Nov 2026 21:00 local is
// 2026-11-22T02:00Z; Sunday 03:00 local is 2026-11-22T08:00Z.
const ZONE = "America/Cancun";
const SAT = { id: "sat", startsAt: "2026-11-22T02:00:00.000Z", endsAt: "2026-11-22T08:00:00.000Z" };
const SUN = { id: "sun", startsAt: "2026-11-23T02:00:00.000Z", endsAt: "2026-11-23T08:00:00.000Z" };

const MAIN = { id: "main", name: "Main Stage", kind: "stage", sortOrder: 0 };
const PATIO = { id: "patio", name: "Patio", kind: "area", sortOrder: 1 };

let seq = 0;
function item(over: Partial<ScheduleItem> & { title: string }): ScheduleItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    tenantId: "t",
    eventId: "e",
    sessionId: null,
    spaceId: null,
    kind: "set",
    subtitle: null,
    description: null,
    startsAt: null,
    endsAt: null,
    performerTalentProfileId: null,
    performerName: null,
    performerTba: false,
    coverMediaId: null,
    media: {},
    links: {},
    sponsor: {},
    tags: [],
    visibility: "public",
    status: "published",
    sortOrder: 0,
    i18n: undefined,
    createdAt: null,
    updatedAt: null,
    ...over,
    timeTba: over.timeTba ?? over.startsAt == null,
  };
}

const local = (day: string, hm: string) => `2026-11-${day}T${hm}:00.000-05:00`;

// ── time labels ────────────────────────────────────────────────────────────

test("time labels: 24h in es, lower-case period in en", () => {
  assert.equal(scheduleTimeLabel(local("21", "18:00"), ZONE, "es"), "18:00");
  assert.equal(scheduleTimeLabel(local("22", "01:30"), ZONE, "en"), "1:30 am");
  assert.equal(scheduleTimeLabel(local("21", "21:00"), ZONE, "en"), "9:00 pm");
  assert.equal(scheduleTimeLabel(local("21", "21:00"), null, "en"), null);
});

// ── grouping by night ──────────────────────────────────────────────────────

test("across midnight: the 01:30 item groups under Saturday with dayOffset 1", () => {
  const items = [
    item({ title: "Closing", sessionId: "sat", startsAt: local("22", "01:30") }),
    item({ title: "Doors", kind: "doors", sessionId: "sat", startsAt: local("21", "21:00") }),
    item({ title: "Headliner", sessionId: "sat", startsAt: local("21", "23:00") }),
  ];
  const groups = groupItemsByNight(items, [SAT], ZONE, { locale: "en" });
  assert.equal(groups.length, 1);
  const [sat] = groups;
  assert.equal(sat.key, "sat");
  assert.equal(sat.nightDate, "2026-11-21");
  assert.match(sat.label, /Saturday/);
  assert.match(sat.label, /November 21/);
  assert.deepEqual(
    sat.items.map((p) => [p.item.title, p.timeLabel, p.dayOffset]),
    [
      ["Doors", "9:00 pm", 0],
      ["Headliner", "11:00 pm", 0],
      ["Closing", "1:30 am", 1],
    ],
  );
});

test("multi-night: one group per session in session order, items in each", () => {
  const items = [
    item({ title: "Sun opener", sessionId: "sun", startsAt: local("22", "21:00") }),
    item({ title: "Sat opener", sessionId: "sat", startsAt: local("21", "21:00") }),
    item({ title: "Sun late", sessionId: "sun", startsAt: local("23", "00:30") }),
  ];
  const groups = groupItemsByNight(items, [SUN, SAT], ZONE, { locale: "es" });
  assert.deepEqual(groups.map((g) => g.key), ["sat", "sun"]);
  assert.deepEqual(groups[1].items.map((p) => [p.item.title, p.timeLabel, p.dayOffset]), [
    ["Sun opener", "21:00", 0],
    ["Sun late", "00:30", 1],
  ]);
  assert.match(groups[0].label, /sábado/);
  assert.match(groups[1].label, /domingo/);
});

test("items with no session (or an unknown one) lead in a general group; empty sessions produce no group", () => {
  const items = [
    item({ title: "Sat set", sessionId: "sat", startsAt: local("21", "22:00") }),
    item({ title: "Welcome", sessionId: null, startsAt: local("21", "18:00") }),
    item({ title: "Orphan", sessionId: "deleted-night", startsAt: local("21", "19:00") }),
  ];
  const groups = groupItemsByNight(items, [SAT, SUN], ZONE);
  assert.deepEqual(groups.map((g) => g.key), [GENERAL_GROUP_KEY, "sat"]);
  assert.equal(groups[0].label, "General");
  assert.equal(groups[0].nightDate, null);
  assert.deepEqual(groups[0].items.map((p) => [p.item.title, p.dayOffset]), [["Welcome", 0], ["Orphan", 0]]);
});

test("TBA items sort last inside their group, then by sort_order; same start sorts by sort_order", () => {
  const items = [
    item({ title: "Surprise guest", sessionId: "sat", timeTba: true, sortOrder: 2 }),
    item({ title: "Special", sessionId: "sat", timeTba: true, sortOrder: 1 }),
    item({ title: "B stage-ish", sessionId: "sat", startsAt: local("21", "22:00"), sortOrder: 1 }),
    item({ title: "A first", sessionId: "sat", startsAt: local("21", "22:00"), sortOrder: 0 }),
    item({ title: "Late", sessionId: "sat", startsAt: local("21", "23:00") }),
  ];
  const [sat] = groupItemsByNight(items, [SAT], ZONE, { locale: "es" });
  assert.deepEqual(sat.items.map((p) => [p.item.title, p.timeLabel]), [
    ["A first", "22:00"],
    ["B stage-ish", "22:00"],
    ["Late", "23:00"],
    ["Special", null],
    ["Surprise guest", null],
  ]);
  assert.deepEqual(sortScheduleItems(items).map((i) => i.title), ["A first", "B stage-ish", "Late", "Special", "Surprise guest"]);
});

test("no zone: groups still form, labels refuse rather than guess", () => {
  const items = [item({ title: "Set", sessionId: "sat", startsAt: local("22", "01:30") })];
  const [sat] = groupItemsByNight(items, [SAT], null, { locale: "en" });
  assert.equal(sat.nightDate, null);
  assert.equal(sat.items[0].timeLabel, null);
  assert.equal(sat.items[0].dayOffset, 0);
  assert.match(sat.label, /to be confirmed/i);
});

// ── grouping by space ──────────────────────────────────────────────────────

test("groupItemsBySpace: spaces in their order, unplaced last, items sorted inside", () => {
  const items = [
    item({ title: "Patio chill", spaceId: "patio", startsAt: local("21", "22:00") }),
    item({ title: "Main late", spaceId: "main", startsAt: local("21", "23:00") }),
    item({ title: "Main early", spaceId: "main", startsAt: local("21", "21:00") }),
    item({ title: "Doors", spaceId: null, startsAt: local("21", "20:00") }),
  ];
  const groups = groupItemsBySpace(items, [PATIO, MAIN], ZONE, { locale: "es" });
  assert.deepEqual(groups.map((g) => [g.key, g.label]), [
    ["main", "Main Stage"],
    ["patio", "Patio"],
    [UNPLACED_GROUP_KEY, "Sin lugar"],
  ]);
  assert.deepEqual(groups[0].items.map((p) => [p.item.title, p.timeLabel]), [["Main early", "21:00"], ["Main late", "23:00"]]);
});

// ── overlaps ───────────────────────────────────────────────────────────────

test("overlaps: same space crossing intervals warn; touching intervals do not", () => {
  const a = item({ title: "A", spaceId: "main", startsAt: local("21", "21:00"), endsAt: local("21", "22:30") });
  const b = item({ title: "B", spaceId: "main", startsAt: local("21", "22:00"), endsAt: local("21", "23:00") });
  const c = item({ title: "C", spaceId: "main", startsAt: local("21", "23:00"), endsAt: local("22", "00:00") });
  const found = detectOverlaps([c, b, a]);
  assert.deepEqual(found.map((o) => [o.spaceId, o.a.title, o.b.title]), [["main", "A", "B"]]);
});

test("overlaps: different spaces never overlap, nor do items without a space or TBA items", () => {
  const a = item({ title: "A", spaceId: "main", startsAt: local("21", "21:00"), endsAt: local("21", "23:00") });
  const b = item({ title: "B", spaceId: "patio", startsAt: local("21", "21:30"), endsAt: local("21", "23:00") });
  const c = item({ title: "C", spaceId: null, startsAt: local("21", "21:30"), endsAt: local("21", "23:00") });
  const d = item({ title: "D", spaceId: "main", timeTba: true });
  assert.deepEqual(detectOverlaps([a, b, c, d]), []);
});

test("overlaps: an open-ended item runs until the next start in its space", () => {
  const a = item({ title: "A open", spaceId: "main", startsAt: local("21", "21:00") });
  const b = item({ title: "B", spaceId: "main", startsAt: local("21", "22:00"), endsAt: local("21", "23:00") });
  // A ends when B starts: no overlap.
  assert.deepEqual(detectOverlaps([a, b]), []);
  // An open-ended item starting inside B's explicit window is still a crossing.
  const d = item({ title: "D open", spaceId: "main", startsAt: local("21", "22:30") });
  const found = detectOverlaps([a, b, d]);
  assert.deepEqual(found.map((o) => [o.a.title, o.b.title]), [["B", "D open"]]);
});

test("overlaps: two open-ended items starting together on one stage overlap", () => {
  const a = item({ title: "A", spaceId: "main", startsAt: local("21", "21:00"), sortOrder: 0 });
  const b = item({ title: "B", spaceId: "main", startsAt: local("21", "21:00"), sortOrder: 1 });
  const found = detectOverlaps([a, b]);
  assert.deepEqual(found.map((o) => [o.a.title, o.b.title]), [["A", "B"]]);
});
