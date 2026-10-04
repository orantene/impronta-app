import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKING_MODE_LABELS, bookingChoiceOf } from "./booking-mode-labels";
import { WEBSITE_SETTINGS_ES_TEXT } from "../../components/admin/shell/internal/dashboard-i18n-website-settings";

test("one label set: request is 'Request to book', never 'Booking request'", () => {
  assert.equal(BOOKING_MODE_LABELS.request.title, "Request to book");
  assert.equal(BOOKING_MODE_LABELS.quote.title, "Request a quote");
});

test("quote price wins over the booking mode", () => {
  assert.equal(bookingChoiceOf("quote", "instant"), "quote");
  assert.equal(bookingChoiceOf("exact", "inquiry"), "inquiry");
});

test("every label and subtitle has Spanish in the settings map, no em dashes", () => {
  for (const { title, sub } of Object.values(BOOKING_MODE_LABELS)) {
    for (const k of [title, sub]) {
      assert.ok(WEBSITE_SETTINGS_ES_TEXT[k], `missing ES for ${k}`);
      assert.ok(!k.includes("—") && !WEBSITE_SETTINGS_ES_TEXT[k]!.includes("—"));
    }
  }
});
