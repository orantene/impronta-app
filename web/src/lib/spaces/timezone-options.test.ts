/**
 * Regression test for a bug found by opening the page, not by compiling it.
 *
 * `Intl.supportedValuesOf("timeZone")` returns 418 canonical zones and "UTC" is
 * NOT among them (nor is "Etc/UTC"). Every workspace in production is on UTC,
 * so a select built from that list alone had no matching <option> and silently
 * displayed the FIRST one — "Africa/Abidjan". The screen showed the wrong zone
 * to every operator, and the first click of Save would have stored it.
 *
 * The rule this pins: whatever is currently stored is always in the list. A
 * value we cannot render is a value we must not silently replace.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { timeZoneOptions } from "./venue-timezone";

test("the runtime really does omit UTC, which is why this test exists", () => {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf?.("timeZone");
  // If a future runtime starts including it, this test should be revisited
  // rather than silently becoming vacuous.
  assert.ok(Array.isArray(supported) && supported.length > 100);
  assert.equal(supported.includes("UTC"), false);
});

test("UTC is always offered, so a UTC workspace sees UTC", () => {
  const options = timeZoneOptions("UTC");
  assert.ok(options.includes("UTC"));
  assert.equal(options[0] === "Africa/Abidjan" && !options.includes("UTC"), false);
});

test("the stored value is always present, even one the runtime does not know", () => {
  // A zone retired between browser versions must still be visible to the person
  // about to change it, not quietly swapped for the alphabetically first one.
  const options = timeZoneOptions("Mars/Olympus_Mons");
  assert.ok(options.includes("Mars/Olympus_Mons"));
});

test("a known zone is not duplicated when it is also the current one", () => {
  const options = timeZoneOptions("Europe/Madrid");
  assert.equal(options.filter((z) => z === "Europe/Madrid").length, 1);
});

test("the list is sorted and non-trivial", () => {
  const options = timeZoneOptions("America/Cancun");
  assert.ok(options.length > 100);
  assert.deepEqual(options, [...options].sort((a, b) => a.localeCompare(b)));
});

test("an empty current value still yields a usable list containing UTC", () => {
  const options = timeZoneOptions("");
  assert.ok(options.includes("UTC"));
  assert.equal(options.includes(""), false);
});
