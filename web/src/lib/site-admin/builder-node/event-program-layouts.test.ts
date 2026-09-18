/**
 * event_program — the pure helpers behind the `schedule` and `lineup`
 * layouts: 30-minute slots from the earliest item to the latest end, one
 * column per space, blocks spanning end / next start / one slot, TBA apart;
 * the lineup filter and the initials fallback.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublicScheduleItem } from "@/app/(public)/_events/event-program-actions";
import { initials, isLineupItem, lineupItems, lineupName } from "./event-program-lineup-tiles";
import { buildGroups } from "./event-program-model";
import { SCHEDULE_ALL_KEY, SCHEDULE_NO_PLACE_KEY, buildScheduleGrid } from "./event-program-schedule-grid";

const ZONE = "America/Cancun";

function item(overrides: Partial<PublicScheduleItem> & { id: string }): PublicScheduleItem {
  return {
    kind: "set", title: overrides.id, subtitle: null, description: null, startsAt: null, endsAt: null, timeTba: false,
    sessionId: null, spaceId: null, performer: null, coverUrl: null,
    media: { gallery: [], video: null },
    links: { href: null, label: null, instagram: null, website: null }, sponsor: null, tags: [], sortOrder: 0,
    ...overrides,
  };
}

const SPACES = [{ id: "main", name: "Main", kind: "stage" }, { id: "patio", name: "Patio", kind: "space" }];

function placed(items: PublicScheduleItem[], spaces = SPACES) {
  return buildGroups({ nights: [], spaces, zone: ZONE }, items, "none", "es", true)[0]!.items;
}

test("schedule grid: columns per space, 30-minute rows from the earliest start to the latest end", () => {
  const grid = buildScheduleGrid(placed([
    item({ id: "a", spaceId: "main", startsAt: "2026-11-22T01:00:00.000Z", endsAt: "2026-11-22T02:00:00.000Z" }),
    item({ id: "b", spaceId: "patio", startsAt: "2026-11-22T01:15:00.000Z" }), // open-ended, next in patio at 02:00
    item({ id: "c", spaceId: "patio", startsAt: "2026-11-22T02:00:00.000Z" }), // open-ended, last: one slot
  ]), SPACES, ZONE, "es");
  assert.deepEqual(grid.columns.map((c) => c.key), ["main", "patio"]);
  assert.deepEqual(grid.slotLabels, ["20:00", "20:30", "21:00"]);
  const by = Object.fromEntries(grid.blocks.map((b) => [b.placed.item.id, b]));
  assert.deepEqual([by.a!.column, by.a!.rowStart, by.a!.rowSpan], [0, 1, 2]);
  assert.deepEqual([by.b!.column, by.b!.rowStart, by.b!.rowSpan], [1, 1, 2], "01:15 floors to the 01:00 slot; runs to the next start at 02:00");
  assert.deepEqual([by.c!.column, by.c!.rowStart, by.c!.rowSpan], [1, 3, 1], "last open-ended item takes one slot");
  assert.equal(grid.unplaced.length, 0);
});

test("schedule grid: no spaces means one column; a loose item adds a trailing column; TBA is listed apart", () => {
  const one = buildScheduleGrid(placed([item({ id: "a", startsAt: "2026-11-22T01:00:00.000Z" })], []), [], ZONE, "en");
  assert.deepEqual(one.columns, [{ key: SCHEDULE_ALL_KEY, label: "" }]);
  assert.equal(one.blocks[0]!.column, 0);
  assert.deepEqual(one.slotLabels, ["8:00 pm"]);

  const loose = buildScheduleGrid(placed([
    item({ id: "a", spaceId: "main", startsAt: "2026-11-22T01:00:00.000Z" }),
    item({ id: "x", startsAt: "2026-11-22T01:00:00.000Z" }),
    item({ id: "tba", timeTba: true }),
  ]), SPACES, ZONE, "es");
  assert.deepEqual(loose.columns.map((c) => c.key), ["main", "patio", SCHEDULE_NO_PLACE_KEY]);
  assert.equal(loose.blocks.find((b) => b.placed.item.id === "x")!.column, 2);
  assert.deepEqual(loose.unplaced.map((p) => p.item.id), ["tba"]);
});

test("schedule grid: nothing timed yields columns and no rows", () => {
  const grid = buildScheduleGrid(placed([item({ id: "tba", timeTba: true })]), SPACES, ZONE, "es");
  assert.equal(grid.columns.length, 2, "no loose column when nothing timed is loose");
  assert.deepEqual(grid.slotLabels, []);
  assert.deepEqual(grid.blocks, []);
  assert.equal(grid.unplaced.length, 1);
});

test("lineup: only performers or covers make tiles; name falls back to the title; initials", () => {
  const doors = item({ id: "doors", kind: "doors" });
  const ana = item({ id: "ana", performer: { name: "DJ Ana Sofía", tba: false, profileHref: "/t/ana", heroUrl: null, instagram: null, bio: null } });
  const secret = item({ id: "secret", title: "Secret guest", performer: { name: "", tba: true, profileHref: null, heroUrl: null, instagram: null, bio: null } });
  const art = item({ id: "art", title: "Visuals", coverUrl: "https://cdn.example/x.jpg" });
  assert.equal(isLineupItem(doors), false);
  assert.deepEqual(lineupItems([doors, ana, secret, art]).map((i) => i.id), ["ana", "secret", "art"]);
  assert.equal(lineupName(ana, "TBA"), "DJ Ana Sofía");
  assert.equal(lineupName(secret, "Artista por anunciar"), "Artista por anunciar");
  assert.equal(lineupName(art, "TBA"), "Visuals");
  assert.equal(initials("DJ Ana Sofía"), "DS");
  assert.equal(initials("Marco"), "M");
  assert.equal(initials("  "), "");
  assert.equal(initials("!!! ana"), "A", "punctuation-only words are skipped");
});
