import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { zoneLabel, SUGGESTED_ZONES } from "./TimezonePicker";

test("TUL-822: Spanish labels lead with the localized zone name, not the raw IANA id", () => {
  const es = zoneLabel("Africa/Addis_Ababa", "es");
  assert.doesNotMatch(es, /Africa\//);
  assert.match(es, /Addis Ababa/);
  assert.match(es, /UTC/);
  assert.match(zoneLabel("America/Mexico_City", "es"), /M[eé]xico/i);
});

test("TUL-821: Mexico zones are suggested first", () => {
  assert.ok(SUGGESTED_ZONES.includes("America/Cancun") && SUGGESTED_ZONES.includes("America/Mexico_City"));
});

const page = readFileSync("src/components/admin/shell/internal/talent/agenda/AgendaAvailabilityPage.tsx", "utf8");
test("TUL-821: the time zone block comes before Time off in the Horario page", () => {
  assert.ok(page.indexOf("<TimezonePicker") < page.indexOf('copy.t("Time off and one-day hours")'));
});

const hours = readFileSync("src/components/admin/shell/internal/talent/agenda/HoursFields.tsx", "utf8");
test("TUL-823: the 24h selects keep a minimum width so 390px does not clip them", () => {
  assert.doesNotMatch(hours, /min-w-0 flex-1/);
  assert.match(page, /minmax\(6\.75rem,1fr\)/);
});
