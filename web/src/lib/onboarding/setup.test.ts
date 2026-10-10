import test from "node:test";
import assert from "node:assert/strict";
import { suggestedEssentials, essentialsReady, parseEssentials } from "./essentials";
import {
  DAY_ORDER, MX_TIMEZONE_OPTIONS, cleanServices, copyDayToAll, finalizeSetup, minToTime, needsTimezoneQuestion,
  parsePriceToCents, setupIssues, timeToMin, timezoneOptionsForCountry, toggleDay,
} from "./setup";

test("timezone is always asked (Mexico is multi-zone: Cancún ≠ CDMX)", () => {
  assert.equal(needsTimezoneQuestion("Mexico"), true);
  assert.equal(needsTimezoneQuestion("MX"), true);
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

test("onb1-04: Mexico lists Cancún and the other MX zones", () => {
  const mx = timezoneOptionsForCountry("Mexico");
  assert.equal(mx, MX_TIMEZONE_OPTIONS);
  assert.ok(mx.some((z) => z.id === "America/Cancun"));
  assert.ok(mx.some((z) => z.id === "America/Mexico_City"));
  assert.ok(timezoneOptionsForCountry("United States").every((z) => z.id !== "America/Cancun"));
});

test("Mexico setup with preselected Cancún zone has no timezone issue", () => {
  const e = {
    ...suggestedEssentials({ trade: "hair", country: "Mexico", locale: "es", name: "Bella" }),
    place: { mode: "studio" as const, area: "Cancún" },
    timezone: "America/Cancun",
  };
  assert.deepEqual(setupIssues({ choice: "studio", essentials: e, country: "Mexico", providerEmailDraft: "" }), []);
});
