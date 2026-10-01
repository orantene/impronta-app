/**
 * Gridline G10 + G11: the 4-layer coverage guard (schema/validate, renderer,
 * inspector, add gallery) for the spec table, the `work_order` portfolio layout
 * and the `area` visit layout, plus their Spanish strings. File-text pins, same
 * rationale as the sibling coverage guards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(resolve(THIS_DIR, f), "utf8");
const libAt = (f: string) => readFileSync(resolve(THIS_DIR, "../../../lib", f), "utf8");

test("spec_table: schema, renderer, inspector and add gallery are all wired", () => {
  // 1. types + validation
  assert.ok(libAt("site-admin/builder-node/types.ts").includes('kind: "spec_table"'));
  const registry = libAt("site-admin/builder-node/registry.ts");
  assert.ok(registry.includes("export const specTablePropsSchema"));
  assert.ok(registry.includes("propsSchema: specTablePropsSchema"));
  assert.ok(registry.includes('  "spec_table",'), "kind list");
  assert.ok(libAt("talent-site/theme-catalog/validate.ts").includes('"spec_table"'), "design validator leaf");
  assert.ok(libAt("site-admin/builder-node/drop-policy.ts").includes('"spec_table"'), "drop policy");
  assert.ok(libAt("site-admin/builder-node/create.ts").includes('case "spec_table"'));
  // 2. renderer
  assert.ok(libAt("site-admin/builder-node/render.tsx").includes('case "spec_table"'));
  // 3. inspector
  assert.match(read("builder-node-content.tsx"), /node\.kind === "spec_table"\) \{\s*return <SpecTableContentInspector/);
  const inspector = read("spec-table-inspector.tsx");
  for (const v of ["rows", "eyebrow:", "title:"]) assert.ok(inspector.includes(v), `inspector ${v}`);
  // 4. add gallery (the element library list + its search terms and category)
  const allow = libAt("site-admin/builder-node/mvp-allow-list.ts");
  assert.ok(allow.includes("spec_table: \"structure\""), "element category");
  assert.ok(allow.includes("spec_table: \"spec table"), "search terms");
  assert.ok(/MVP_ELEMENT_LIBRARY_KINDS[^]*?"spec_table"/.test(allow), "element library kinds");
});

test("portfolio work_order: schema, renderer, inspector and add gallery are all wired", () => {
  assert.ok(libAt("site-admin/builder-node/types.ts").includes('"staggered" | "work_order"'));
  assert.ok(libAt("site-admin/builder-node/registry.ts").includes('"staggered", "work_order"'));
  assert.ok(libAt("site-admin/builder-node/portfolio-block.tsx").includes("WorkOrderFigure"));
  assert.ok(libAt("site-admin/builder-node/portfolio-defaults.ts").includes('"work_order"'));
  const inspector = read("portfolio-inspector.tsx");
  assert.ok(inspector.includes("work_order: \"Work orders\""), "layout button label");
  assert.ok(inspector.includes('layout === "work_order"'), "layout hint");
  const gallery = libAt("site-admin/add-gallery/registry-catalog-sections-connected.ts");
  assert.ok(gallery.includes('id: "conn-portfolio-work-order-native"'));
  assert.ok(gallery.includes('layout: "work_order"'));
});

test("visit area: schema, renderer, inspector and add gallery are all wired", () => {
  assert.ok(libAt("site-admin/builder-node/types.ts").includes('layout?: "facts" | "split" | "location" | "area"'));
  assert.ok(libAt("site-admin/builder-node/registry.ts").includes('layout: z.enum(["facts", "split", "location", "area"])'));
  assert.ok(libAt("site-admin/builder-node/visit-block.tsx").includes('layout === "area"'));
  assert.ok(libAt("site-admin/builder-node/visit-defaults.ts").includes('"location", "area"'));
  assert.ok(read("visit-inspector.tsx").includes('area: "Area card"'), "layout button");
  const gallery = libAt("site-admin/add-gallery/registry-catalog-sections-connected.ts");
  assert.ok(gallery.includes('id: "conn-area-native"'));
  assert.ok(gallery.includes("defaultProps: { ...AREA_DEFAULT_PROPS }"));
});

test("the area card reads the zone only through the Location privacy gate", () => {
  const area = libAt("site-admin/builder-node/area-block.tsx");
  assert.ok(area.includes("zoneLabel"), "zone via zoneLabel");
  const code = area.replace(/\/\*[^]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/exactAddress|exact_address|directionsHref/.test(code), "never reads the address");
  // The facts feeding the chips come from the same loader that calls toPublicLocation.
  assert.ok(libAt("site-admin/builder-node/visit-sources.ts").includes("toPublicLocation(locationSettings"));
});

test("G10/G11: every new inspector and gallery string has a Spanish row", () => {
  const es = read("../editor-i18n-es-inspectors-3.ts");
  for (const s of [
    '"Spec table"',
    '"Spec table · key and value rows"',
    '"Row label"',
    '"Row value"',
    '"Add row"',
    '"Work orders"',
    '"Job cards"',
    '"Area card"',
    '"Label (Warranty)"',
    '"Value (6 months, in writing)"',
  ]) {
    assert.ok(es.includes(s), `ES row for ${s}`);
  }
});
