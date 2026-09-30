/**
 * Location settings: visibility modes and the privacy gate. The exact address
 * must reach public data only when the talent chose "Public address".
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADDRESS_MODES,
  DEFAULT_LOCATION_SETTINGS,
  directionsHref,
  mapEmbedQuery,
  parseLocationSettings,
  toLocationRow,
  toPublicLocation,
  zoneLabel,
  zoneSearchHref,
  type LocationSettings,
} from "./location-settings";

const SECRET = "Calle Privada 42, Piso 3";

function settings(over: Partial<LocationSettings> = {}): LocationSettings {
  return {
    ...DEFAULT_LOCATION_SETTINGS,
    zoneNeighbourhood: "Centro",
    arrivalNote: "Puerta verde junto a la panaderia",
    exactAddress: SECRET,
    ...over,
  };
}

test("defaults: zone only, studio, no private address", () => {
  assert.equal(DEFAULT_LOCATION_SETTINGS.addressMode, "zone_only");
  assert.equal(DEFAULT_LOCATION_SETTINGS.studioKind, "studio");
  assert.equal(DEFAULT_LOCATION_SETTINGS.exactAddress, "");
});

test("parse: unknown enums fall back to the safe defaults", () => {
  const p = parseLocationSettings({ address_mode: "everyone", studio_kind: "castle" });
  assert.equal(p.addressMode, "zone_only");
  assert.equal(p.studioKind, "studio");
});

test("parse: reads snake_case rows and camelCase input, trims and clamps", () => {
  const row = parseLocationSettings({
    address_mode: "after_booking",
    studio_kind: "both",
    zone_neighbourhood: "  Centro  ",
    arrival_note: "x".repeat(900),
    exact_address: " Calle 1 ",
  });
  assert.equal(row.addressMode, "after_booking");
  assert.equal(row.studioKind, "both");
  assert.equal(row.zoneNeighbourhood, "Centro");
  assert.equal(row.arrivalNote.length, 600);
  assert.equal(row.exactAddress, "Calle 1");
  assert.equal(parseLocationSettings({ addressMode: "public" }).addressMode, "public");
});

test("parse: a photo must be https (no script, data or http URIs)", () => {
  for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "http://x.test/a.jpg", "//x.test/a.jpg"]) {
    assert.equal(parseLocationSettings({ arrival_photo_url: bad }).arrivalPhotoUrl, "", bad);
  }
  assert.equal(parseLocationSettings({ arrival_photo_url: "https://x.test/a.jpg" }).arrivalPhotoUrl, "https://x.test/a.jpg");
});

test("row: empty optional fields are stored as null", () => {
  const row = toLocationRow(DEFAULT_LOCATION_SETTINGS);
  assert.equal(row.exact_address, null);
  assert.equal(row.arrival_note, null);
  assert.equal(row.address_mode, "zone_only");
});

test("NO LEAK: the public DTO never carries the address outside public mode", () => {
  for (const mode of ADDRESS_MODES) {
    const loc = toPublicLocation(settings({ addressMode: mode }), "Mérida");
    assert.ok(loc, mode);
    const json = JSON.stringify(loc);
    if (mode === "public") {
      assert.equal(loc.exactAddress, SECRET);
    } else {
      assert.equal("exactAddress" in loc, false, `${mode}: key absent`);
      assert.ok(!json.includes(SECRET), `${mode}: value absent`);
      assert.ok(!json.includes("Calle Privada"), `${mode}: fragment absent`);
    }
  }
});

test("NO LEAK: an address typed into the note or neighbourhood is scrubbed when not public", () => {
  const typed = settings({
    addressMode: "zone_only",
    arrivalNote: `Estoy en ${SECRET}, toca el timbre`,
    zoneNeighbourhood: SECRET,
  });
  const loc = toPublicLocation(typed, "Mérida")!;
  assert.equal(loc.arrivalNote, "");
  assert.equal(loc.neighbourhood, "");
  assert.ok(!JSON.stringify(loc).includes("Privada"));
  // In public mode the talent chose to show it, so the note is kept.
  const pub = toPublicLocation({ ...typed, addressMode: "public" }, "Mérida")!;
  assert.match(pub.arrivalNote, /Privada/);
});

test("no zone and no public address: nothing to show", () => {
  assert.equal(toPublicLocation(settings({ zoneNeighbourhood: "", addressMode: "zone_only" }), ""), null);
  assert.equal(toPublicLocation(settings({ zoneNeighbourhood: "", addressMode: "after_booking" }), "  "), null);
  assert.ok(toPublicLocation(settings({ zoneNeighbourhood: "", addressMode: "public" }), ""), "a public address is enough");
  assert.equal(toPublicLocation(settings({ zoneNeighbourhood: "", addressMode: "public", exactAddress: "" }), ""), null);
});

test("zone label joins neighbourhood and city", () => {
  assert.equal(zoneLabel({ city: "Mérida", neighbourhood: "Centro" }), "Centro, Mérida");
  assert.equal(zoneLabel({ city: "Mérida", neighbourhood: "" }), "Mérida");
  assert.equal(zoneLabel({ city: "", neighbourhood: "" }), "");
});

test("links: zone search and embed query never contain the address unless public", () => {
  for (const mode of ADDRESS_MODES) {
    const loc = toPublicLocation(settings({ addressMode: mode }), "Mérida")!;
    const zone = zoneSearchHref(loc);
    assert.ok(!decodeURIComponent(zone).includes("Privada"), `${mode}: zone link`);
    const embed = mapEmbedQuery(loc);
    if (mode === "public") assert.equal(embed, SECRET);
    else assert.equal(embed, "Centro, Mérida", `${mode}: embed stays on the zone`);
  }
  assert.match(directionsHref(SECRET), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Calle%20Privada/);
});
