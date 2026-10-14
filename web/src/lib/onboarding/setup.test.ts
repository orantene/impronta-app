import test from "node:test";
import assert from "node:assert/strict";
import { suggestedEssentials, essentialsReady, parseEssentials } from "./essentials";
import {
  DAY_ORDER, cleanServices, copyDayToAll, finalizeSetup, minToTime, needsTimezoneQuestion,
  parsePriceToCents, setupIssues, timeToMin, toggleDay,
} from "./setup";

test("timezone is asked only outside Mexico", () => {
  assert.equal(needsTimezoneQuestion("Mexico"), false);
  assert.equal(needsTimezoneQuestion("MX"), false);
  assert.equal(needsTimezoneQuestion("United States"), true);
  assert.equal(needsTimezoneQuestion(null), true);
});

test("prices and times round-trip", () => {
  assert.equal(parsePriceToCents("350"), 35000);
  assert.equal(parsePriceToCents("1,200.50"), 120050);
  assert.equal(parsePriceToCents("12,5"), 1250);
  assert.equal(parsePriceToCents(""), null);
  assert.equal(parsePriceToCents("abc"), null);
  assert.equal(minToTime(9 * 60 + 5), "09:05");
  assert.equal(timeToMin("19:30"), 19 * 60 + 30);
  assert.equal(timeToMin("25:00"), null);
});

test("hours editor: Monday first, toggle and apply-to-all", () => {
  assert.deepEqual([...DAY_ORDER], ["1", "2", "3", "4", "5", "6", "0"]);
  const e = suggestedEssentials({ trade: "lashes", country: "Mexico", locale: "es" });
  const w = toggleDay(e.hours!, "0");
  assert.equal(w["0"].length, 1);
  const edited = { ...w, "1": [{ startMin: 600, endMin: 1020 }] };
  const all = copyDayToAll(edited, "1");
  assert.deepEqual(all["5"], [{ startMin: 600, endMin: 1020 }]);
  assert.equal(toggleDay(all, "0")["0"].length, 0);
});

test("manual path: finalize confirms, cleans, and makes the build run with no description", () => {
  const base = suggestedEssentials({ trade: "nails", country: "Mexico", locale: "es" });
  const e = { ...base, place: { mode: "studio" as const, area: "Tulum Centro" }, services: [...base.services, { name: "  ", durationMin: 30, priceCents: null, quote: false, currency: "MXN" }] };
  assert.equal(setupIssues({ choice: "myself", essentials: e, country: "Mexico", providerEmailDraft: "" }).length, 0);
  const done = finalizeSetup(e, "", true);
  assert.equal(done.confirmed, true);
  assert.equal(done.source, "manual");
  assert.equal(done.services.length, base.services.length);
  assert.equal(essentialsReady(done), true);
  assert.deepEqual(parseEssentials(JSON.parse(JSON.stringify(done)))?.place, { mode: "studio", area: "Tulum Centro" });
});

test("issues: services, place, timezone abroad, bad provider email; empty email is Add later", () => {
  const empty = suggestedEssentials({ country: "United States", locale: "en" });
  const issues = setupIssues({ choice: "studio", essentials: empty, country: "United States", providerEmailDraft: "nope" });
  assert.deepEqual(issues.sort(), ["place", "providerEmail", "services", "timezone"]);
  const ok = { ...empty, services: [{ name: "Cut", durationMin: 30, priceCents: 4000, quote: false, currency: "USD" }], place: { mode: "client" as const, area: null }, timezone: "America/Chicago" };
  assert.deepEqual(setupIssues({ choice: "studio", essentials: ok, country: "United States", providerEmailDraft: "" }), []);
  assert.equal(finalizeSetup(ok, "Ana@Studio.com", false).firstProviderEmail, "ana@studio.com");
  assert.equal(cleanServices([{ name: "Cut", durationMin: 30, priceCents: null, quote: false, currency: "USD" }])[0].quote, true);
});

test("the zone list offers Mexico when the country was not detected (TUL-568)", async () => {
  const { TIMEZONE_OPTIONS } = await import("./setup");
  const ids = TIMEZONE_OPTIONS.map((z) => z.id);
  assert.ok(ids.includes("America/Mexico_City"));
  assert.ok(ids.includes("America/Cancun"));
});

test("TUL-540: timezone options carry bilingual labels and the other Mexican zones", async () => {
  const { TIMEZONE_OPTIONS, timezoneOptionLabel } = await import("./setup");
  const ids = TIMEZONE_OPTIONS.map((z) => z.id);
  for (const id of ["America/Merida", "America/Monterrey", "America/Tijuana", "America/Mazatlan"]) assert.ok(ids.includes(id), id);
  assert.equal(timezoneOptionLabel("America/Cancun", "es"), "Cancún (Quintana Roo)");
  assert.equal(timezoneOptionLabel("America/Mexico_City", "es"), "Ciudad de México (CDMX)");
  assert.equal(timezoneOptionLabel("America/New_York", "es"), "Nueva York (ET)");
  assert.equal(timezoneOptionLabel("America/New_York", "en"), "New York (ET)");
  assert.equal(timezoneOptionLabel("Mars/Base", "en"), "Mars/Base");
});

test("TUL-540: abroad, a known city that resolves to a zone hides the picker; a bare country asks", () => {
  assert.equal(needsTimezoneQuestion("United States", "Chicago"), false);
  assert.equal(needsTimezoneQuestion("United States", null), true);
  assert.equal(needsTimezoneQuestion("United States"), true);
  assert.equal(needsTimezoneQuestion("Mexico", "Cancún"), false);
});

test("TUL-540: a Mexico setup in Cancún takes the pack zone and does not block Continue", () => {
  const base = suggestedEssentials({ trade: "nails", country: "Mexico", locale: "es", city: "Cancún" });
  assert.equal(base.timezone, "America/Cancun");
  const e = { ...base, place: { mode: "studio" as const, area: "Cancún" } };
  assert.deepEqual(setupIssues({ choice: "myself", essentials: e, country: "Mexico", providerEmailDraft: "" }), []);
});
