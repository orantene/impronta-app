import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertNoLegacyBuilderWrite,
  isLegacyBuilderWriteTarget,
  LegacyBuilderWriteError,
  LEGACY_BUILDER_WRITE_TARGETS,
} from "./legacy-write-guard";
import { BUILDER_SURFACE_KINDS } from "./surface-kind";

/**
 * Legacy-write guard (Architecture §F.1) — runtime backstop proving that only
 * the homepage surface may write the legacy slot-composition tables.
 */

test("homepage surface may write cms_page_sections (it IS the legacy writer)", () => {
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("homepage", "cms_page_sections"),
  );
  assert.doesNotThrow(() => assertNoLegacyBuilderWrite("homepage", "composition"));
  assert.doesNotThrow(() => assertNoLegacyBuilderWrite("homepage", "composition[]"));
});

test("every non-homepage surface throws on cms_page_sections", () => {
  for (const kind of BUILDER_SURFACE_KINDS) {
    if (kind === "homepage") continue;
    assert.throws(
      () => assertNoLegacyBuilderWrite(kind, "cms_page_sections"),
      LegacyBuilderWriteError,
      `expected ${kind} → cms_page_sections to throw`,
    );
  }
});

test("non-homepage surface throws on every legacy target (incl. composition shapes)", () => {
  for (const target of LEGACY_BUILDER_WRITE_TARGETS) {
    assert.throws(
      () => assertNoLegacyBuilderWrite("workspace_page", target),
      LegacyBuilderWriteError,
      `expected workspace_page → ${target} to throw`,
    );
  }
});

test("the thrown error carries the surface kind + offending table", () => {
  try {
    assertNoLegacyBuilderWrite("talent_page", "cms_page_sections");
    assert.fail("expected a throw");
  } catch (err) {
    assert.ok(err instanceof LegacyBuilderWriteError);
    assert.equal(err.surfaceKind, "talent_page");
    assert.equal(err.table, "cms_page_sections");
    assert.equal(err.name, "LegacyBuilderWriteError");
    assert.match(err.message, /talent_page/);
    assert.match(err.message, /cms_page_sections/);
  }
});

test("non-homepage surface may write pure-freeform tables", () => {
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("workspace_page", "workspace_pages"),
  );
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("talent_page", "talent_pages"),
  );
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("platform_lab", "builder_templates"),
  );
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("platform_lab", "builder_template_revisions"),
  );
});

test("legacy-target detection is case-insensitive + trims", () => {
  assert.equal(isLegacyBuilderWriteTarget("CMS_PAGE_SECTIONS"), true);
  assert.equal(isLegacyBuilderWriteTarget("  cms_page_sections  "), true);
  assert.equal(isLegacyBuilderWriteTarget("composition[]"), true);
  assert.equal(isLegacyBuilderWriteTarget("workspace_pages"), false);
  assert.equal(isLegacyBuilderWriteTarget("talent_pages"), false);
});

test("a non-legacy table never throws regardless of surface", () => {
  for (const kind of BUILDER_SURFACE_KINDS) {
    assert.doesNotThrow(() => assertNoLegacyBuilderWrite(kind, "media_assets"));
  }
});
