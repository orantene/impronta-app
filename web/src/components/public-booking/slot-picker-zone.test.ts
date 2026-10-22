/**
 * TUL-1812: the slot picker names the studio's time zone instead of saying
 * only "the studio's zone", and both locales carry the sentence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { studioZoneLabel } from "./SlotPicker";

test("the zone is named by its city, with the accent", () => {
  assert.equal(studioZoneLabel("America/Cancun", "es"), "Cancún");
  assert.equal(studioZoneLabel("America/Mexico_City", "es"), "Ciudad de México");
  assert.equal(studioZoneLabel("UTC", "es"), null);
});

test("EN and ES both carry the named-zone sentence with the {zone} slot", () => {
  for (const f of ["en", "es"]) {
    const j = JSON.parse(readFileSync(join(__dirname, "../../../messages", `${f}.json`), "utf8"));
    assert.match(j.public.slotPicker.subtitleZone, /\{zone\}/, f);
  }
});

test("TUL-1812: a pick from the previous service is cleared when the new service does not offer it, and cards are full width", () => {
  const src = readFileSync(join(__dirname, "SlotPicker.tsx"), "utf8");
  assert.match(src, /!r\.slots\.includes\(valueRef\.current\.startsAt\)\) onChangeRef\.current\(null\)/);
  assert.match(src, /className=\{`w-full text-left/);
});
