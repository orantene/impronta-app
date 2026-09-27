import assert from "node:assert/strict";
import { test } from "node:test";

import {
  frontDoorBrowseLabel,
  resolveGuestDockItemsLabel,
} from "./guest-dock-items-label";

test("front-door Browse labels by locale", () => {
  assert.equal(frontDoorBrowseLabel("en"), "Browse");
  assert.equal(frontDoorBrowseLabel("es"), "Explorar");
  assert.equal(frontDoorBrowseLabel("fr"), "Parcourir");
  assert.equal(frontDoorBrowseLabel(null), "Browse");
});

test("agency default dockItemsLabel is Browse (DoR), not Talent & services", () => {
  assert.equal(
    resolveGuestDockItemsLabel({
      dockIntake: "agency",
      derivedLabel: "Talent & services",
      chatItemsCustomized: false,
      locale: "en",
    }),
    "Browse",
  );
  assert.equal(
    resolveGuestDockItemsLabel({
      dockIntake: "agency",
      derivedLabel: "Talento y servicios",
      chatItemsCustomized: false,
      locale: "es",
    }),
    "Explorar",
  );
});

test("operator chat_items override wins on agency docks", () => {
  assert.equal(
    resolveGuestDockItemsLabel({
      dockIntake: "agency",
      derivedLabel: "Roster",
      chatItemsCustomized: true,
      locale: "en",
    }),
    "Roster",
  );
});

test("beauty / non-agency keep derived label", () => {
  assert.equal(
    resolveGuestDockItemsLabel({
      dockIntake: "beauty",
      derivedLabel: "Services",
      chatItemsCustomized: false,
      locale: "en",
    }),
    "Services",
  );
  assert.equal(
    resolveGuestDockItemsLabel({
      dockIntake: null,
      derivedLabel: "Items",
      chatItemsCustomized: false,
      locale: "en",
    }),
    "Items",
  );
});
