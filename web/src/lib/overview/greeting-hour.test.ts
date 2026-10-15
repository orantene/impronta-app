import assert from "node:assert/strict";
import { test } from "node:test";

import { greetingHour } from "./greeting-hour";

test("greeting hour follows the venue zone, not the runtime (TUL-734)", () => {
  const at = new Date("2026-10-14T00:23:00Z"); // 7:23 PM in Cancun (UTC-5)
  assert.equal(greetingHour(at, "America/Cancun"), 19);
  assert.equal(greetingHour(at, "UTC"), 0);
  assert.equal(greetingHour(at, "Asia/Tokyo"), 9);
});

test("bad or missing zone falls back to local hour", () => {
  const at = new Date("2026-10-14T00:23:00Z");
  assert.equal(greetingHour(at, null), at.getHours());
  assert.equal(greetingHour(at, "Not/AZone"), at.getHours());
});

test("an unset venue zone stored as UTC does not drive the greeting or date (TUL-734)", async () => {
  const { venueZoneOrNull } = await import("./greeting-hour");
  assert.equal(venueZoneOrNull("UTC"), null);
  assert.equal(venueZoneOrNull(" Etc/UTC "), null);
  assert.equal(venueZoneOrNull(""), null);
  assert.equal(venueZoneOrNull(undefined), null);
  assert.equal(venueZoneOrNull("America/Cancun"), "America/Cancun");
});

test("OverviewBoard routes the snapshot zone through venueZoneOrNull (TUL-734)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    "src/components/admin/shell/internal/page-modules/OverviewBoard.tsx",
    "utf8",
  );
  assert.match(src, /venueZoneOrNull\(snapshot\?\.timeZone\)/);
  assert.doesNotMatch(src, /greetingHour\(now, snapshot\?\.timeZone\)/);
});
