/**
 * Maison allowlist + W8 foundation probe (PR 1).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DESIGN_ALLOWED_NODE_KINDS, validateDesign, validateLook } from "../validate";
import {
  MAISON_BUILTIN_DEMO,
  MAISON_BUILTIN_DESIGN,
  MAISON_BUILTIN_LOOKS,
  W8_FOUNDATION_PROBE_DESIGN,
} from "./builtins";
import { isMaisonCatalogSlug } from "./catalog-visibility";

test("DESIGN_ALLOWED_NODE_KINDS admits Maison node kinds", () => {
  for (const kind of [
    "tabs",
    "tab_panel",
    "accordion",
    "accordion_item",
    "reveal",
    "services_catalog",
  ]) {
    assert.ok(DESIGN_ALLOWED_NODE_KINDS.has(kind), kind);
  }
});

test("Maison Design placeholder validates", () => {
  const check = validateDesign(MAISON_BUILTIN_DESIGN.buildPayload());
  assert.equal(check.ok, true, check.errors.join(" · "));
  assert.equal(MAISON_BUILTIN_DESIGN.slug, "maison");
  assert.ok(isMaisonCatalogSlug(MAISON_BUILTIN_DESIGN.slug));
});

test("Maison Looks validate and are scoped to maison", () => {
  assert.equal(MAISON_BUILTIN_LOOKS.length, 5);
  for (const look of MAISON_BUILTIN_LOOKS) {
    const check = validateLook(look.buildPayload());
    assert.equal(check.ok, true, `${look.slug}: ${check.errors.join(" · ")}`);
    assert.equal(look.for_design, "maison");
    assert.ok(isMaisonCatalogSlug(look.slug));
  }
});

test("Maison Nails demo payload has starter counts and preview-only images", () => {
  const payload = MAISON_BUILTIN_DEMO.buildPayload();
  assert.equal(payload.offering_mode, "bookings");
  assert.equal(payload.default_look, "maison-pink");
  assert.equal(payload.starter_content.services.length, 6);
  assert.equal(payload.starter_content.faq_prompts.length, 4);
  assert.equal(payload.image_licence.reusable, false);
  assert.ok(isMaisonCatalogSlug(MAISON_BUILTIN_DEMO.slug));
});

test("W8 foundation probe Design validates as data (hidden from gallery sync)", () => {
  const check = validateDesign(W8_FOUNDATION_PROBE_DESIGN.buildPayload());
  assert.equal(check.ok, true, check.errors.join(" · "));
  assert.equal(W8_FOUNDATION_PROBE_DESIGN.slug, "w8-foundation-probe");
  // Not Maison-prefixed — deliberately not in the published sync list.
  assert.equal(isMaisonCatalogSlug(W8_FOUNDATION_PROBE_DESIGN.slug), false);
});
