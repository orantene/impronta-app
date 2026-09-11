/**
 * The guest picker must bind the session on the line. Without sessionId,
 * mint-on-paid writes an order and a seat hold and no ticket.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(
  join(process.cwd(), "src/app/(public)/_sessions/session-picker-actions.ts"),
  "utf8",
);

test("bookSessionSeat passes sessionId onto the purchase line", () => {
  assert.match(
    src,
    /lines:\s*\[\s*\{\s*offeringId:\s*d\.offeringId,\s*units:\s*d\.units,\s*sessionId:\s*d\.sessionId/,
  );
});
