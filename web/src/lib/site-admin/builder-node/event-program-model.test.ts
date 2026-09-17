/**
 * event_program — the pure half. Group-mode selection for `auto`, the
 * filterKinds → limit order, night placement with `+1`, TBA last, and the
 * "now" arithmetic the island runs after mount.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublicScheduleItem } from "@/app/(public)/_events/event-program-actions";
import { buildGroups, localDate, nowMarkerIndex, programHeading, resolveGroupMode, selectItems, timeLabel } from "./event-program-model";

const ZONE = "America/Cancun"; // UTC-5, no DST

function item(overrides: Partial<PublicScheduleItem> & { id: string }): PublicScheduleItem {
  return {
    kind: "set",
    title: overrides.id,
    subtitle: null,
    description: null,
    startsAt: null,
    endsAt: null,
    timeTba: false,
    sessionId: null,
    spaceId: null,
    performer: null,
    coverUrl: null,
    links: { href: null, label: null, instagram: null, website: null },
    sponsor: null,
    tags: [],
    sortOrder: 0,
    ...overrides,
  };
}

const NIGHT_A = { sessionId: "night-a", label: "sáb 21 nov", startsAt: "2026-11-22T01:00:00.000Z" }; // Sat 20:00 local
const NIGHT_B = { sessionId: "night-b", label: "dom 22 nov", startsAt: "2026-11-23T01:00:00.000Z" };

test("selectItems: filterKinds then limit, order preserved", () => {
  const items = [item({ id: "a", kind: "doors" }), item({ id: "b", kind: "set" }), item({ id: "c", kind: "performance" }), item({ id: "d", kind: "set" })];
  assert.deepEqual(selectItems(items, { filterKinds: ["set", "performance"], limit: 2 }).map((i) => i.id), ["b", "c"]);
  assert.deepEqual(selectItems(items, { filterKinds: [], limit: 1 }).map((i) => i.id), ["a"]);
  assert.equal(selectItems(items, { limit: 0 }).length, 4, "a limit below 1 is no limit");
  assert.equal(selectItems(items, { filterKinds: ["SET "] }).length, 2, "kinds are trimmed and case-folded");
});

test("resolveGroupMode: auto is night when >1 night, else place when >1 space, else none", () => {
  const twoSpaces = [item({ id: "a", spaceId: "s1" }), item({ id: "b", spaceId: "s2" })];
  assert.equal(resolveGroupMode("auto", { nights: [NIGHT_A, NIGHT_B] }, twoSpaces), "night");
  assert.equal(resolveGroupMode("auto", { nights: [NIGHT_A] }, twoSpaces), "place");
  assert.equal(resolveGroupMode("auto", { nights: [NIGHT_A] }, [item({ id: "a", spaceId: "s1" })]), "none");
  assert.equal(resolveGroupMode("none", { nights: [NIGHT_A, NIGHT_B] }, twoSpaces), "none", "an explicit mode wins");
  assert.equal(resolveGroupMode(undefined, { nights: [NIGHT_A, NIGHT_B] }, []), "night", "undefined is auto");
});

test("time labels: es 24h, en 12h lowered; no zone means no label", () => {
  assert.equal(timeLabel("2026-11-22T01:30:00.000Z", ZONE, "es"), "20:30");
  assert.equal(timeLabel("2026-11-22T06:30:00.000Z", ZONE, "en"), "1:30 am");
  assert.equal(timeLabel("2026-11-22T01:30:00.000Z", null, "es"), null);
  assert.equal(localDate("2026-11-22T06:30:00.000Z", ZONE), "2026-11-22");
  assert.equal(localDate("2026-11-22T01:30:00.000Z", ZONE), "2026-11-21");
});

test("buildGroups by night: the session decides the group, +1 marks the crossing, general leads", () => {
  const program = { nights: [NIGHT_A, NIGHT_B], spaces: [], zone: ZONE };
  const items = [
    item({ id: "late", sessionId: "night-a", startsAt: "2026-11-22T06:30:00.000Z" }), // 01:30 Sunday, Saturday's night
    item({ id: "open", sessionId: "night-a", startsAt: "2026-11-22T01:00:00.000Z" }),
    item({ id: "loose" }),
    item({ id: "sun", sessionId: "night-b", startsAt: "2026-11-23T02:00:00.000Z" }),
  ];
  const groups = buildGroups(program, items, "night", "es", true);
  assert.deepEqual(groups.map((g) => g.key), ["general", "night-a", "night-b"]);
  const a = groups[1]!;
  assert.deepEqual(a.items.map((p) => p.item.id), ["late", "open"], "the loader's order is kept; grouping never re-sorts");
  assert.equal(a.items[0]!.timeLabel, "01:30");
  assert.equal(a.items[0]!.dayOffset, 1);
  assert.equal(a.items[1]!.dayOffset, 0);
  assert.equal(groups[0]!.items[0]!.timeLabel, null, "a TBA row has no clock");
});

test("buildGroups by place: spaces in their order, unplaced last; times hidden when showTimes is false", () => {
  const program = { nights: [NIGHT_A], spaces: [{ id: "main", name: "Main stage", kind: "stage" }, { id: "patio", name: "Patio", kind: "space" }], zone: ZONE };
  const items = [item({ id: "p", spaceId: "patio", startsAt: "2026-11-22T02:00:00.000Z" }), item({ id: "m", spaceId: "main", startsAt: "2026-11-22T01:00:00.000Z" }), item({ id: "x" })];
  const groups = buildGroups(program, items, "place", "en", false);
  assert.deepEqual(groups.map((g) => g.label), ["Main stage", "Patio", "No place"]);
  assert.equal(groups[0]!.items[0]!.timeLabel, null, "set times off: no clock");
});

test("buildGroups none: one group, still +1 against the single night", () => {
  const program = { nights: [NIGHT_A], spaces: [], zone: ZONE };
  const groups = buildGroups(program, [item({ id: "late", startsAt: "2026-11-22T06:30:00.000Z" })], "none", "es", true);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.items[0]!.dayOffset, 1);
});

test("nowMarkerIndex: end, else next start, else three hours; TBA never runs", () => {
  const program = { nights: [NIGHT_A], spaces: [], zone: ZONE };
  const placed = buildGroups(program, [
    item({ id: "a", startsAt: "2026-11-22T01:00:00.000Z", endsAt: "2026-11-22T02:00:00.000Z" }),
    item({ id: "b", startsAt: "2026-11-22T02:00:00.000Z" }),
    item({ id: "c", startsAt: "2026-11-22T03:00:00.000Z" }),
    item({ id: "tba", timeTba: true }),
  ], "none", "es", true)[0]!.items;
  const t = (iso: string) => Date.parse(iso);
  assert.equal(nowMarkerIndex(placed, t("2026-11-22T00:59:00.000Z")), -1, "before doors");
  assert.equal(nowMarkerIndex(placed, t("2026-11-22T01:30:00.000Z")), 0);
  assert.equal(nowMarkerIndex(placed, t("2026-11-22T02:30:00.000Z")), 1, "open-ended runs to the next start");
  assert.equal(nowMarkerIndex(placed, t("2026-11-22T05:59:00.000Z")), 2, "the last item runs three hours");
  assert.equal(nowMarkerIndex(placed, t("2026-11-22T06:01:00.000Z")), -1);
});

test("programHeading: the block override wins only when non-empty", () => {
  assert.equal(programHeading("  ", { heading: "Programa" }), "Programa");
  assert.equal(programHeading("El programa", { heading: "Programa" }), "El programa");
});
