import assert from "node:assert/strict";
import test from "node:test";

import { resolveSalesCloseAt } from "./dated-sales-close";

const startsAt = "2026-11-10T15:00:00Z";

test("override wins, then the series offset, then the start", () => {
  assert.equal(resolveSalesCloseAt({ startsAt, salesCloseAt: "2026-11-10T12:00:00Z", salesCloseMinutes: 30 }), "2026-11-10T12:00:00.000Z");
  assert.equal(resolveSalesCloseAt({ startsAt, salesCloseMinutes: 60 }), "2026-11-10T14:00:00.000Z");
  assert.equal(resolveSalesCloseAt({ startsAt }), "2026-11-10T15:00:00.000Z");
});

test("a malformed start fails closed", () => {
  assert.equal(resolveSalesCloseAt({ startsAt: "nope" }), null);
});
