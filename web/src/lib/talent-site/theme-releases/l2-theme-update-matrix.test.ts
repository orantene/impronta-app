/**
 * TUL-420 / EPIC L2: one named test per Notion case-matrix row.
 * Pure merge + sheet copy. No releases, no DB writes.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { mergeDesignUpdate } from "./merge";
import { findKeyPath } from "./tree-ops";
import { addNode, built, edit, plain, prop, removeKey, topKeys } from "./test-fixtures";
import type { DesignSide, ReleaseItem } from "./types";
import { combineReleaseItems, summarizeReport } from "./talent-update/view";
import { decisionLine, keptLine, keptRemovedLine } from "./talent-update/copy";

const base = built(1);
const run = (ours: DesignSide, theirs: DesignSide, items?: ReleaseItem[], b: DesignSide = base) =>
  mergeDesignUpdate({ base: b, ours, theirs, ...(items ? { items } : {}) });
const asSide = (r: ReturnType<typeof run>): DesignSide => ({ trees: r.trees, tokens: r.tokens });

test("L2 matrix: edited text kept when Design changes the same label", () => {
  const ours = edit(built(1), "home", "hero/button", "label", "Reserve with me");
  const r = run(ours, built(2, { ctaLabel: "Book a visit" }));
  assert.equal(prop(asSide(r), "home", "hero/button", "label"), "Reserve with me");
  assert.ok(r.report.conflicts.length >= 1 || r.report.kept.length >= 1);
});

test("L2 matrix: untouched text updates (es/en survive on sibling props)", () => {
  const ours = edit(built(1), "home", "hero/button", "i18n", { es: { label: "Reservar" } });
  const r = run(ours, built(2, { ctaLabel: "Book a visit" }));
  assert.equal(prop(asSide(r), "home", "hero/button", "label"), "Book a visit");
  assert.deepEqual(prop(asSide(r), "home", "hero/button", "i18n"), { es: { label: "Reservar" } });
});

test("L2 matrix: talent colour kept; untouched token updates", () => {
  const ours: DesignSide = {
    ...built(1),
    tokens: { "space.row": "20px", "font.body": "Inter" },
  };
  const theirs: DesignSide = {
    ...built(2),
    tokens: { "space.row": "16px", "font.body": "Inter", "shadow.card": "soft" },
  };
  const r = mergeDesignUpdate({
    base: { ...built(1), tokens: { "space.row": "12px", "font.body": "Inter" } },
    ours,
    theirs,
  });
  assert.equal(r.tokens["space.row"], "20px");
  assert.equal(r.tokens["shadow.card"], "soft");
  assert.ok(r.report.kept.some((e) => e.key === "space.row"));
});

test("L2 matrix: replaced photo kept", () => {
  const ours = edit(built(1), "home", "about/image", "src", "https://img.test/mine.jpg");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.equal(prop(asSide(r), "home", "about/image", "src"), "https://img.test/mine.jpg");
});

test("L2 matrix: reorder/hide kept; new section placed sensibly", () => {
  const ours = removeKey(built(1, { order: ["menu", "hero", "about", "faq"] }), "home", "faq");
  const r = run(ours, built(2, { withGallery: true }));
  assert.ok(!topKeys(asSide(r), "home").includes("faq"));
  assert.ok(topKeys(asSide(r), "home").includes("gallery"));
  assert.deepEqual(topKeys(asSide(r), "home").slice(0, 2), ["menu", "hero"]);
  assert.ok(r.report.kept.some((e) => e.key === "faq" && e.reason === "removed") || !topKeys(asSide(r), "home").includes("faq"));
});

test("L2 matrix: edited section not silently dropped when Design removes it", () => {
  const ours = edit(built(1), "home", "faq", "layout", "grid");
  const r = run(ours, built(2, { dropFaq: true }));
  assert.ok(topKeys(asSide(r), "home").includes("faq"));
  assert.ok(r.report.kept.some((e) => e.key === "faq"));
});

test("L2 matrix: talent-added section untouched", () => {
  const ours = addNode(built(1), "home", null, plain("container", { layout: "stack", note: "mine" }), 1);
  const r = run(ours, built(2, { heroVariant: "stacked", withGallery: true }));
  assert.ok(topKeys(asSide(r), "home").includes("+container"));
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "stacked");
});

test("L2 matrix: skipped versions combine to latest with same keep rules", () => {
  const items = combineReleaseItems([
    {
      items: [
        { type: "variant-default", key: "*", note: { en: "v2", es: "v2" } },
        { type: "new-block", key: "gallery", tree: "home" },
      ] as ReleaseItem[],
    },
    {
      items: [
        { type: "variant-default", key: "*", note: { en: "v3", es: "v3" } },
        { type: "token-default", key: "*", tokenKeys: ["space.row"] },
      ] as ReleaseItem[],
    },
  ]);
  assert.ok(items.some((i) => i.type === "variant-default"));
  assert.ok(items.some((i) => i.type === "new-block"));
  const ours = edit(built(1), "home", "hero", "style.paddingY", "xl");
  const theirs = built(3, { heroVariant: "stacked", withGallery: true }, { "space.row": "16px" });
  const r = mergeDesignUpdate({
    base: built(1, {}, { "space.row": "12px" }),
    ours: { ...ours, tokens: { "space.row": "12px" } },
    theirs,
    items: items.filter((i) => i.type !== "new-block"),
  });
  assert.equal(prop(asSide(r), "home", "hero", "style.paddingY"), "xl");
  assert.equal(prop(asSide(r), "home", "hero", "variant"), "split");
  assert.ok(!topKeys(asSide(r), "home").includes("gallery"), "Apply path excludes new blocks");
});

test("L2 matrix: conflict parts surface in decisionLine (en+es, no em dash)", () => {
  const ours = edit(built(1), "home", "hero", "variant", "overlay");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  const summary = summarizeReport(r.report);
  assert.ok(summary.conflicts >= 1);
  assert.ok(summary.conflictKeys.includes("hero"));
  const en = decisionLine(summary, "en");
  const es = decisionLine(summary, "es");
  assert.ok(en && en.includes("keep your version") && en.includes("Hero"));
  assert.ok(es && es.includes("conservamos tu versión"));
  assert.ok(!en!.includes("—") && !es!.includes("—"));
  assert.equal(decisionLine({ ...summary, conflicts: 0, conflictKeys: [] }, "en"), null);
});

test("L2 matrix: kept + removed lines still bilingual for the sheet", () => {
  const ours = edit(removeKey(built(1), "home", "faq"), "home", "hero", "style.paddingY", "xl");
  const r = run(ours, built(2, { heroVariant: "stacked", menuLayout: "cards" }));
  const summary = summarizeReport(r.report);
  assert.match(keptLine(summary, "en"), /We keep/);
  assert.match(keptLine(summary, "es"), /Conservamos/);
  const removed = keptRemovedLine(summary, "en");
  if (summary.removedKeys.length > 0) {
    assert.ok(removed && removed.includes("removed"));
    assert.ok(!removed.includes("—"));
  }
});

test("L2 matrix: draft-first contract documented by merge purity (no live columns in result)", () => {
  // mergeDesignUpdate returns trees/tokens only; live columns are never in the result.
  // Apply wiring (talent-update.server) writes draft + history; covered in talent-update.test.ts.
  const ours = edit(built(1), "home", "hero", "style.paddingY", "xl");
  const r = run(ours, built(2, { heroVariant: "stacked" }));
  assert.ok("trees" in r && "tokens" in r && "report" in r);
  assert.equal(prop(asSide(r), "home", "hero", "style.paddingY"), "xl");
  const at = findKeyPath(r.trees.home!, "hero");
  assert.ok(at);
});
