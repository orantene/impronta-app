import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUndoDescriptor,
  overlayToInput,
  type UndoSource,
} from "./catalog-undo";
import type { CatalogOverlayRow } from "@/lib/site-admin/add-gallery";

function overlay(over: Partial<CatalogOverlayRow> = {}): CatalogOverlayRow {
  return {
    item_ref: "comp.hero",
    source: "code",
    talent_enabled: true,
    workspace_enabled: true,
    label_override: null,
    icon_override: null,
    category_override: null,
    required_plan_override: null,
    availability_override: null,
    ...over,
  };
}

function source(over: Partial<UndoSource> = {}): UndoSource {
  return {
    kind: "toggle",
    itemRef: "comp.hero",
    source: "code",
    before: null,
    itemLabel: "Hero",
    ...over,
  };
}

// ── overlayToInput (pure restore patch) ──────────────────────────────────────

test("overlayToInput: a bare overlay round-trips every base field explicitly", () => {
  const input = overlayToInput(overlay());
  // A TOTAL restore writes each overlay-owned column (a missing key would leave
  // the live value untouched, which is not 'undo').
  assert.equal(input.item_ref, "comp.hero");
  assert.equal(input.source, "code");
  assert.equal(input.talent_enabled, true);
  assert.equal(input.workspace_enabled, true);
  assert.equal(input.label_override, null);
  assert.equal(input.availability_override, null);
  // Studio fields default to their cleared values when absent.
  assert.deepEqual(input.locked_props, []);
  assert.equal(input.default_props, null);
  assert.equal(input.default_variant, null);
  assert.equal(input.data_source_defaults, null);
  // X4/X6 surface columns are omitted when the snapshot didn't carry them.
  assert.equal("talent_profile_enabled" in input, false);
  assert.equal("lab_enabled" in input, false);
});

test("overlayToInput: carries the X4 quad + X6 lab axis when present", () => {
  const input = overlayToInput(
    overlay({
      talent_profile_enabled: false,
      talent_shell_enabled: true,
      workspace_page_enabled: false,
      workspace_shell_enabled: true,
      lab_enabled: false,
    }),
  );
  assert.equal(input.talent_profile_enabled, false);
  assert.equal(input.talent_shell_enabled, true);
  assert.equal(input.workspace_page_enabled, false);
  assert.equal(input.workspace_shell_enabled, true);
  assert.equal(input.lab_enabled, false);
});

test("overlayToInput: preserves real governance overrides verbatim", () => {
  const input = overlayToInput(
    overlay({
      label_override: "Renamed",
      locked_props: ["tone", "style.color"],
      default_variant: "title",
      default_props: { tone: "primary" },
      required_plan_override: "agency",
    }),
  );
  assert.equal(input.label_override, "Renamed");
  assert.deepEqual(input.locked_props, ["tone", "style.color"]);
  assert.equal(input.default_variant, "title");
  assert.deepEqual(input.default_props, { tone: "primary" });
  assert.equal(input.required_plan_override, "agency");
});

// ── buildUndoDescriptor (what to revert + label) ─────────────────────────────

test("buildUndoDescriptor: no prior overlay ⇒ undo CLEARS the overlay", () => {
  const desc = buildUndoDescriptor(source({ before: null }), "Disabled on Talent profile");
  assert.equal(desc.undoable, true);
  assert.equal(desc.message, "Disabled on Talent profile");
  assert.equal(desc.undoLabel, "Undo");
  assert.ok(desc.revert);
  assert.equal(desc.revert!.mode, "clear");
  if (desc.revert!.mode === "clear") {
    assert.equal(desc.revert!.itemRef, "comp.hero");
  }
});

test("buildUndoDescriptor: a prior overlay ⇒ undo RE-APPLIES the captured before", () => {
  const before = overlay({ label_override: "Old", talent_enabled: false });
  const desc = buildUndoDescriptor(source({ kind: "save", before }), "Saved ✓");
  assert.equal(desc.undoable, true);
  assert.ok(desc.revert);
  assert.equal(desc.revert!.mode, "apply");
  if (desc.revert!.mode === "apply") {
    // The revert input reproduces the captured snapshot exactly.
    assert.deepEqual(desc.revert!.input, overlayToInput(before));
    assert.equal(desc.revert!.input.label_override, "Old");
    assert.equal(desc.revert!.input.talent_enabled, false);
  }
});

test("buildUndoDescriptor: a TEMPLATE status change is NOT undoable (lifecycle, not overlay)", () => {
  // Template status rides the registry lifecycle actions, so re-applying the
  // overlay can't move it back — the toast must offer no Undo.
  const desc = buildUndoDescriptor(
    source({ kind: "status", source: "template", before: overlay({ source: "template" }) }),
    "Published ✓",
  );
  assert.equal(desc.undoable, false);
  assert.equal(desc.revert, undefined);
  assert.equal(desc.message, "Published ✓");
});

test("buildUndoDescriptor: a CODE status change IS undoable (rides availability overlay)", () => {
  const desc = buildUndoDescriptor(
    source({ kind: "status", source: "code", before: null }),
    "Archived",
  );
  assert.equal(desc.undoable, true);
  assert.ok(desc.revert);
  assert.equal(desc.revert!.mode, "clear");
});

test("buildUndoDescriptor: template TOGGLE / SAVE / RESET stay undoable", () => {
  for (const kind of ["toggle", "save", "reset"] as const) {
    const desc = buildUndoDescriptor(
      source({ kind, source: "template", before: overlay({ source: "template" }) }),
    );
    assert.equal(desc.undoable, true, `${kind} should be undoable for templates`);
    assert.ok(desc.revert);
  }
});

test("buildUndoDescriptor: default message is derived per kind when none supplied", () => {
  assert.match(buildUndoDescriptor(source({ kind: "toggle" })).message, /Updated/);
  assert.match(buildUndoDescriptor(source({ kind: "save" })).message, /Saved/);
  assert.match(buildUndoDescriptor(source({ kind: "reset" })).message, /Reset/);
  assert.match(
    buildUndoDescriptor(source({ kind: "status", source: "code" })).message,
    /Status/,
  );
});
