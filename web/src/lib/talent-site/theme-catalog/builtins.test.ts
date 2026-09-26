import test from "node:test";
import assert from "node:assert/strict";

import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "./builtins";
import { isMaisonCatalogSlug } from "./maison/catalog-visibility";
import { validateDesign, validateLook } from "./validate";

test("every built-in Design validates", () => {
  for (const design of BUILTIN_DESIGNS) {
    const check = validateDesign(design.buildPayload());
    assert.equal(check.ok, true, `${design.slug}: ${check.errors.join(" · ")}`);
  }
});

test("every built-in Look validates", () => {
  for (const look of BUILTIN_LOOKS) {
    const check = validateLook(look.buildPayload());
    assert.equal(check.ok, true, `${look.slug}: ${check.errors.join(" · ")}`);
  }
});

test("built-in Design slugs are unique", () => {
  const slugs = BUILTIN_DESIGNS.map((d) => d.slug);
  assert.equal(new Set(slugs).size, slugs.length, slugs.join(","));
});

test("built-in Look slugs are unique", () => {
  const slugs = BUILTIN_LOOKS.map((l) => l.slug);
  assert.equal(new Set(slugs).size, slugs.length, slugs.join(","));
});

test("every built-in slug matches the DB slug format", () => {
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  for (const entry of [...BUILTIN_DESIGNS, ...BUILTIN_LOOKS]) {
    assert.match(entry.slug, SLUG_RE, entry.slug);
  }
});

test("built-ins fallback has no Maison rows (flag-off catalog stays 5×6)", () => {
  for (const entry of [...BUILTIN_DESIGNS, ...BUILTIN_LOOKS]) {
    assert.equal(
      isMaisonCatalogSlug(entry.slug),
      false,
      `built-in ${entry.slug} must not be Maison-owned; filter alone is not enough if sync lands it under a non-maison slug`,
    );
  }
});

test("all five Designs cross all six Looks validate independently (30 combinations)", () => {
  assert.equal(BUILTIN_DESIGNS.length, 5);
  assert.equal(BUILTIN_LOOKS.length, 6);
  let combos = 0;
  for (const design of BUILTIN_DESIGNS) {
    const designCheck = validateDesign(design.buildPayload());
    for (const look of BUILTIN_LOOKS) {
      const lookCheck = validateLook(look.buildPayload());
      assert.equal(designCheck.ok, true, `${design.slug} × ${look.slug} (design)`);
      assert.equal(lookCheck.ok, true, `${design.slug} × ${look.slug} (look)`);
      combos += 1;
    }
  }
  assert.equal(combos, 30);
});

// ── Regression: the deferred `{{year}}` copyright token ─────────────────────
//
// `buildMaxSiteTemplateTrees` bakes the REAL current year into the shell
// footer (see `builtins/designs/_shared.ts`'s module comment). A built-in
// Design payload must carry the literal `{{year}}` token instead, so
// `resolveYearToken` (theme-apply-core.ts) fills in the year at APPLY time —
// otherwise every site that ever applies a built-in Design freezes its
// footer at whatever year this table was last synced.

test("every built-in Design defers its shell copyright year (no real year baked in)", () => {
  for (const design of BUILTIN_DESIGNS) {
    const { shellTree } = design.buildPayload();
    const text = JSON.stringify(shellTree);
    assert.match(text, /\{\{year\}\}/, `${design.slug}: missing the {{year}} token`);
    assert.doesNotMatch(
      text,
      /©\s*\d{4}\b/,
      `${design.slug}: a real year is baked into the shell tree instead of {{year}}`,
    );
  }
});

test("buildPayload is deterministic (stable ids) across repeated calls", () => {
  for (const entry of [...BUILTIN_DESIGNS, ...BUILTIN_LOOKS]) {
    const a = JSON.stringify(entry.buildPayload());
    const b = JSON.stringify(entry.buildPayload());
    assert.equal(a, b, entry.slug);
  }
});
