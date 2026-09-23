import assert from "node:assert/strict";
import { test } from "node:test";

import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "../theme-catalog/builtins";
import { validateDesign, validateLook } from "../theme-catalog/validate";
import { builtinCatalogRow } from "./builtin-catalog-row";
import { publishSiteThemeForTalent } from "./theme-publish-hook";

test("builtinCatalogRow: every built-in resolves to a published, valid v1 row", () => {
  for (const d of BUILTIN_DESIGNS) {
    const row = builtinCatalogRow("design", d.slug);
    assert.ok(row, d.slug);
    assert.equal(row.kind, "design");
    assert.equal(row.status, "published");
    assert.equal(row.source, "builtin");
    assert.equal(row.version, 1);
    assert.equal(validateDesign(row.payload).ok, true, d.slug);
  }
  for (const l of BUILTIN_LOOKS) {
    const row = builtinCatalogRow("look", l.slug);
    assert.ok(row, l.slug);
    assert.equal(row.kind, "look");
    assert.equal(validateLook(row.payload).ok, true, l.slug);
  }
});

test("builtinCatalogRow: unknown slug or wrong kind returns null", () => {
  assert.equal(builtinCatalogRow("design", "no-such-design"), null);
  const lookSlug = BUILTIN_LOOKS[0]!.slug;
  if (!BUILTIN_DESIGNS.some((d) => d.slug === lookSlug)) {
    assert.equal(builtinCatalogRow("design", lookSlug), null);
  }
});

test("publishSiteThemeForTalent: switch off is a no-op that never queries", async () => {
  const prev = process.env.TALENT_THEME_GALLERY_ENABLED;
  delete process.env.TALENT_THEME_GALLERY_ENABLED;
  try {
    const res = await publishSiteThemeForTalent({ talentProfileId: "tp-1", profileCode: null });
    assert.deepEqual(res, { ok: true, data: null });
  } finally {
    if (prev === undefined) delete process.env.TALENT_THEME_GALLERY_ENABLED;
    else process.env.TALENT_THEME_GALLERY_ENABLED = prev;
  }
});
