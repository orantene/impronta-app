import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { applyBookingPrefill, bookingPrefillFor } from "./booking-prefill";

const own = { appRole: "client", displayName: " Ana Ruiz ", email: "ana@example.com", phone: "+52 998 123 4567" };

test("a signed-in client gets name, email and phone from their account", () => {
  assert.deepEqual(bookingPrefillFor(own), { name: "Ana Ruiz", email: "ana@example.com", phone: "+52 998 123 4567" });
});

test("a client with no role set still prefills", () => {
  assert.ok(bookingPrefillFor({ ...own, appRole: null }));
});

test("staff, talent and platform sessions never prefill", () => {
  for (const appRole of ["agency_admin", "talent", "super_admin", "agency_staff"]) {
    assert.equal(bookingPrefillFor({ ...own, appRole }), null, appRole);
  }
});

test("an empty account yields no prefill", () => {
  assert.equal(bookingPrefillFor({ appRole: "client", displayName: " ", email: null, phone: undefined }), null);
});

test("prefill never overwrites what the visitor already typed", () => {
  const p = bookingPrefillFor(own)!;
  assert.deepEqual(applyBookingPrefill({ name: "Mia", email: "", phone: "" }, p), {
    name: "Mia", email: "ana@example.com", phone: "+52 998 123 4567",
  });
  assert.deepEqual(applyBookingPrefill({ name: "", email: "", phone: "" }, null), { name: "", email: "", phone: "" });
});

const route = readFileSync(join(__dirname, "../../app/api/client/booking-prefill/route.ts"), "utf8").replace(/\/\/.*$/gm, "");
const sheet = readFileSync(join(__dirname, "../../components/public-booking/CatalogBookingSheet.tsx"), "utf8");

test("route reads the session user only and takes no request input", () => {
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /getCachedActorSession\(\)/);
  assert.doesNotMatch(route, /searchParams|req\.url|headers\(|cookies/);
  assert.match(route, /bookingPrefillFor\(/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("the booking sheet fills contact fields from the account hook on the who step", () => {
  assert.match(sheet, /useBookingContactPrefill\(\{\s*active: step === "who"/);
});

test("a guest or a host without the account surface gets a quiet 200, never a 404 console error (TUL-900)", () => {
  assert.doesNotMatch(route, /prefill: null\s*\},\s*404/);
  assert.doesNotMatch(route, /reply\([^)]*,\s*404\)/);
});
