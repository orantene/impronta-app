/**
 * Theme releases: three-way merge (plan §1.4).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { mergeDesignUpdate } from "./merge";
import { readOrigin, stableStringify } from "./origin";
import { findKeyPath } from "./tree-ops";
import { addNode, built, edit, plain, prop, removeKey, topKeys } from "./test-fixtures";
import type { DesignSide, ReleaseItem } from "./types";

const base = built(1);
const run = (ours: DesignSide, theirs: DesignSide, items?: ReleaseItem[], b: DesignSide = base) =>
  mergeDesignUpdate({ base: b, ours, theirs, ...(items ? { items } : {}) });
const asSide = (r: ReturnType<typeof run>): DesignSide => ({ trees: r.trees, tokens: r.tokens });

test("untouched section takes the new variant", () => {
  const r = run(built(1), built(2, { heroVariant: "stacked" }));
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "stacked");
  assert.equal(r.report.applied.length, 1);
  assert.deepEqual(r.report.applied[0]!.changes!.map((c) => c.path), ["variant"]);
});

test("untouched nodes are carried to the new version", () => {
  const r = run(built(1), built(2, { heroVariant: "stacked" }));
  const at = findKeyPath(r.trees.home!, "menu")!;
  assert.equal(readOrigin(r.trees.home![at[0]!]!)?.version, 2);
});

test("a talent-edited section keeps her values (kept, not a conflict)", () => {
  const ours = edit(built(1), "home", "hero", "style.paddingY", "xl");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "split");
  assert.equal(prop(asSide(r), "home", "hero", "style.paddingY"), "xl");
  assert.equal(r.report.kept.length, 1);
  assert.equal(r.report.conflicts.length, 0);
});

test("both sides changed the same prop: ours wins and it is a conflict", () => {
  const ours = edit(built(1), "home", "hero", "variant", "overlay");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "overlay");
  assert.equal(r.report.conflicts.length, 1);
  assert.deepEqual(r.report.conflicts[0]!.changes!.map((c) => c.path), ["variant"]);
});

test("both sides made the same change: no conflict", () => {
  const ours = edit(built(1), "home", "hero", "variant", "stacked");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.equal(r.report.conflicts.length, 0);
});

test("content is never written, even on an untouched node", () => {
  const ours = edit(built(1), "home", "hero/heading", "text", "Valeria Studio");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.equal(prop(asSide(r), "home", "hero/heading", "text"), "Valeria Studio");
});

test("her translations (i18n) survive an applied prop change", () => {
  const ours = edit(built(1), "home", "hero/button", "i18n", { es: { label: "Reservar" } });
  const r = run(ours, built(2, { ctaLabel: "Book a visit" }));
  assert.equal(prop(asSide(r), "home", "hero/button", "label"), "Book a visit");
  assert.deepEqual(prop(asSide(r), "home", "hero/button", "i18n"), { es: { label: "Reservar" } });
});

test("a section she removed stays removed", () => {
  const ours = removeKey(built(1), "home", "about");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.ok(!topKeys(asSide(r), "home").includes("about"));
});

test("a removed section the release changes is reported as kept (removed)", () => {
  const ours = removeKey(built(1), "home", "menu");
  const r = run(ours, built(2, { menuLayout: "cards" }));
  assert.ok(r.report.kept.some((e) => e.key === "menu" && e.reason === "removed"));
  assert.equal(findKeyPath(r.trees.home!, "menu"), null);
});

test("a critical item naming a removed section restores it", () => {
  const ours = removeKey(built(1), "home", "faq");
  const r = run(ours, built(2), [{ type: "critical", key: "faq" }]);
  assert.deepEqual(topKeys(asSide(r), "home"), ["hero", "menu", "about", "faq"]);
  assert.equal(r.report.applied[0]!.change, "restore");
});

test("a wildcard critical item does not resurrect removed sections", () => {
  const ours = removeKey(built(1), "home", "faq");
  const r = run(ours, built(2), [{ type: "critical", key: "*" }]);
  assert.ok(!topKeys(asSide(r), "home").includes("faq"));
});

test("a critical item overrides a talent edit", () => {
  const ours = edit(built(1), "home", "hero", "variant", "overlay");
  const r = run(ours, built(2, { heroVariant: "stacked" }), [{ type: "critical", key: "hero" }]);
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "stacked");
  assert.equal(r.report.applied[0]!.reason, "critical");
});

test("a new block is inserted after its design neighbour, filled with her content", () => {
  const r = run(built(1), built(2, { withGallery: true }));
  assert.deepEqual(topKeys(asSide(r), "home"), ["hero", "menu", "about", "gallery", "faq"]);
  assert.equal(prop(asSide(r), "home", "gallery/image", "src"), "https://img.test/g0.jpg");
  assert.equal(r.report.added.length, 1);
});

test("a new block lands after its neighbour even when she reordered", () => {
  const ours = built(1, { order: ["about", "hero", "menu", "faq"] });
  const r = run(ours, built(2, { withGallery: true }));
  assert.deepEqual(topKeys(asSide(r), "home"), ["about", "gallery", "hero", "menu", "faq"]);
});

test("a new block is pending when the chosen items leave it out", () => {
  const r = run(built(1), built(2, { withGallery: true }), [{ type: "variant-default", key: "*" }]);
  assert.ok(!topKeys(asSide(r), "home").includes("gallery"));
  assert.equal(r.report.pending.length, 1);
  assert.equal(r.report.pending[0]!.change, "insert");
});

test("a new-block item adds only the block it names", () => {
  const theirs = built(2, { withGallery: true, heroVariant: "stacked" });
  const r = run(built(1), theirs, [{ type: "new-block", key: "home:gallery" }]);
  assert.ok(topKeys(asSide(r), "home").includes("gallery"));
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "split");
  assert.ok(r.report.pending.some((e) => e.key === "hero"));
});

test("a variant-default item scoped to one key leaves other keys pending", () => {
  const theirs = built(2, { heroVariant: "stacked", menuLayout: "cards" });
  const r = run(built(1), theirs, [{ type: "variant-default", key: "menu/services_catalog" }]);
  assert.equal(prop(asSide(r), "home", "menu/services_catalog", "layout"), "cards");
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "split");
});

test("a talent-added section keeps its place", () => {
  const ours = addNode(built(1), "home", null, plain("container", { layout: "stack", note: "mine" }), 1);
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.deepEqual(topKeys(asSide(r), "home"), ["hero", "+container", "menu", "about", "faq"]);
});

test("a talent-added child inside a design section is kept", () => {
  const ours = addNode(built(1), "home", "hero", plain("paragraph", { text: "Walk-ins welcome" }));
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  const hero = r.trees.home![0] as unknown as { children: Array<{ props: { text?: string } }> };
  assert.equal(hero.children.at(-1)!.props.text, "Walk-ins welcome");
});

test("a new section order applies when she kept the design order", () => {
  const r = run(built(1), built(2, { order: ["hero", "about", "menu", "faq"] }));
  assert.deepEqual(topKeys(asSide(r), "home"), ["hero", "about", "menu", "faq"]);
  assert.ok(r.report.applied.some((e) => e.change === "order"));
});

test("her own section order wins over a design reorder", () => {
  const ours = built(1, { order: ["menu", "hero", "about", "faq"] });
  const r = run(ours, built(2, { order: ["hero", "about", "menu", "faq"] }));
  assert.deepEqual(topKeys(asSide(r), "home"), ["menu", "hero", "about", "faq"]);
  assert.ok(r.report.kept.some((e) => e.change === "order" && e.reason === "your_order"));
});

test("talent-added sections travel with the section before them on reorder", () => {
  const ours = addNode(built(1), "home", null, plain("container", { layout: "stack" }), 2);
  const r = run(ours, built(2, { order: ["hero", "about", "menu", "faq"] }));
  assert.deepEqual(topKeys(asSide(r), "home"), ["hero", "about", "menu", "+container", "faq"]);
});

test("an order change needs a layout item when items are chosen", () => {
  const r = run(built(1), built(2, { order: ["hero", "about", "menu", "faq"] }), [{ type: "token-default", key: "*" }]);
  assert.deepEqual(topKeys(asSide(r), "home"), ["hero", "menu", "about", "faq"]);
  assert.ok(r.report.pending.some((e) => e.change === "order"));
});

test("nested: an untouched seeded label updates; an edited one is kept", () => {
  const r1 = run(built(1), built(2, { ctaLabel: "Book a visit" }));
  assert.equal(prop(asSide(r1), "home", "hero/button", "label"), "Book a visit");
  const ours = edit(built(1), "home", "hero/button", "label", "Reserve");
  const r2 = run(ours, built(2, { ctaLabel: "Book a visit" }));
  assert.equal(prop(asSide(r2), "home", "hero/button", "label"), "Reserve");
  assert.equal(r2.report.conflicts.length, 1);
});

test("nested: editing the section does not block its children's updates", () => {
  const ours = edit(built(1), "home", "hero", "variant", "overlay");
  const r = run(ours, built(2, { ctaLabel: "Book a visit" }));
  assert.equal(prop(asSide(r), "home", "hero/button", "label"), "Book a visit");
});

test("nested: a child new in the design is inserted under its section", () => {
  const r = run(built(1), built(2, { extraHeroChild: true }));
  assert.equal(prop(asSide(r), "home", "hero/paragraph#2", "text"), "Open today");
  assert.equal(r.report.added[0]!.parentKey, "hero");
});

test("services_catalog: untouched layout updates; her density edit keeps the old layout", () => {
  const r1 = run(built(1), built(2, { menuLayout: "cards" }));
  assert.equal(prop(asSide(r1), "home", "menu/services_catalog", "layout"), "cards");
  const ours = edit(built(1), "home", "menu/services_catalog", "density", "compact");
  const r2 = run(ours, built(2, { menuLayout: "cards" }));
  assert.equal(prop(asSide(r2), "home", "menu/services_catalog", "layout"), "rows");
  assert.equal(prop(asSide(r2), "home", "menu/services_catalog", "density"), "compact");
});

test("shell header + footer update; the copyright (content) stays hers", () => {
  const ours = edit(built(1), "shell", "footer/paragraph", "text", "© 2026 Valeria Nails Studio");
  const r = run(ours, built(2, { headerSticky: false, footerTone: "light" }));
  assert.equal(prop(asSide(r), "shell", "header", "sticky"), false);
  assert.equal(prop(asSide(r), "shell", "footer", "tone"), "light");
  assert.equal(prop(asSide(r), "shell", "footer/paragraph", "text"), "© 2026 Valeria Nails Studio");
});

test("a shell header she edited keeps her nav chrome", () => {
  const ours = edit(built(1), "shell", "header", "navChrome", "underline");
  const r = run(ours, built(2, { headerSticky: false }));
  assert.equal(prop(asSide(r), "shell", "header", "sticky"), true);
  assert.equal(prop(asSide(r), "shell", "header", "navChrome"), "underline");
});

test("a section the design dropped: removed when untouched, kept when edited", () => {
  const r1 = run(built(1), built(2, { dropFaq: true }));
  assert.ok(!topKeys(asSide(r1), "home").includes("faq"));
  assert.equal(r1.report.removed.length, 1);
  const ours = edit(built(1), "home", "faq", "layout", "grid");
  const r2 = run(ours, built(2, { dropFaq: true }));
  assert.ok(topKeys(asSide(r2), "home").includes("faq"));
  assert.ok(r2.report.kept.some((e) => e.change === "remove"));
});

test("a section kind swap: applied when untouched, kept when edited", () => {
  const r1 = run(built(1), built(2, { aboutKind: "section" }));
  const at = findKeyPath(r1.trees.home!, "about")!;
  assert.equal(r1.trees.home![at[0]!]!.kind, "section");
  const ours = edit(built(1), "home", "about", "layout", "stack");
  const r2 = run(ours, built(2, { aboutKind: "section" }));
  const at2 = findKeyPath(r2.trees.home!, "about")!;
  assert.equal(r2.trees.home![at2[0]!]!.kind, "container");
});

test("a duplicated block (copied stamp) is left as talent-added", () => {
  const ours = built(1);
  const hero = ours.trees.home![0]!;
  const withDup: DesignSide = { ...ours, trees: { ...ours.trees, home: [...ours.trees.home!, { ...hero, id: "dup" }] } };
  const r = run(withDup, built(2, { heroVariant: "stacked" }));
  const dup = r.trees.home!.find((n) => n.id === "dup")!;
  assert.equal((dup.props as { variant: string }).variant, "split");
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "stacked");
});

test("a release with no design change leaves the site byte-identical", () => {
  const ours = edit(built(1), "home", "hero", "variant", "overlay");
  const r = run(ours, built(1));
  assert.equal(stableStringify(r.trees), stableStringify(ours.trees));
  assert.equal(Object.values(r.report).flat().length, 0);
});

test("idempotent: merging the result again changes nothing", () => {
  let ours = edit(built(1), "home", "hero", "variant", "overlay");
  ours = addNode(ours, "home", null, plain("container", { layout: "row" }), 2);
  const theirs = built(2, { heroVariant: "stacked", withGallery: true, menuLayout: "cards", order: ["hero", "about", "menu", "gallery", "faq"] });
  const once = run(ours, theirs);
  const twice = run(asSide(once), theirs);
  assert.equal(stableStringify(twice.trees), stableStringify(once.trees));
  assert.equal(stableStringify(twice.tokens), stableStringify(once.tokens));
  const thrice = run(asSide(once), theirs, undefined, theirs);
  assert.equal(stableStringify(thrice.trees), stableStringify(once.trees));
});

test("pure: inputs are not mutated", () => {
  const ours = built(1);
  const snapshot = stableStringify(ours);
  run(ours, built(2, { heroVariant: "stacked", withGallery: true }));
  assert.equal(stableStringify(ours), snapshot);
});
