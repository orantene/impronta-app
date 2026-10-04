import assert from "node:assert/strict";
import { test } from "node:test";

import {
  frontDoorBrowseLabel,
  requestBrowseLocale,
  resolveGuestDockItemsLabel,
} from "./guest-dock-items-label";

test("requestBrowseLocale keeps fr/es (not collapsed to en)", () => {
  assert.equal(requestBrowseLocale("fr"), "fr");
  assert.equal(requestBrowseLocale("fr-FR"), "fr");
  assert.equal(requestBrowseLocale("es-MX"), "es");
  assert.equal(requestBrowseLocale("en-US"), "en");
  assert.equal(requestBrowseLocale(null), "en");
});

test("front-door Browse labels by locale", () => {
  assert.equal(frontDoorBrowseLabel("en"), "Browse");
  assert.equal(frontDoorBrowseLabel("es"), "Explorar");
  assert.equal(frontDoorBrowseLabel("fr"), "Parcourir");
  assert.equal(frontDoorBrowseLabel("fr-CA"), "Parcourir");
  assert.equal(frontDoorBrowseLabel(null), "Browse");
});

test("agency public surface default dockItemsLabel is Browse (DoR)", () => {
  assert.equal(
    resolveGuestDockItemsLabel({
      agencyPublicSurface: true,
      derivedLabel: "Talent & services",
      chatItemsCustomized: false,
      locale: "en",
    }),
    "Browse",
  );
  assert.equal(
    resolveGuestDockItemsLabel({
      agencyPublicSurface: true,
      derivedLabel: "Talento y servicios",
      chatItemsCustomized: false,
      locale: "fr",
    }),
    "Parcourir",
  );
});

test("operator chat_items override wins on agency public docks", () => {
  assert.equal(
    resolveGuestDockItemsLabel({
      agencyPublicSurface: true,
      derivedLabel: "Roster",
      chatItemsCustomized: true,
      locale: "en",
    }),
    "Roster",
  );
});

test("non-agency surfaces keep derived label even when intake would be agency", () => {
  assert.equal(
    resolveGuestDockItemsLabel({
      agencyPublicSurface: false,
      derivedLabel: "Talent & services",
      chatItemsCustomized: false,
      locale: "en",
    }),
    "Talent & services",
  );
  assert.equal(
    resolveGuestDockItemsLabel({
      agencyPublicSurface: false,
      derivedLabel: "Services",
      chatItemsCustomized: false,
      locale: "en",
    }),
    "Services",
  );
});
