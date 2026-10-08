import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { TALENT_PAGES_ALL } from "./fixtures";
import { bookingIdFromTalentPath, talentPageToSegment } from "./talent-page-segment";

const WEB = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..", "..", "..");
const PLATFORM_TALENT = join(WEB, "src", "app", "(workspace)", "talent");

/** `bookings/abc` → `bookings/[id]`: the dynamic segment the router serves. */
function routeDir(segment: string): string {
  return segment.startsWith("bookings/") && segment !== "bookings/new" ? "bookings/[id]" : segment;
}

test("F44: every talent page the shell pushes has a route (no Page not found)", () => {
  const missing: string[] = [];
  for (const page of TALENT_PAGES_ALL) {
    const segment = talentPageToSegment(page, "8f3c1f7e-0000-4000-8000-000000000001");
    assert.ok(segment, `${page} has no segment`);
    if (!existsSync(join(PLATFORM_TALENT, routeDir(segment), "page.tsx"))) missing.push(`${page} → /talent/${segment}`);
  }
  assert.deepEqual(missing, []);
});

test("F44: the booking record never pushes the bare /talent/bookings", () => {
  assert.equal(talentPageToSegment("booking-record"), null);
  assert.equal(talentPageToSegment("booking-record", "undefined"), null);
  assert.equal(talentPageToSegment("booking-record", "new"), null);
  assert.equal(talentPageToSegment("booking-record", "abc"), "bookings/abc");
});

test("F44: the booking id comes from the path; new and undefined are not records", () => {
  assert.equal(bookingIdFromTalentPath("/talent/bookings/abc"), "abc");
  assert.equal(bookingIdFromTalentPath("/jor/talent/bookings/abc?collect=1"), "abc");
  assert.equal(bookingIdFromTalentPath("/talent/bookings/new"), null);
  assert.equal(bookingIdFromTalentPath("/talent/bookings/undefined"), null);
  assert.equal(bookingIdFromTalentPath("/talent/bookings"), null);
});
