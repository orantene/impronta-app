/**
 * Track B (2026-10-02) — Free plan: no Add / Move / reorder / duplicate / paste
 * in the talent page builder. Extends the P0 Add-gallery lock pins with move
 * denial + agency/workspace surfaces staying unlocked (`structuralEdits`
 * undefined).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { guardBuilderNodeMutation } from "./edit-context-internal";
import {
  galleryLockedHint,
  isGalleryItemStructurallyLocked,
  isStructureEditLocked,
} from "@/lib/site-admin/add-gallery/structural-lock";
import type { BuilderNodeOperationKind } from "@/lib/site-admin/builder-node";

const FREE_OPS: BuilderNodeOperationKind[] = [
  "insert",
  "paste",
  "duplicate",
  "move",
];

function gateRefuses(
  operation: BuilderNodeOperationKind,
  structuralEdits: boolean | undefined,
): boolean {
  return (
    guardBuilderNodeMutation({
      tree: [],
      operation,
      canEditSiteShell: false,
      advancedElementLibraryEnabled: true,
      structuralEdits,
      locale: "en",
    }) !== null
  );
}

test("Free talent gate refuses insert, paste, duplicate, and move", () => {
  for (const op of FREE_OPS) {
    assert.equal(gateRefuses(op, false), true, op);
  }
  // Hide/show and prop patches are not builder-node structure ops here.
  assert.equal(gateRefuses("remove", false), false);
  assert.equal(gateRefuses("patch", false), false);
});

test("Web Office talent (structuralEdits true) allows structure ops", () => {
  for (const op of FREE_OPS) {
    assert.equal(gateRefuses(op, true), false, op);
  }
});

test("agency / workspace builder stays unlocked (structuralEdits undefined)", () => {
  assert.equal(isStructureEditLocked(undefined), false);
  for (const op of FREE_OPS) {
    assert.equal(
      gateRefuses(op, undefined),
      false,
      `agency pin: ${op} must stay allowed when structuralEdits is undefined`,
    );
  }
  assert.equal(isGalleryItemStructurallyLocked({ tab: "blocks" }, undefined), false);
});

test("locked hint is Disponible en Oficina Web / Available on Web Office + Ver planes", () => {
  const en = galleryLockedHint("en");
  const es = galleryLockedHint("es");
  assert.equal(en.title, "Available on Web Office");
  assert.equal(es.title, "Disponible en Oficina Web");
  assert.equal(es.cta, "Ver planes");
  assert.equal(en.cta, "See plans");
  for (const copy of [en.title, en.body, en.cta, es.title, es.body, es.cta]) {
    assert.doesNotMatch(copy, /—/);
    assert.doesNotMatch(copy, /reorder/i);
  }
});
