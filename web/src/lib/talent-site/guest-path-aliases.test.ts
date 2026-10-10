import assert from "node:assert/strict";
import test from "node:test";

import { TALENT_GUEST_PATH_ALIASES, talentGuestAliasTarget } from "./guest-path-aliases";

test("GRK-028: Spanish guest paths map to booking / services / chat anchors", () => {
  assert.equal(TALENT_GUEST_PATH_ALIASES.agendar, "/#book");
  assert.equal(TALENT_GUEST_PATH_ALIASES.servicios, "/#services");
  assert.equal(TALENT_GUEST_PATH_ALIASES.contacto, "/#talent-ask");
});

test("talentGuestAliasTarget: host-root and /en prefix", () => {
  assert.equal(talentGuestAliasTarget("agendar"), "/#book");
  assert.equal(talentGuestAliasTarget("Agendar"), "/#book");
  assert.equal(talentGuestAliasTarget("servicios", { localePrefix: "en" }), "/en#services");
  assert.equal(talentGuestAliasTarget("contacto", { localePrefix: "/en/" }), "/en#talent-ask");
  assert.equal(talentGuestAliasTarget("nope"), null);
  assert.equal(talentGuestAliasTarget(null), null);
});
