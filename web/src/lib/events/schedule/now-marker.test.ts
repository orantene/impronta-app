import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlacedScheduleItem } from "./grouping";
import type { ScheduleItem } from "./model";
import { OPEN_ENDED_WINDOW_MS, itemWindows, nowItemIds } from "./now-marker";

let seq = 0;
function placed(over: Partial<ScheduleItem> & { title: string }): PlacedScheduleItem {
  seq += 1;
  const item: ScheduleItem = {
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
    timeTba: false,
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
  };
  return { item, timeLabel: null, endTimeLabel: null, dayOffset: 0 };
}

const at = (h: number, m = 0) => Date.UTC(2026, 10, 22, h, m); // 22 Nov 2026, UTC

test("an item with its own end runs [start, end); the boundary belongs to the next", () => {
  const a = placed({ title: "Doors", startsAt: new Date(at(1)).toISOString(), endsAt: new Date(at(2)).toISOString() });
  assert.deepEqual(nowItemIds([a], at(0, 59)), []);
  assert.deepEqual(nowItemIds([a], at(1)), [a.item.id]);
  assert.deepEqual(nowItemIds([a], at(1, 59)), [a.item.id]);
  assert.deepEqual(nowItemIds([a], at(2)), []);
});

test("an open-ended item runs until the next timed item starts", () => {
  const a = placed({ title: "DJ Sofia", startsAt: new Date(at(1)).toISOString() });
  const b = placed({ title: "Orquesta", startsAt: new Date(at(3)).toISOString() });
  const tba = placed({ title: "Sorpresa", timeTba: true });
  const list = [a, b, tba];
  assert.deepEqual(nowItemIds(list, at(2, 30)), [a.item.id]);
  assert.deepEqual(nowItemIds(list, at(3)), [b.item.id]);
  // The TBA row is never "now" and never ends anyone's window.
  assert.deepEqual(itemWindows(list).map((w) => w.id), [a.item.id, b.item.id]);
});

test("the last open-ended item stops being now after the window, so a finished night shows nothing", () => {
  const a = placed({ title: "Cierre", startsAt: new Date(at(4)).toISOString() });
  assert.deepEqual(nowItemIds([a], at(4) + OPEN_ENDED_WINDOW_MS - 1), [a.item.id]);
  assert.deepEqual(nowItemIds([a], at(4) + OPEN_ENDED_WINDOW_MS), []);
});

test("parallel items on two stages are both now; an end before the start is ignored", () => {
  const main = placed({ title: "Main", spaceId: "main", startsAt: new Date(at(1)).toISOString() });
  const patio = placed({ title: "Patio", spaceId: "patio", startsAt: new Date(at(1)).toISOString() });
  const bad = placed({ title: "Bad end", startsAt: new Date(at(5)).toISOString(), endsAt: new Date(at(4)).toISOString() });
  assert.deepEqual(nowItemIds([main, patio, bad], at(1, 30)).sort(), [main.item.id, patio.item.id].sort());
  // A corrupt end falls back to the open-ended rule: nothing after it, so the window applies.
  const w = itemWindows([bad]).find((x) => x.id === bad.item.id)!;
  assert.equal(w.end, at(5) + OPEN_ENDED_WINDOW_MS);
});

test("a non-finite clock marks nothing", () => {
  const a = placed({ title: "X", startsAt: new Date(at(1)).toISOString() });
  assert.deepEqual(nowItemIds([a], Number.NaN), []);
});
