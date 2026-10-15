import assert from "node:assert/strict";
import { test } from "node:test";
import { dom } from "./catalog-booking-sheet-dom";
import {
  clearBookingSheetOpener,
  consumeBookingSheetOpener,
  peekBookingSheetOpener,
  rememberBookingSheetOpener,
} from "./booking-sheet-opener";

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
