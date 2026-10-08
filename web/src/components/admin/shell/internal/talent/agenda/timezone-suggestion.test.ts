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
