/**
 * overlay-revert-shape.test.ts — unit tests for G7's pure overlay-revert helpers:
 * picking the revert-target snapshot from an audit-row list + reconstructing the
 * overlay-writer input from a captured snapshot.
 *
 * Runner: node:test + node:assert/strict (tsx --test). The DB-backed server
 * action (`revertOverlayToAudit`) is not exercised here; we test the
 * deterministic transforms it delegates to.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  pickRevertPlanFromAudit,
  snapshotToOverlayInput,
  isOverlaySnapshot,
} from "./overlay-revert-shape";
import type { BuilderLabAuditEntry } from "./builder-lab-audit-shape";
import type { CatalogOverlayRow } from "@/lib/site-admin/add-gallery/registry-db-merge";

/** A full overlay-row snapshot as G1 stores it in the audit `before`/`after`. */
function overlaySnapshot(over: Partial<CatalogOverlayRow> = {}): CatalogOverlayRow {
  return {
    item_ref: "el-button",
    source: "code",
    talent_enabled: true,
    workspace_enabled: true,
    talent_profile_enabled: true,
    talent_shell_enabled: true,
    workspace_page_enabled: true,
    workspace_shell_enabled: true,
    lab_enabled: true,
    label_override: null,
    icon_override: null,
    category_override: null,
    required_plan_override: null,
    availability_override: null,
    default_props: null,
    locked_props: [],
    default_variant: null,
    data_source_defaults: null,
    ...over,
  };
}

function entry(over: Partial<BuilderLabAuditEntry>): BuilderLabAuditEntry {
  return {
    id: "a1",
    action: "overlay.set",
    itemRef: "el-button",
    templateId: null,
    actorId: "actor-1",
    actorName: "Oran T",
    before: null,
    after: null,
    createdAt: "2026-06-18T10:00:00.000Z",
    ...over,
  };
}

describe("isOverlaySnapshot", () => {
  it("accepts an object with item_ref + source", () => {
    assert.equal(isOverlaySnapshot(overlaySnapshot()), true);
  });
  it("rejects null / primitives / shape-mismatched objects", () => {
    assert.equal(isOverlaySnapshot(null), false);
    assert.equal(isOverlaySnapshot("el-button"), false);
    assert.equal(isOverlaySnapshot({ source: "code" }), false);
    assert.equal(isOverlaySnapshot({ item_ref: 7, source: "code" }), false);
  });
});

describe("pickRevertPlanFromAudit", () => {
  const before = overlaySnapshot({ label_override: "Hero" });
  const entries: BuilderLabAuditEntry[] = [
    // newest first (reverse-chron, as the loader returns)
    entry({ id: "a3", action: "overlay.set", before, createdAt: "2026-06-18T12:00:00.000Z" }),
    entry({ id: "a2", action: "overlay.set", before: null, createdAt: "2026-06-18T11:00:00.000Z" }),
    entry({ id: "a1", action: "overlay.clear", before, createdAt: "2026-06-18T10:00:00.000Z" }),
  ];

  it("returns the chosen row's `before` snapshot as the revert target", () => {
    const plan = pickRevertPlanFromAudit(entries, "a3");
    assert.ok(plan);
    assert.equal(plan.auditId, "a3");
    assert.equal(plan.itemRef, "el-button");
    assert.equal(plan.createdAt, "2026-06-18T12:00:00.000Z");
    assert.ok(plan.snapshot);
    assert.equal(plan.snapshot.label_override, "Hero");
  });

  it("treats a null `before` as a clear-to-default plan (snapshot=null)", () => {
    const plan = pickRevertPlanFromAudit(entries, "a2");
    assert.ok(plan);
    assert.equal(plan.snapshot, null);
    assert.equal(plan.itemRef, "el-button");
  });

  it("reverts an overlay.clear row to its captured `before` too", () => {
    const plan = pickRevertPlanFromAudit(entries, "a1");
    assert.ok(plan);
    assert.ok(plan.snapshot);
    assert.equal(plan.snapshot.label_override, "Hero");
  });

  it("returns null when the audit id is not in the list", () => {
    assert.equal(pickRevertPlanFromAudit(entries, "nope"), null);
  });

  it("returns null for a non-overlay (lifecycle) action", () => {
    const lifecycle = [entry({ id: "p1", action: "template.publish", before })];
    assert.equal(pickRevertPlanFromAudit(lifecycle, "p1"), null);
  });

  it("returns null when `before` is present but not an overlay shape", () => {
    const malformed = [entry({ id: "m1", action: "overlay.set", before: { foo: 1 } })];
    assert.equal(pickRevertPlanFromAudit(malformed, "m1"), null);
  });
});

describe("snapshotToOverlayInput", () => {
  it("carries EVERY governance column forward so the revert restores full state", () => {
    const snap = overlaySnapshot({
      source: "template",
      item_ref: "db-template:abc",
      talent_enabled: false,
      talent_profile_enabled: false,
      lab_enabled: false,
      label_override: "Renamed",
      required_plan_override: "studio",
      availability_override: "hidden",
      default_variant: "badge",
      default_props: { tone: "primary" },
      data_source_defaults: { maxItems: 6 },
      locked_props: ["tone"],
    });
    const input = snapshotToOverlayInput(snap);
    assert.equal(input.item_ref, "db-template:abc");
    assert.equal(input.source, "template");
    // legacy pair + X4 quad + X6 axis all threaded
    assert.equal(input.talent_enabled, false);
    assert.equal(input.workspace_enabled, true);
    assert.equal(input.talent_profile_enabled, false);
    assert.equal(input.talent_shell_enabled, true);
    assert.equal(input.workspace_page_enabled, true);
    assert.equal(input.workspace_shell_enabled, true);
    assert.equal(input.lab_enabled, false);
    // overrides + Studio columns
    assert.equal(input.label_override, "Renamed");
    assert.equal(input.required_plan_override, "studio");
    assert.equal(input.availability_override, "hidden");
    assert.equal(input.default_variant, "badge");
    assert.deepEqual(input.default_props, { tone: "primary" });
    assert.deepEqual(input.data_source_defaults, { maxItems: 6 });
    assert.deepEqual(input.locked_props, ["tone"]);
  });

  it("normalizes absent optional columns to null (clears them on revert)", () => {
    const snap = overlaySnapshot();
    // strip the optionals to mimic an older fixture row
    delete (snap as Partial<CatalogOverlayRow>).default_variant;
    delete (snap as Partial<CatalogOverlayRow>).default_props;
    delete (snap as Partial<CatalogOverlayRow>).data_source_defaults;
    delete (snap as Partial<CatalogOverlayRow>).locked_props;
    const input = snapshotToOverlayInput(snap);
    assert.equal(input.default_variant, null);
    assert.equal(input.default_props, null);
    assert.equal(input.data_source_defaults, null);
    assert.equal(input.locked_props, null);
  });
});
