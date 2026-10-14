import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = readFileSync(new URL("./load.ts", import.meta.url), "utf8");

test("TUL-714: agenda load reads the order status before deriving booking state", () => {
  assert.match(load, /loadOrderStatuses\(/);
  const idx = load.indexOf("effectiveBookingStatus(");
  assert.ok(idx > 0, "load.ts must call effectiveBookingStatus");
  // The derived booking state and the payment mapper share one effective status.
  assert.match(load, /agencyStatus: effectiveStatus/);
  assert.match(load, /status: effectiveStatus/);
});
