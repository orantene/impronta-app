import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { suggestDeviceTimeZone } from "./timezone-suggestion";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";

const listed = ["America/Cancun", "Europe/Madrid", "UTC"];

test("suggests the device zone only when listed and different from the selection", () => {
  assert.equal(suggestDeviceTimeZone("UTC", "America/Cancun", listed), "America/Cancun");
  assert.equal(suggestDeviceTimeZone("America/Cancun", "America/Cancun", listed), null);
  assert.equal(suggestDeviceTimeZone("UTC", "Mars/Olympus", listed), null);
  assert.equal(suggestDeviceTimeZone("UTC", "", listed), null);
  assert.equal(suggestDeviceTimeZone("", null, listed), null);
});

test("server validation rejects unknown and concatenated zones", () => {
  assert.equal(isValidIanaTimeZone("America/Cancun"), true);
  assert.equal(isValidIanaTimeZone("America/Europe/Madrid"), false);
  assert.equal(isValidIanaTimeZone("Nowhere/City"), false);
});

test("the hours panel page renders the picker, the label and the device suggestion", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/agenda/AgendaAvailabilityPage.tsx"),
    "utf8",
  );
  assert.match(src, /<TimezonePicker/);
  assert.match(src, /copy\.t\("Time zone"\)/);
  assert.match(src, /suggestDeviceTimeZone/);
  assert.match(src, /timezone: tz/);
});

import { resolveHoursTimeZone } from "./timezone-suggestion";

test("hours zone: saved wins, UTC default is never used over the device zone", () => {
  assert.deepEqual(resolveHoursTimeZone({ saved: "Europe/Madrid", serverDefault: "UTC", device: "America/Cancun", listed }), { zone: "Europe/Madrid", source: "saved" });
  assert.deepEqual(resolveHoursTimeZone({ serverDefault: "America/Cancun", device: "Europe/Madrid", listed }), { zone: "America/Cancun", source: "workspace" });
  assert.deepEqual(resolveHoursTimeZone({ serverDefault: "UTC", device: "America/Cancun", listed }), { zone: "America/Cancun", source: "device" });
  assert.deepEqual(resolveHoursTimeZone({ serverDefault: "UTC", device: null, listed }), { zone: "", source: "none" });
  assert.deepEqual(resolveHoursTimeZone({ device: "Mars/Olympus", listed }), { zone: "", source: "none" });
});

test("the hours page resolves the unsaved zone through the helper, never raw defaultTimezone", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/agenda/AgendaAvailabilityPage.tsx"),
    "utf8",
  );
  assert.match(src, /resolveHoursTimeZone/);
  assert.doesNotMatch(src, /setTz\(res\.defaultTimezone\)/);
});
