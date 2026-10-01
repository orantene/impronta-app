/**
 * Gridline G7 + G8: the 4-layer coverage guard (schema/validate, renderer,
 * inspector, add gallery) for the stats `spec` variant, the services_catalog
 * `matrix` layout and the typed offering matrix fields, plus their Spanish
 * strings. File-text pins, same rationale as the sibling coverage guards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(resolve(THIS_DIR, f), "utf8");
const libAt = (f: string) => readFileSync(resolve(THIS_DIR, "../../../lib", f), "utf8");
const compAt = (f: string) => readFileSync(resolve(THIS_DIR, "../..", f), "utf8");

test("stats spec: schema, validator, renderer and inspector are wired", () => {
  assert.ok(libAt("site-admin/builder-node/types.ts").includes('"row" | "grid" | "split" | "spec"'));
  assert.ok(libAt("site-admin/builder-node/registry.ts").includes('z.enum(["row", "grid", "split", "spec"])'));
  assert.ok(libAt("talent-site/theme-catalog/validate.ts").includes('  "stats",'), "design validator leaf");
  assert.ok(libAt("site-admin/builder-node/render.tsx").includes('p.variant === "spec"'));
  assert.ok(libAt("site-admin/builder-node/render.tsx").includes("renderStatsSpecBlock"));
  assert.ok(libAt("site-admin/builder-node/builder-2027-anchor-fields.ts").includes('{ value: "spec", label: "Spec grid" }'));
  // Add gallery: stats is already an element card; the variant is chosen in its inspector.
  assert.ok(libAt("site-admin/add-gallery/registry-catalog-elements-2027.ts").includes('nativeKind: "stats"'));
});

test("hero spec block: kit factory, hero slot, CTA secondary target", () => {
  const kit = libAt("talent-site/theme-catalog/section-kit.ts");
  assert.ok(kit.includes('export { heroSpecBlock } from "./section-kit-hero-spec"'));
  const hero = libAt("talent-site/theme-catalog/section-kit-hero-spec.ts");
  assert.ok(hero.includes("slotKey: \"hero\"") && hero.includes("originRole: \"talent.hero\""));
  assert.ok(hero.includes('variant: "spec"'));
  assert.ok(libAt("talent-site/theme-catalog/section-kit-hero-parts.ts").includes("secondaryHref"));
  assert.ok(
    libAt("talent-site/theme-catalog/collection/design-type-system-utility.ts").includes("letter-spacing:.02em"),
    "the utility type system reads the kicker and badges as the mono label role",
  );
});

test("services matrix: schema, renderer, inspector and add gallery are all wired", () => {
  assert.ok(libAt("site-admin/builder-node/types.ts").includes('"featured" | "matrix"'));
  assert.ok(libAt("site-admin/builder-node/registry.ts").includes('"featured", "matrix"'));
  const render = libAt("site-admin/builder-node/render.tsx");
  assert.ok(render.includes('matrix={layout === "matrix"}'));
  assert.ok(render.includes("liveStatus={options.dataSources.liveStatus ?? null}"));
  assert.ok(libAt("site-admin/builder-node/services-catalog-filter.tsx").includes("<CatalogMatrix"));
  assert.ok(read("services-catalog-inspector.tsx").includes('<option value="matrix">Comparison matrix</option>'));
  const gallery = libAt("site-admin/add-gallery/registry-catalog-sections-connected.ts");
  assert.ok(gallery.includes('id: "conn-services-matrix-native"'));
  assert.ok(gallery.includes('layout: "matrix"'));
});

test("matrix reads the live status contract and marks the on-only highlight", () => {
  const matrix = libAt("site-admin/builder-node/services-catalog-matrix.tsx");
  assert.ok(matrix.includes("liveStatus?.emergenciesToday"));
  assert.ok(matrix.includes('data-live-when="on"'));
  assert.ok(matrix.includes("offeringMatrixValue"), "typed fields come from attributes.matrix");
  assert.ok(matrix.includes("<article"), "phone cards are <article> (the parity map relies on it)");
  assert.ok(matrix.includes("<table"), "desktop is a real table");
});

test("typed offering fields: editor mounted, stored in attributes.matrix (no migration)", () => {
  assert.ok(compAt("talent/services/EditorScreen.tsx").includes("<MatrixFields"));
  const fields = compAt("talent/services/MatrixFields.tsx");
  assert.ok(fields.includes("patchOfferingMatrix"));
  for (const k of ["materials", "warranty", "response"]) {
    assert.ok(libAt("talent/offering-matrix.ts").includes(`"${k}"`), `matrix key ${k}`);
  }
});

test("G7/G8: every new inspector, editor and gallery string has a Spanish row", () => {
  const inspectors = read("../editor-i18n-es-inspectors-3.ts");
  for (const s of ['"Spec grid"', '"Comparison matrix"', '"Services comparison"']) {
    assert.ok(inspectors.includes(s), `inspector ES row for ${s}`);
  }
  const dash = compAt("admin/shell/internal/dashboard-i18n.ts");
  for (const s of [
    '"Comparison details"',
    '"Materials"',
    '"Warranty"',
    '"Response time"',
    '"This is my emergency service"',
    '"For example: 6 months, in writing"',
    '"For example: within 24 hours"',
    '"Who buys them and how it is priced"',
  ]) {
    assert.ok(dash.includes(s), `dashboard ES row for ${s}`);
  }
});

test("the matrix and hero spec copy carry no em or en dash", () => {
  for (const f of [
    "site-admin/builder-node/services-catalog-matrix.tsx",
    "site-admin/builder-node/stats-spec-block.tsx",
    "talent-site/theme-catalog/section-kit-hero-spec.ts",
  ]) {
    const code = libAt(f).replace(/\/\*[^]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /[–—]/, `${f} user-facing copy`);
  }
});
