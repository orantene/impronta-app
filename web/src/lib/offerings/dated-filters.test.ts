import assert from "node:assert/strict";
import test from "node:test";

import { filterDatedItems, parseDatedFilters, type DatedListItem } from "./dated-filters";

const items: DatedListItem[] = [
  { id: "a", title: "Sunrise paddle", nextStartsAt: "2026-11-10T11:00:00Z", fromPriceCents: 4500, durationMinutes: 120, languages: ["English", "Español"], hasOpenDate: true },
  { id: "b", title: "Wine tasting", nextStartsAt: "2026-12-01T20:00:00Z", fromPriceCents: 9000, durationMinutes: 90, languages: ["Español"], hasOpenDate: true },
  { id: "c", title: "Pottery course", nextStartsAt: null, fromPriceCents: 20000, durationMinutes: 180, languages: [], hasOpenDate: false },
];

test("parse: a query string becomes typed filters; garbage is ignored", () => {
  const f = parseDatedFilters(new URLSearchParams("from=2026-11-01&to=2026-11-30&max=5000&min=1000&dur=120&lang=Español&x=1"));
  assert.deepEqual(f, { from: "2026-11-01", to: "2026-11-30", minPriceCents: 100000, maxPriceCents: 500000, maxDurationMinutes: 120, language: "Español" });
  assert.deepEqual(parseDatedFilters(new URLSearchParams("from=soon&max=abc&dur=-4")), {});
});

test("no filters: everything with an open date, sorted by next date; undated last", () => {
  const out = filterDatedItems(items, {});
  assert.deepEqual(out.map((i) => i.id), ["a", "b"]);
});

test("date window uses the next open date", () => {
  assert.deepEqual(filterDatedItems(items, { from: "2026-11-15" }).map((i) => i.id), ["b"]);
  assert.deepEqual(filterDatedItems(items, { to: "2026-11-30" }).map((i) => i.id), ["a"]);
});

test("price is a from-price in cents; duration is a maximum; language is case and accent insensitive", () => {
  assert.deepEqual(filterDatedItems(items, { maxPriceCents: 5000 }).map((i) => i.id), ["a"]);
  assert.deepEqual(filterDatedItems(items, { minPriceCents: 5000 }).map((i) => i.id), ["b"]);
  assert.deepEqual(filterDatedItems(items, { maxDurationMinutes: 90 }).map((i) => i.id), ["b"]);
  assert.deepEqual(filterDatedItems(items, { language: "espanol" }).map((i) => i.id), ["a", "b"]);
});
