/**
 * Maison v2 inspector coverage: every variant / option a Maison v2 page sets and
 * the renderer reads must be switchable in the builder's inspector. Two were
 * missing (2026-09-28 audit on demo talent Alba): the `next_free_chip` block had
 * no content inspector at all, and `services_catalog.showModeChip` had no
 * control. File-text pins, same rationale as the sibling *.static.test.ts guards.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(resolve(THIS_DIR, f), "utf8");

test("next_free_chip dispatches to its own content inspector", () => {
  const src = read("builder-node-content.tsx");
  assert.match(src, /node\.kind === "next_free_chip"\) \{\s*return <NextFreeChipContentInspector/);
});

test("the next_free_chip inspector offers both render variants and both labels", () => {
  const src = read("next-free-chip-inspector.tsx");
  assert.ok(src.includes('["inline", "stacked"]'));
  assert.ok(src.includes("labelEn:"));
  assert.ok(src.includes("labelEs:"));
});

test("services_catalog exposes showModeChip", () => {
  const src = read("services-catalog-inspector.tsx");
  assert.ok(src.includes("showModeChip: e.target.checked"));
});

test("the Maison v2 variants already offered stay offered", () => {
  const portfolio = readFileSync(
    resolve(THIS_DIR, "../../../lib/site-admin/builder-node/portfolio-defaults.ts"),
    "utf8",
  );
  assert.ok(portfolio.includes('"staggered"'), "portfolio Staggered strip");
  const fields = readFileSync(
    resolve(THIS_DIR, "../../../lib/site-admin/builder-node/builder-2027-fields.ts"),
    "utf8",
  );
  assert.ok(fields.includes('{ value: "serif", label: "Serif italic" }'), "marquee Serif italic");
  const services = read("services-catalog-inspector.tsx");
  for (const v of ['"rail"', '"rows"', '"pill"', 'pricePlacement: e.target.checked ? "meta"', "nameLineClamp"]) {
    assert.ok(services.includes(v), `services_catalog ${v}`);
  }
  assert.ok(read("builder-node-content.tsx").includes("startClosed: next"), "accordion start closed");
});

// ── Release 2.5 ("look only"): every NEW builder option is wired at all four layers ──────
//
// AGENTS.md: a capability wired at 3 of 4 layers (schema, renderer, inspector, preflight)
// is this repo's most-repeated defect. The three node options 2.5 adds, each checked at
// each layer, plus a guard that keeps the NEXT option the payload sets from skipping one.

const LIB = "../../../lib/site-admin/builder-node/";
const lib = (f: string) => readFileSync(resolve(THIS_DIR, LIB, f), "utf8");

const OPTIONS = [
  {
    option: "portfolio.cardStyle",
    schema: [["registry.ts", 'cardStyle: z.enum(["plain", "framed"])'], ["types.ts", 'cardStyle?: "plain" | "framed"']],
    renderer: [["portfolio-block.tsx", 'p.cardStyle === "framed"']],
    inspector: [["portfolio-inspector.tsx", 'cardStyle: e.target.checked ? "framed" : "plain"']],
    es: ["Framed cards"],
  },
  {
    option: "services_catalog.rowStyle",
    schema: [["registry.ts", 'rowStyle: z.enum(["flat", "card"])'], ["types.ts", 'rowStyle?: "flat" | "card"']],
    renderer: [["render.tsx", 'p.rowStyle === "card" && layout === "rows"'], ["services-catalog-filter.tsx", "rowCard"]],
    inspector: [["services-catalog-inspector.tsx", "rowStyle: e.target.value"]],
    es: ["Row style", "Hairline rows", "Raised cards"],
  },
  {
    option: "next_free_chip.href",
    schema: [["registry.ts", "CHIP_HREF_RE"], ["types.ts", "href?: string"]],
    renderer: [["next-free-chip.tsx", "safeChipHref(href)"], ["next-free-chip.tsx", "href={p.href}"]],
    inspector: [["next-free-chip-inspector.tsx", "commitPatch({ href:"], ["next-free-chip-inspector.tsx", "CHIP_HREF_RE"]],
    es: ["Link to"],
  },
] as const;

for (const o of OPTIONS) {
  test(`${o.option}: schema, renderer, inspector and ES strings are all wired`, () => {
    for (const [file, needle] of o.schema) assert.ok(lib(file).includes(needle), `schema: ${file} lacks ${needle}`);
    for (const [file, needle] of o.renderer) assert.ok(lib(file).includes(needle), `renderer: ${file} lacks ${needle}`);
    for (const [file, needle] of o.inspector) assert.ok(read(file).includes(needle), `inspector: ${file} lacks ${needle}`);
    const es = readFileSync(resolve(THIS_DIR, "../editor-i18n-es-inspectors-3.ts"), "utf8");
    for (const key of o.es) assert.ok(es.includes(`"${key}":`), `ES string missing for "${key}"`);
  });
}

test("the preflight layer: the Maison v2 payload (with every 2.5 option) validates, and bad option values do not", async () => {
  const { validateBuilderNodeTree } = await import("../../../lib/site-admin/builder-node/validate");
  const { validateDesign } = await import("../../../lib/talent-site/theme-catalog/validate");
  const { buildMaisonV2Payload } = await import("../../../lib/talent-site/theme-catalog/collection/designs");
  const check = validateDesign(buildMaisonV2Payload());
  assert.equal(check.ok, true, check.ok ? "" : check.errors.join("; "));
  const bad = (kind: string, props: Record<string, unknown>) => validateBuilderNodeTree([{ id: "x1", kind, props }]).ok;
  assert.equal(bad("portfolio", { cardStyle: "framed" }), true);
  assert.equal(bad("portfolio", { cardStyle: "neon" }), false);
  assert.equal(bad("services_catalog", { rowStyle: "card" }), true);
  assert.equal(bad("services_catalog", { rowStyle: "tiles" }), false);
  assert.equal(bad("next_free_chip", { href: "#services" }), true);
  assert.equal(bad("next_free_chip", { href: "//evil.example" }), false);
});

test("guard: every option release 2.5 adds or changes on these widgets is reachable in the inspector", async () => {
  // Diff the newest payload against the one before it, so the NEXT release that sets a new
  // option on one of these widgets (and forgets its control) fails here, not in a QA session.
  const { maisonV2At } = await import("../../../lib/talent-site/theme-releases/maison-v2-releases.fixtures");
  const INSPECTOR: Record<string, string[]> = {
    portfolio: ["portfolio-inspector.tsx"],
    services_catalog: ["services-catalog-inspector.tsx"],
    next_free_chip: ["next-free-chip-inspector.tsx"],
  };
  // Props that are structure, provenance or style, not options a talent edits here.
  const NOT_AN_OPTION = new Set(["style", "slotKey", "layerLabel", "anchorId", "originRole", "__origin", "responsive"]);
  type N = { kind: string; props?: Record<string, unknown>; children?: N[] };
  const first = (tree: N[], kind: string): N | undefined => {
    for (const n of tree) {
      if (n.kind === kind) return n;
      const hit = first(n.children ?? [], kind);
      if (hit) return hit;
    }
    return undefined;
  };
  const before = maisonV2At(18);
  const after = maisonV2At(19);
  let checked = 0;
  for (const [kind, files] of Object.entries(INSPECTOR)) {
    const src = files.map(read).join("\n");
    const a = first([...(before.shellTree as N[]), ...(before.homeTree as N[])], kind)!.props ?? {};
    const b = first([...(after.shellTree as N[]), ...(after.homeTree as N[])], kind)!.props ?? {};
    for (const key of Object.keys(b)) {
      if (NOT_AN_OPTION.has(key) || JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
      checked += 1;
      assert.ok(src.includes(key), `${kind}.${key} changed in 2.5 but has no inspector control (wire it, do not allowlist it)`);
    }
  }
  assert.ok(checked >= 4, "the guard saw the 2.5 options (cardStyle, rowStyle, href, layout)");
});

// ── Location section (visit layout "location"): all four layers ───────────

const libAt = (f: string) => readFileSync(resolve(THIS_DIR, "../../../lib", f), "utf8");

test("location layout: types, validation, renderer, inspector and add gallery are all wired", () => {
  // 1. types + validation
  assert.ok(libAt("site-admin/builder-node/types.ts").includes('layout?: "facts" | "split" | "location"'));
  const registry = libAt("site-admin/builder-node/registry.ts");
  assert.ok(registry.includes('layout: z.enum(["facts", "split", "location", "area"])'));
  for (const k of ["mapSide:", "mapSize:", "showMapButton:"]) assert.ok(registry.includes(k), `schema ${k}`);
  // 2. renderer
  assert.ok(libAt("site-admin/builder-node/visit-block.tsx").includes('layout === "location"'));
  assert.ok(libAt("site-admin/builder-node/render.tsx").includes("location: options.dataSources?.talentLocation"));
  // 3. inspector: the layout button and every control the renderer reads
  const inspector = read("visit-inspector.tsx");
  assert.ok(inspector.includes('location: "Location"'), "layout button");
  for (const v of ["mapSide: id", "mapSize: id", "showMapButton: e.target.checked"]) {
    assert.ok(inspector.includes(v), `inspector ${v}`);
  }
  // 4. add gallery: a card that starts in the location layout
  const gallery = libAt("site-admin/add-gallery/registry-catalog-sections-connected-booking.ts");
  assert.ok(gallery.includes('id: "conn-location-native"'));
  assert.ok(gallery.includes("defaultProps: { ...LOCATION_DEFAULT_PROPS }"));
});

test("location layout: every inspector string has a Spanish row", () => {
  const es = read("../editor-i18n-es-inspectors-3.ts");
  for (const s of [
    '"Area map"',
    '"Map on the left"',
    '"Map on the right"',
    '"Small map"',
    '"Medium map"',
    '"Large map"',
    '"Show the View map button"',
  ]) {
    assert.ok(es.includes(s), `ES row for ${s}`);
  }
});
