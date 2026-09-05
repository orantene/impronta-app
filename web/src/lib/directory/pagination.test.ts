import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDirectoryPageWindow,
  directoryPageHref,
  parsePageParam,
} from "./pagination";

/**
 * The numbers are production's: 53 publicly listed profiles at a page size of
 * 24 (DIRECTORY_PAGE_SIZE_DEFAULT), which is 3 pages whose last one holds 5.
 * That short last page is where this kind of code breaks, so it is the case
 * most of these assertions are about.
 */
const TOTAL = 53;
const SIZE = 24;

test("page size is pinned: the first page is exactly one page of rows", () => {
  const w = buildDirectoryPageWindow(TOTAL, 1, SIZE);
  assert.equal(w.pageSize, 24);
  assert.equal(w.offset, 0);
  assert.equal(w.firstItem, 1);
  assert.equal(w.lastItem, 24);
});

test("the last page is SHORT and its bounds do not overrun the total", () => {
  // The bug this exists to prevent: reporting "49-72 of 53".
  const w = buildDirectoryPageWindow(TOTAL, 3, SIZE);
  assert.equal(w.totalPages, 3);
  assert.equal(w.offset, 48);
  assert.equal(w.firstItem, 49);
  assert.equal(w.lastItem, 53);
  assert.equal(w.next, null, "there is nothing after the last page");
  assert.equal(w.prev, 2);
});

test("page count uses ceiling division, so the remainder is never stranded", () => {
  // floor(53/24) = 2 would leave 5 profiles behind an unreachable page while
  // the header still promised 53.
  assert.equal(buildDirectoryPageWindow(53, 1, 24).totalPages, 3);
  assert.equal(buildDirectoryPageWindow(48, 1, 24).totalPages, 2, "exact multiple");
  assert.equal(buildDirectoryPageWindow(49, 1, 24).totalPages, 3, "one over");
  assert.equal(buildDirectoryPageWindow(1, 1, 24).totalPages, 1);
});

test("every profile is covered exactly once across all pages", () => {
  // The property that actually matters: no gap, no overlap.
  const seen: number[] = [];
  const { totalPages } = buildDirectoryPageWindow(TOTAL, 1, SIZE);
  for (let p = 1; p <= totalPages; p += 1) {
    const w = buildDirectoryPageWindow(TOTAL, p, SIZE);
    for (let i = w.firstItem; i <= w.lastItem; i += 1) seen.push(i);
  }
  assert.deepEqual(seen, Array.from({ length: TOTAL }, (_, i) => i + 1));
});

test("a page beyond the end clamps to the last page rather than showing nothing", () => {
  const w = buildDirectoryPageWindow(TOTAL, 99, SIZE);
  assert.equal(w.page, 3);
  assert.equal(w.lastItem, 53);
});

test("an empty directory is one page, not zero", () => {
  const w = buildDirectoryPageWindow(0, 1, SIZE);
  assert.equal(w.totalPages, 1);
  assert.equal(w.firstItem, 0);
  assert.equal(w.lastItem, 0);
  assert.equal(w.next, null);
  assert.equal(w.prev, null);
});

test("a junk ?page= value is page 1, never a crash and never a 404", () => {
  for (const raw of [undefined, "", "abc", "0", "-3", "2.5", " ", "1e3"]) {
    assert.equal(parsePageParam(raw), 1, `${JSON.stringify(raw)} should be page 1`);
  }
  assert.equal(parsePageParam("2"), 2);
  assert.equal(parsePageParam(["3", "4"]), 3, "first value wins");
});

test("numbered links collapse the middle but always keep first and last", () => {
  const w = buildDirectoryPageWindow(24 * 20, 10, SIZE);
  assert.equal(w.totalPages, 20);
  assert.equal(w.pages[0], 1);
  assert.equal(w.pages[w.pages.length - 1], 20);
  assert.ok(w.pages.includes(10), "the current page is always shown");
  assert.ok(w.pages.includes(null), "a long list has a gap");
});

test("page 1 has no ?page= param, so the first page has ONE url", () => {
  const params = new URLSearchParams({ country: "Mexico" });
  assert.equal(
    directoryPageHref("/global-directory", params, 1),
    "/global-directory?country=Mexico",
  );
  assert.equal(
    directoryPageHref("/global-directory", params, 2),
    "/global-directory?country=Mexico&page=2",
  );
});

test("paging preserves every other filter", () => {
  // Losing the filter on page 2 would silently widen the result set, which
  // reads as "the filter broke" to a visitor.
  const params = new URLSearchParams({ country: "Mexico", city: "Tulum", q: "ana" });
  const href = directoryPageHref("/global-directory", params, 3);
  const back = new URLSearchParams(href.split("?")[1]);
  assert.equal(back.get("country"), "Mexico");
  assert.equal(back.get("city"), "Tulum");
  assert.equal(back.get("q"), "ana");
  assert.equal(back.get("page"), "3");
});
