import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  DISCOVERY_DESCRIPTION_IDS,
  discoveryDescription,
  discoveryLabel,
  discoveryPlace,
} from "./agency-hub-discovery-copy";

const src = readFileSync(
  join(process.cwd(), "src/components/marketing/agency-hub-discovery.tsx"),
  "utf8",
);

test("TUL-738: ES place names carry their accents, EN is untouched", () => {
  assert.equal(discoveryPlace("Mexico City", "es"), "Ciudad de México");
  assert.equal(discoveryPlace("Cancun", "es"), "Cancún");
  assert.equal(discoveryPlace("South Florida", "es"), "Sur de Florida");
  assert.equal(discoveryPlace("Mexico City", "en"), "Mexico City");
  assert.equal(discoveryPlace("Tulum", "es"), "Tulum");
});

test("TUL-699: ES filter and badge labels are Spanish, values stay English keys", () => {
  assert.equal(discoveryLabel("All locations", "es"), "Todas las ubicaciones");
  assert.equal(discoveryLabel("Open now", "es"), "Abierto ahora");
  assert.equal(discoveryLabel("Agency", "es"), "Agencia");
  assert.equal(discoveryLabel("Models", "es"), "Modelos");
  assert.equal(discoveryLabel("Models", "en"), "Models");
});

test("TUL-699: every discovery card id has a Spanish description", () => {
  const ids = [...src.matchAll(/id:\s*"([a-z-]+)",\n\s+kind:/g)].map((m) => m[1]);
  assert.ok(ids.length >= 6);
  for (const id of ids) {
    assert.ok(DISCOVERY_DESCRIPTION_IDS.includes(id), `missing ES description for ${id}`);
    assert.notEqual(discoveryDescription(id, "english", "es"), "english");
  }
  assert.equal(discoveryDescription("nova-crew", "english", "en"), "english");
});

test("TUL-699: the component renders labels through the ES helpers", () => {
  assert.match(src, /discoveryLabel\(option, locale\)/);
  assert.match(src, /discoveryPlace\(card\.city, locale\)/);
  assert.match(src, /discoveryDescription\(card\.id, card\.description, locale\)/);
});

test("no em dashes in the Spanish copy", () => {
  const copy = readFileSync(
    join(process.cwd(), "src/components/marketing/agency-hub-discovery-copy.ts"),
    "utf8",
  );
  assert.doesNotMatch(copy.split("const ES_DESCRIPTIONS")[1] ?? "", /—/);
});
