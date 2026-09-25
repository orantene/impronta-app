import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * T1.1 — saveBookingHours must keep existing exceptions unless the caller
 * sends a new list. Previously every save wrote exceptions: [].
 */

const FILE = resolve(process.cwd(), "src/lib/server-actions/booking-hours.ts");

test("saveBookingHours keeps existing exceptions when payload omits them", () => {
  const src = readFileSync(FILE, "utf8");
  const saveIdx = src.indexOf("export async function saveBookingHours");
  assert.ok(saveIdx >= 0, "saveBookingHours must exist");
  const saveBody = src.slice(saveIdx, saveIdx + 2500);

  assert.match(
    saveBody,
    /exceptionsPayload === undefined/,
    "must load existing exceptions when the caller omits them",
  );
  assert.match(
    saveBody,
    /\.select\("exceptions"\)/,
    "must read the current exceptions column before upsert",
  );
  assert.doesNotMatch(
    saveBody,
    /exceptions:\s*\[\],\s*\n\s*slot_minutes/,
    "must not hard-code exceptions: [] on the upsert row",
  );
});
