import assert from "node:assert/strict";
import test from "node:test";

import { CATALOG_LIVE_SLOT_DAYS, catalogEmptyWhenCopy } from "./catalog-booking-live-slots";

test("TUL-861: the booking window is the same 30 days the profile line reports", () => {
  assert.equal(CATALOG_LIVE_SLOT_DAYS, 30);
});

test("TUL-861: a quiet day does not claim the whole window is empty", () => {
  assert.match(catalogEmptyWhenCopy(false, true).body, /another day/);
  assert.doesNotMatch(catalogEmptyWhenCopy(false, true).body, /next/);
  assert.match(catalogEmptyWhenCopy(true, true).title, /este día/);
});

test("TUL-861: a truly empty window names 30 days in both languages", () => {
  assert.match(catalogEmptyWhenCopy(false, false).body, /next 30 days/);
  assert.match(catalogEmptyWhenCopy(true, false).body, /próximos 30 días/);
});

test("TUL-930: phone width hides the strip scrollbar and week arrows; start over floats beside the back link", async () => {
  const { CATALOG_BOOKING_CSS: css } = await import("./catalog-booking-styles");
  assert.match(css, /@media \(max-width:719px\)\{\.jb-days\{scrollbar-width:none\}\.jb-days::-webkit-scrollbar\{display:none\}\.jb-week-nav\{display:none\}\}/);
  assert.match(css, /\.jb-back-link\[data-catalog-start-over\]\{float:right/);
});
