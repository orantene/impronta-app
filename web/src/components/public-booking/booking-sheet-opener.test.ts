import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;

/* eslint-disable import/first -- jsdom globals before module under test */
import {
  clearBookingSheetOpener,
  consumeBookingSheetOpener,
  peekBookingSheetOpener,
  rememberBookingSheetOpener,
} from "./booking-sheet-opener";
/* eslint-enable import/first */

test("rememberBookingSheetOpener keeps a focused CTA and consume is one-shot", () => {
  clearBookingSheetOpener();
  const btn = dom.window.document.createElement("button");
  dom.window.document.body.appendChild(btn);
  btn.focus();
  rememberBookingSheetOpener();
  assert.equal(peekBookingSheetOpener(), btn);
  assert.equal(consumeBookingSheetOpener(), btn);
  assert.equal(consumeBookingSheetOpener(), null);
  btn.remove();
});

test("rememberBookingSheetOpener ignores body and in-sheet controls", () => {
  clearBookingSheetOpener();
  dom.window.document.body.focus();
  rememberBookingSheetOpener();
  assert.equal(peekBookingSheetOpener(), null);

  const sheet = dom.window.document.createElement("div");
  sheet.setAttribute("data-catalog-booking", "demo");
  const close = dom.window.document.createElement("button");
  sheet.appendChild(close);
  dom.window.document.body.appendChild(sheet);
  close.focus();
  rememberBookingSheetOpener();
  assert.equal(peekBookingSheetOpener(), null);
  sheet.remove();
});
