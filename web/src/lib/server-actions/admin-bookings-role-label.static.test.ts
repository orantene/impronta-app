import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./admin-bookings.ts", import.meta.url), "utf8");
const fn = src.slice(src.indexOf("export async function addBookingTalentRow"), src.indexOf("const deleteBookingTalentSchema"));

test("TUL-1606: assigning a person bells them with the seat's real role label, never the literal Team", () => {
  assert.ok(!/role:\s*"Team"/.test(fn));
  assert.match(fn, /\.select\("id, role_label"\)/);
  assert.match(fn, /role_label\?\.trim\(\) \?\? ""/);
  assert.match(fn, /role:\s*seatRole,/);
});
