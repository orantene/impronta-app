/**
 * A-06: lightbox pure rules.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PORTFOLIO_SWIPE_PX,
  galleryCounter,
  nextIndex,
  swipeDirection,
  claimPortfolioBook,
} from "./portfolio-lightbox-logic";

test("nextIndex wraps at both ends", () => {
  assert.equal(nextIndex(0, 5, 1), 1);
  assert.equal(nextIndex(4, 5, 1), 0);
  assert.equal(nextIndex(0, 5, -1), 4);
  assert.equal(nextIndex(2, 5, -1), 1);
  assert.equal(nextIndex(0, 1, 1), 0);
  assert.equal(nextIndex(0, 0, 1), 0);
});

test("swipe left goes next, right goes back, short moves do nothing", () => {
  assert.equal(swipeDirection(-(PORTFOLIO_SWIPE_PX + 1)), 1);
  assert.equal(swipeDirection(PORTFOLIO_SWIPE_PX + 1), -1);
  assert.equal(swipeDirection(PORTFOLIO_SWIPE_PX), 0);
  assert.equal(swipeDirection(-10), 0);
});

test("counter is 1-based", () => {
  assert.equal(galleryCounter(2, 8), "3 / 8");
});

test("TUL-139: a photo in two portfolio blocks books once per tap", () => {
  const target = new EventTarget();
  const booked: string[] = [];
  // two links (two blocks) for the same shot, one for another shot
  for (const [name, shot] of [["a", "s1"], ["b", "s1"], ["c", "s2"]] as const) {
    target.addEventListener("tulala:portfolio-book", (e) => {
      if (claimPortfolioBook(e, shot)) booked.push(name);
    });
  }
  target.dispatchEvent(new CustomEvent("tulala:portfolio-book", { detail: { shotId: "s1" } }));
  assert.deepEqual(booked, ["a"]);
  target.dispatchEvent(new CustomEvent("tulala:portfolio-book", { detail: { shotId: "s1" } }));
  assert.deepEqual(booked, ["a", "a"]);
  assert.equal(claimPortfolioBook(new CustomEvent("x", { detail: { shotId: "s2" } }), "s1"), false);
  assert.equal(claimPortfolioBook(new Event("x"), "s1"), false);
});
