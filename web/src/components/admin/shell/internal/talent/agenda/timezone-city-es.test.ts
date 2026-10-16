/**
 * TUL-822: the Spanish time-zone dropdown must not mix English city names with
 * Spanish ones. The table covers the names where standard Spanish differs from
 * the English IANA tail; English is never changed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cityForLocale } from "./timezone-city-es";
import { zoneLabel } from "./TimezonePicker";

const ES: ReadonlyArray<readonly [string, string]> = [
  ["Addis Ababa", "Adís Abeba"], ["Cairo", "El Cairo"], ["Johannesburg", "Johannesburgo"], ["Algiers", "Argel"],
  ["Tokyo", "Tokio"], ["Seoul", "Seúl"], ["Shanghai", "Shanghái"], ["Singapore", "Singapur"], ["Dubai", "Dubái"],
  ["Istanbul", "Estambul"], ["Jerusalem", "Jerusalén"], ["Calcutta", "Calcuta"], ["Kolkata", "Calcuta"],
  ["Katmandu", "Katmandú"], ["Kathmandu", "Katmandú"], ["Rangoon", "Rangún"], ["Yangon", "Rangún"],
  ["Sydney", "Sídney"], ["Tahiti", "Tahití"], ["Easter", "Isla de Pascua"], ["Galapagos", "Galápagos"],
  ["Cordoba", "Córdoba"], ["Port of Spain", "Puerto España"], ["Port-au-Prince", "Puerto Príncipe"],
  ["Amsterdam", "Ámsterdam"], ["Bucharest", "Bucarest"], ["Vilnius", "Vilna"], ["Sofia", "Sofía"],
  ["Kiev", "Kiev"], ["Kyiv", "Kiev"], ["Faroe", "Feroe"], ["Faeroe", "Feroe"], ["Yekaterinburg", "Ekaterimburgo"],
];

test("Spanish city names for the zones outside the Mexico/Americas core (TUL-822)", () => {
  for (const [en, es] of ES) assert.equal(cityForLocale(en, "es"), es, en);
  for (const [en, es] of ES) assert.equal(cityForLocale(en, "es-MX"), es, `${en} (es-MX)`);
});

test("English and unknown names are untouched", () => {
  for (const [en] of ES) assert.equal(cityForLocale(en, "en"), en);
  assert.equal(cityForLocale("Nairobi", "es"), "Nairobi", "spelled the same in Spanish: left alone");
  assert.equal(cityForLocale("Nowhereville", "es"), "Nowhereville");
});

test("the dropdown label for a far-away zone is Spanish end to end", () => {
  const label = zoneLabel("Africa/Addis_Ababa", "es");
  assert.match(label, /Adís Abeba/);
  assert.doesNotMatch(label, /Addis|Africa\//);
  assert.match(zoneLabel("Asia/Tokyo", "es"), /Tokio/);
});

test("every table entry changes the name (identical entries belong out of the table)", () => {
  const src = readFileSync("src/components/admin/shell/internal/talent/agenda/timezone-city-es.ts", "utf8");
  const after = src.slice(src.indexOf("// TUL-822: the rest of the browser's IANA list"));
  for (const m of after.matchAll(/(?:"([^"]+)"|\b([A-Za-z]+)):\s*"([^"]+)"/g)) {
    const key = m[1] ?? m[2];
    assert.notEqual(key, m[3], `${key} maps to itself`);
    assert.ok(!key!.includes("_"), `${key} must use spaces like zoneLabel derives`);
  }
});
