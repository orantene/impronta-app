import assert from "node:assert/strict";
import test from "node:test";

import { buildGbpGuide, suggestGbpCategories } from "./google-business-profile-guide";

const full = {
  displayName: "  Ana   Lopez ",
  tradeLabel: "Makeup Artist",
  homeCity: "Cancún",
  address: "Calle 1 #2",
  travelsToClients: false,
  hours: "Mon-Fri 9-18",
  siteUrl: "https://tulala.digital/t/TAL-1",
  bookingUrl: "https://tulala.digital/t/TAL-1#book",
};
const f = (g: ReturnType<typeof buildGbpGuide>, k: string) => g.fields.find((x) => x.key === k)!;

test("pre-fills every field from profile data and trims whitespace", () => {
  const g = buildGbpGuide(full, "en");
  assert.equal(f(g, "name").value, "Ana Lopez");
  assert.equal(f(g, "category").value, "Makeup artist");
  assert.deepEqual(f(g, "category").alternatives, ["Beauty salon"]);
  assert.equal(f(g, "location").value, "Calle 1 #2");
  assert.equal(f(g, "hours").value, "Mon-Fri 9-18");
  assert.equal(f(g, "website").value, full.siteUrl);
  assert.equal(f(g, "booking").value, full.bookingUrl);
  assert.deepEqual(g.missing, []);
});

test("missing fields are null and listed, never fabricated", () => {
  const g = buildGbpGuide({}, "en");
  assert.equal(g.fields.length, 6);
  assert.ok(g.fields.every((x) => x.value === null));
  assert.equal(g.missing.length, 6);
});

test("travelling talent or no address uses service area (city)", () => {
  const a = buildGbpGuide({ ...full, travelsToClients: true }, "en");
  assert.equal(f(a, "location").value, "Cancún");
  assert.equal(f(a, "location").label, "Service area");
  const b = buildGbpGuide({ homeCity: "Mérida" }, "es");
  assert.equal(f(b, "location").value, "Mérida");
  assert.equal(f(b, "location").label, "Área de servicio");
});

test("unknown trade falls back to the trade label itself", () => {
  assert.deepEqual(suggestGbpCategories("Falconer"), ["Falconer"]);
  assert.deepEqual(suggestGbpCategories("  "), []);
  assert.equal(suggestGbpCategories("Barbera")[0], "Hair stylist");
});

test("ES and EN copy both complete, no em dashes", () => {
  const en = buildGbpGuide(full, "en");
  const es = buildGbpGuide(full, "es");
  assert.equal(en.steps.length, es.steps.length);
  const all = JSON.stringify([en, es]);
  assert.ok(!all.includes("—"));
  assert.notEqual(en.steps[0].title, es.steps[0].title);
});

test("ES guide shows the taxonomy term's Spanish name when no Google category rule matches", () => {
  const input = { displayName: "Ana", tradeLabel: "Cleaner", tradeLabelEs: "Limpieza" };
  assert.equal(f(buildGbpGuide(input, "es"), "category").value, "Limpieza");
  assert.equal(f(buildGbpGuide(input, "en"), "category").value, "Cleaner");
  // No Spanish name on file: keep the English label rather than blank.
  assert.equal(f(buildGbpGuide({ ...input, tradeLabelEs: null }, "es"), "category").value, "Cleaner");
  // A matched Google category is unchanged.
  assert.equal(f(buildGbpGuide({ ...full, tradeLabelEs: "Maquillista" }, "es"), "category").value, "Makeup artist");
});
