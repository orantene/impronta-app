/**
 * Theme releases Phase 2: restore (draft only, a new entry, never deletes)
 * and "Undo this update" (reverse merge; later edits stay).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { mergeDesignUpdate } from "@/lib/talent-site/theme-releases/merge";
import { edit, built, prop, topKeys } from "@/lib/talent-site/theme-releases/test-fixtures";
import type { DesignSide } from "@/lib/talent-site/theme-releases/types";

import { isHistorySnapshot, isThemeUpdateReport, planRestore, planUndoUpdate } from "./restore-plan";
import type { HistorySnapshot } from "./types";
import { CHROME_COPY, restoreSummary, themeUpdateSummary, undoUpdateSummary } from "./copy";

const n = (id: string, text: string): BuilderNode => ({ id, kind: "paragraph", props: { text } }) as unknown as BuilderNode;

const snapshot: HistorySnapshot = {
  v: 1,
  source: "published",
  shell: [n("h", "old header")],
  tokens: { "color.accent": "rose" },
  design: { slug: "maison-v2", version: 3, look: "blush" },
  pages: { p1: [n("a", "old home")], gone: [n("z", "deleted page")] },
};

test("snapshot guard: only v1 documents restore", () => {
  assert.equal(isHistorySnapshot(snapshot), true);
  assert.equal(isHistorySnapshot({ v: 2 }), false);
  assert.equal(isHistorySnapshot(null), false);
  assert.equal(isHistorySnapshot([]), false);
});

test("restore: writes shell, tokens, design pin and page bodies to the DRAFT", () => {
  const plan = planRestore(snapshot, { shell: [n("h", "new")], pages: { p1: [n("a", "new")] } });
  assert.deepEqual(plan.site.shell_tree, [n("h", "old header")]);
  assert.deepEqual(plan.site.design_tokens_draft, { "color.accent": "rose" });
  assert.equal(plan.site.theme_design_slug, "maison-v2");
  assert.equal(plan.site.theme_design_version, 3);
  assert.equal(plan.site.theme_look_slug, "blush");
  assert.deepEqual(plan.pages, [{ id: "p1", patch: { blocks: [n("a", "old home")] } }]);
  // Draft-only contract: nothing that touches the live site.
  const keys = Object.keys(plan.site);
  assert.ok(!keys.some((k) => /published|site_published_at|design_tokens$/.test(k)));
});

test("restore: a page deleted since is skipped, never re-created", () => {
  const plan = planRestore(snapshot, { shell: [], pages: { p1: [] } });
  assert.deepEqual(plan.skippedPages, ["gone"]);
  assert.equal(plan.pages.length, 1);
});

test("restore: the save chokepoints (locks, normalisation) run against the current tree", () => {
  const seen: Array<[unknown, unknown]> = [];
  const guard = (next: BuilderNode[], prev: BuilderNode[]) => {
    seen.push([next, prev]);
    return [...next, n("lock", "kept lock")];
  };
  const current = { shell: [n("h", "cur")], pages: { p1: [n("a", "cur")] } };
  const plan = planRestore(snapshot, current, guard);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0]![1], current.shell);
  assert.equal((plan.site.shell_tree as BuilderNode[]).length, 2);
});

test("restore: a partial snapshot (one page) touches only that page", () => {
  const plan = planRestore({ v: 1, source: "draft", pages: { p1: [n("a", "x")] } }, { shell: [n("h", "cur")], pages: { p1: [] } });
  assert.deepEqual(plan.site, {});
  assert.equal(plan.pages.length, 1);
});

test("restore summary: dated EN + ES", () => {
  const s = restoreSummary("2026-09-30T15:04:00Z");
  assert.match(s.en, /^Restored the version from /);
  assert.match(s.es, /^Restauraste la versión del /);
});

// ── Undo this update ─────────────────────────────────────────────────────────

const theirs = built(2, { heroVariant: "stacked", withGallery: true, order: ["hero", "about", "menu", "gallery"] });

function applied(ours: DesignSide) {
  return mergeDesignUpdate({ base: built(1), ours, theirs });
}

test("undo: reverts only the update and keeps a later edit", () => {
  const merged = applied(built(1));
  const later = edit({ trees: merged.trees, tokens: merged.tokens }, "home", "hero", "style.paddingY", "xl");
  const plan = planUndoUpdate({
    report: { merge: merged.report, fromVersion: 1, toVersion: 2 },
    shell: later.trees.shell!,
    home: later.trees.home!,
    homePageId: "home-1",
    tokens: later.tokens ?? {},
  });
  const home = plan.pages[0]!;
  assert.equal("id" in home && home.id, "home-1");
  const side = { trees: { home: home.patch.blocks as BuilderNode[] } };
  assert.equal(prop(side, "home", "hero", "variant"), "split");
  assert.equal(prop(side, "home", "hero", "style.paddingY"), "xl");
  assert.ok(!topKeys(side, "home").includes("gallery"));
  assert.ok(plan.reverted > 0);
  assert.equal(plan.site.theme_design_version, 1);
});

test("undo: a later edit to the same prop wins and is counted as kept", () => {
  const merged = applied(built(1));
  const later = edit({ trees: merged.trees, tokens: merged.tokens }, "home", "hero", "variant", "overlay");
  const plan = planUndoUpdate({
    report: { merge: merged.report },
    shell: later.trees.shell!,
    home: later.trees.home!,
    homePageId: "home-1",
    tokens: {},
  });
  const side = { trees: { home: plan.pages[0]!.patch.blocks as BuilderNode[] } };
  assert.equal(prop(side, "home", "hero", "variant"), "overlay");
  assert.ok(plan.kept >= 1);
  assert.equal("theme_design_version" in plan.site, false);
});

test("undo: report guard only accepts a stored merge report", () => {
  const merged = applied(built(1));
  assert.equal(isThemeUpdateReport({ merge: merged.report }), true);
  assert.equal(isThemeUpdateReport({ undoOf: "x" }), false);
  assert.equal(isThemeUpdateReport(null), false);
});

test("summaries: theme update + undo name kept edits in EN + ES", () => {
  const t = themeUpdateSummary("Maison v2", 3, 2);
  assert.equal(t.en, "Maison v2 update 3 applied · kept 2 of your edits");
  assert.equal(t.es, "Actualización Maison v2 3 aplicada · conservamos 2 de tus cambios");
  const u = undoUpdateSummary("Maison v2", 1);
  assert.equal(u.en, "Undid the Maison v2 update · kept your 1 later edit");
  assert.equal(u.es, "Deshiciste la actualización Maison v2 · conservamos tu edición posterior");
  assert.equal(undoUpdateSummary("Maison v2", 3).en, "Undid the Maison v2 update · kept your 3 later edits");
  assert.equal(undoUpdateSummary(null, 0).en, "Undid the design update");
  const all = JSON.stringify([t, u, CHROME_COPY]);
  assert.equal(all.includes("—"), false, "no em dashes in user copy");
});
