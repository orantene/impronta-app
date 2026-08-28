/**
 * D2 — unit tests for the pure count + filter-predicate helpers that back the
 * "Hidden (N)" / "Archived (N)" chips in CatalogRowTable.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveSuppressedChipState,
  isArchivedRow,
  isHiddenRow,
} from "./catalog-suppressed-chips";
import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import type { CatalogOverlayRow } from "@/lib/site-admin/add-gallery/registry-db-merge";

// ── Minimal stub helpers ──────────────────────────────────────────────────────

function makeOverlay(
  availability_override: "available" | "hidden" | null,
): CatalogOverlayRow {
  return {
    item_ref: "stub",
    source: "code",
    talent_enabled: true,
    workspace_enabled: true,
    label_override: null,
    icon_override: null,
    category_override: null,
    required_plan_override: null,
    availability_override,
  };
}

function makeRow(
  id: string,
  overrides: Partial<CatalogAdminItem> = {},
): CatalogAdminItem {
  return {
    id,
    tab: "blocks",
    source: "code",
    status: "published",
    itemKind: "static",
    availability: "available",
    targetContext: "both",
    connectedSource: undefined,
    baseLabel: id,
    baseCategory: "test",
    baseIcon: "square",
    overlay: null,
    talentVisible: true,
    workspaceVisible: true,
    surfaceVisible: {
      talent_profile: true,
      talent_shell: true,
      workspace_page: true,
      workspace_shell: true,
    },
    labVisible: true,
    effectiveLabel: id,
    effectiveCategory: "test",
    usageCount: undefined,
    ...overrides,
  };
}

// ── isHiddenRow ───────────────────────────────────────────────────────────────

describe("isHiddenRow", () => {
  it("returns false for a fully visible row", () => {
    assert.equal(isHiddenRow(makeRow("a")), false);
  });

  it("returns true when availability_override is hidden", () => {
    const r = makeRow("b", {
      overlay: makeOverlay("hidden"),
      talentVisible: true,
      workspaceVisible: true,
    });
    assert.equal(isHiddenRow(r), true);
  });

  it("returns true when talentVisible is false", () => {
    assert.equal(isHiddenRow(makeRow("c", { talentVisible: false })), true);
  });

  it("returns true when workspaceVisible is false", () => {
    assert.equal(
      isHiddenRow(makeRow("d", { workspaceVisible: false })),
      true,
    );
  });

  it("returns false when overlay.availability_override is 'available'", () => {
    const r = makeRow("e", {
      overlay: makeOverlay("available"),
    });
    assert.equal(isHiddenRow(r), false);
  });
});

// ── isArchivedRow ─────────────────────────────────────────────────────────────

describe("isArchivedRow", () => {
  it("returns false for a published row", () => {
    assert.equal(isArchivedRow(makeRow("f")), false);
  });

  it("returns true when status is archived", () => {
    assert.equal(isArchivedRow(makeRow("g", { status: "archived" })), true);
  });

  it("returns false when status is draft", () => {
    assert.equal(isArchivedRow(makeRow("h", { status: "draft" })), false);
  });
});

// ── deriveSuppressedChipState ────────────────────────────────────────────────

describe("deriveSuppressedChipState", () => {
  const rows = [
    makeRow("visible-1"),
    makeRow("visible-2"),
    makeRow("hidden-talent", { talentVisible: false }),
    makeRow("hidden-workspace", { workspaceVisible: false }),
    makeRow("archived-code", {
      status: "archived",
      talentVisible: false,
      workspaceVisible: false,
      overlay: makeOverlay("hidden"),
    }),
    makeRow("archived-template", {
      source: "template",
      status: "archived",
      talentVisible: true,
      workspaceVisible: true,
    }),
  ];

  it("counts hidden rows correctly (archived code row counts too)", () => {
    const { hiddenCount } = deriveSuppressedChipState(rows, null);
    // hidden-talent + hidden-workspace + archived-code (has overlay hidden) = 3
    assert.equal(hiddenCount, 3);
  });

  it("counts archived rows correctly", () => {
    const { archivedCount } = deriveSuppressedChipState(rows, null);
    // archived-code + archived-template = 2
    assert.equal(archivedCount, 2);
  });

  it("filterRows is identity when filter is null", () => {
    const { filterRows } = deriveSuppressedChipState(rows, null);
    assert.deepEqual(filterRows([...rows]), rows);
  });

  it("filterRows filters to hidden rows when filter is 'hidden'", () => {
    const { filterRows } = deriveSuppressedChipState(rows, "hidden");
    const result = filterRows([...rows]);
    assert.equal(result.length, 3);
    assert.deepEqual(
      result.map((r) => r.id).sort(),
      ["archived-code", "hidden-talent", "hidden-workspace"],
    );
  });

  it("filterRows filters to archived rows when filter is 'archived'", () => {
    const { filterRows } = deriveSuppressedChipState(rows, "archived");
    const result = filterRows([...rows]);
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((r) => r.id).sort(),
      ["archived-code", "archived-template"],
    );
  });

  it("counts are stable regardless of active filter", () => {
    const withNull = deriveSuppressedChipState(rows, null);
    const withHidden = deriveSuppressedChipState(rows, "hidden");
    const withArchived = deriveSuppressedChipState(rows, "archived");
    assert.equal(withNull.hiddenCount, withHidden.hiddenCount);
    assert.equal(withNull.hiddenCount, withArchived.hiddenCount);
    assert.equal(withNull.archivedCount, withHidden.archivedCount);
    assert.equal(withNull.archivedCount, withArchived.archivedCount);
  });

  it("returns zero counts for an empty list", () => {
    const { hiddenCount, archivedCount } = deriveSuppressedChipState([], null);
    assert.equal(hiddenCount, 0);
    assert.equal(archivedCount, 0);
  });
});
