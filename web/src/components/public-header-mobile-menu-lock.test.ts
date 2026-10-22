/**
 * TUL-1812: closing the mobile menu never leaves `pointer-events:none` on the
 * body (the page could not be tapped after the menu closed).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

import { releaseBodyPointerLock } from "./public-header-mobile-menu";

test("unmount while open releases a stuck body lock", () => {
  document.body.style.pointerEvents = "none";
  releaseBodyPointerLock(true)();
  assert.equal(document.body.style.pointerEvents, "");
});

test("a lock is kept while the menu content is still mounted", () => {
  document.body.innerHTML = "<div data-public-header-menu></div>";
  document.body.style.pointerEvents = "none";
  releaseBodyPointerLock(true)();
  assert.equal(document.body.style.pointerEvents, "none");
  document.body.innerHTML = "";
  document.body.style.pointerEvents = "";
});

test("closing schedules the release after the exit animation", async () => {
  document.body.style.pointerEvents = "none";
  const cancel = releaseBodyPointerLock(false);
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(document.body.style.pointerEvents, "");
  cancel();
});
