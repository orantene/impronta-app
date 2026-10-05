import assert from "node:assert/strict";
import test from "node:test";

import { talentSiteDockFlags, talentSiteGreeting } from "./talent-site-dock-voice";

test("talent-site dock uses services vocabulary, not a talent lineup", () => {
  const en = talentSiteDockFlags("en");
  assert.equal(en.dockRepresentsPeople, false);
  assert.equal(en.dockItemsLabel, "Services");

  const es = talentSiteDockFlags("es");
  assert.equal(es.dockItemsLabel, "Servicios");
});

test("talent-site greeting is the salon appointment voice, not the hub lineup line", () => {
  assert.equal(talentSiteGreeting("en"), "Book a time or ask us");
  assert.equal(talentSiteGreeting("es"), "Agenda una cita o pregúntanos");
});
