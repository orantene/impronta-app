/**
 * Theme releases: token-default merge + undo of one update (plan §1.4, §1.5).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { mergeDesignUpdate } from "./merge";
import { hashString, stableStringify } from "./origin";
import { reverseMerge } from "./reverse-merge";
import { addNode, built, edit, plain, prop, removeKey, topKeys } from "./test-fixtures";
import type { DesignSide, ReleaseItem } from "./types";

const withTokens = (side: DesignSide, tokens: Record<string, string>): DesignSide => ({ ...side, tokens });
const merge = (ours: DesignSide, theirs: DesignSide, items?: ReleaseItem[], tokenOrigin?: Record<string, string>) =>
  mergeDesignUpdate({
    base: withTokens(built(1), { "space.row": "12px", "font.body": "Inter", "radius.card": "8px" }),
    ours,
    theirs,
    ...(items ? { items } : {}),
    ...(tokenOrigin ? { tokenOrigin } : {}),
  });
const theirsTokens = { "space.row": "16px", "font.body": "Inter", "shadow.card": "soft" };

// ── tokens ───────────────────────────────────────────────────────────────────

test("tokens: a draft value equal to the old default takes the new default", () => {
  const r = merge(withTokens(built(1), { "space.row": "12px" }), withTokens(built(2), theirsTokens));
  assert.equal(r.tokens["space.row"], "16px");
});

test("tokens: her own value is kept", () => {
  const r = merge(withTokens(built(1), { "space.row": "20px" }), withTokens(built(2), theirsTokens));
  assert.equal(r.tokens["space.row"], "20px");
  assert.ok(r.report.kept.some((e) => e.key === "space.row"));
});

test("tokens: a key she never set gets the new default written (authored versions must land)", () => {
  const r = merge(withTokens(built(1), {}), withTokens(built(2), theirsTokens));
  assert.equal(r.tokens["shadow.card"], theirsTokens["shadow.card"]);
  assert.ok(r.report.applied.some((e) => e.key === "shadow.card" && e.reason === "inherits_default"));
});

test("tokens: theme_token_origin recognises an untouched value", () => {
  const origin = { "space.row": hashString("14px") };
  const r = mergeDesignUpdate({
    base: withTokens(built(1), {}),
    ours: withTokens(built(1), { "space.row": "14px" }),
    theirs: withTokens(built(2), { "space.row": "16px" }),
    tokenOrigin: origin,
  });
  assert.equal(r.tokens["space.row"], "16px");
});

test("tokens: a default the design dropped is removed from an untouched draft", () => {
  const r = merge(withTokens(built(1), { "radius.card": "8px" }), withTokens(built(2), theirsTokens));
  assert.equal("radius.card" in r.tokens, false);
});

test("tokens: pending unless a token-default item covers the key", () => {
  const ours = withTokens(built(1), { "space.row": "12px" });
  const r = merge(ours, withTokens(built(2), theirsTokens), [{ type: "token-default", key: "shadow.card" }]);
  assert.equal(r.tokens["space.row"], "12px");
  assert.ok(r.report.pending.some((e) => e.key === "space.row"));
});

test("tokens: a critical item overrides her value", () => {
  const ours = withTokens(built(1), { "space.row": "20px" });
  const r = merge(ours, withTokens(built(2), theirsTokens), [{ type: "critical", key: "space.row" }]);
  assert.equal(r.tokens["space.row"], "16px");
});

// ── reverse ──────────────────────────────────────────────────────────────────

const theirs = withTokens(built(2, { heroVariant: "stacked", withGallery: true, dropFaq: true, order: ["hero", "about", "menu", "gallery"] }), theirsTokens);

test("reverse: undoing an update on an unchanged site restores it exactly", () => {
  const ours = withTokens(built(1), { "space.row": "12px" });
  const r = merge(ours, theirs);
  const back = reverseMerge(r.report, { trees: r.trees, tokens: r.tokens });
  assert.equal(stableStringify(back.trees), stableStringify(ours.trees));
  assert.deepEqual(back.tokens, ours.tokens);
  assert.equal(back.kept.length, 0);
});

test("reverse: a later edit to a different prop survives the undo", () => {
  const r = merge(withTokens(built(1), {}), theirs);
  const later = edit({ trees: r.trees, tokens: r.tokens }, "home", "hero", "style.paddingY", "xl");
  const back = reverseMerge(r.report, later);
  const side = { trees: back.trees, tokens: back.tokens };
  assert.equal(prop(side, "home", "hero", "variant"), "split");
  assert.equal(prop(side, "home", "hero", "style.paddingY"), "xl");
});

test("reverse: a later edit to the same prop wins over the undo", () => {
  const r = merge(withTokens(built(1), {}), theirs);
  const later = edit({ trees: r.trees, tokens: r.tokens }, "home", "hero", "variant", "overlay");
  const back = reverseMerge(r.report, later);
  assert.equal(prop({ trees: back.trees }, "home", "hero", "variant"), "overlay");
  assert.ok(back.kept.some((e) => e.key === "hero"));
});

test("reverse: an added block is removed, unless she edited or filled it", () => {
  const r = merge(withTokens(built(1), {}), theirs);
  const back1 = reverseMerge(r.report, { trees: r.trees, tokens: r.tokens });
  assert.ok(!topKeys({ trees: back1.trees }, "home").includes("gallery"));
  const later = addNode({ trees: r.trees, tokens: r.tokens }, "home", "gallery", plain("paragraph", { text: "Mine" }));
  const back2 = reverseMerge(r.report, later);
  assert.ok(topKeys({ trees: back2.trees }, "home").includes("gallery"));
});

test("reverse: a block the update removed comes back after its old neighbour", () => {
  const r = merge(withTokens(built(1), {}), theirs);
  assert.ok(!topKeys({ trees: r.trees }, "home").includes("faq"));
  const back = reverseMerge(r.report, { trees: r.trees, tokens: r.tokens });
  assert.deepEqual(topKeys({ trees: back.trees }, "home"), ["hero", "menu", "about", "faq"]);
});

test("reverse: an order she changed after the update is kept", () => {
  const r = merge(withTokens(built(1), {}), theirs);
  const moved = { trees: { ...r.trees, home: [...r.trees.home!].reverse() }, tokens: r.tokens };
  const back = reverseMerge(r.report, moved);
  assert.ok(back.kept.some((e) => e.change === "order"));
});

test("reverse: token undo keeps a token she changed later", () => {
  const ours = withTokens(built(1), { "space.row": "12px", "radius.card": "8px" });
  const r = merge(ours, theirs);
  const later = { trees: r.trees, tokens: { ...r.tokens, "space.row": "30px" } };
  const back = reverseMerge(r.report, later);
  assert.equal(back.tokens["space.row"], "30px");
  assert.equal(back.tokens["radius.card"], "8px");
});

test("reverse: talent-removed and talent-added nodes are not touched by the undo", () => {
  let ours = removeKey(withTokens(built(1), {}), "home", "about");
  ours = addNode(ours, "home", null, plain("container", { layout: "row" }), 1);
  const r = merge(ours, theirs);
  const back = reverseMerge(r.report, { trees: r.trees, tokens: r.tokens });
  assert.equal(stableStringify(back.trees), stableStringify(ours.trees));
});
