/**
 * Nail Designer (app_nail_designer): schema + validation and the pure model.
 * Render and gallery live in sibling test files.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DESIGN_ALLOWED_NODE_KINDS } from "@/lib/talent-site/theme-catalog/validate";
import { collectAppPreflightIssues } from "@/lib/site-admin/edit-mode/publish-preflight-apps";

import { createBuilderNode } from "./create";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import {
  NAIL_COLORS,
  NAIL_FINGERS,
  NAIL_SUMMARY_MAX,
  nailColorName,
  nailDesignSummary,
  patchNails,
  starterNailDesign,
  surpriseNailDesign,
} from "./nail-designer-model";
import { nailPatternBg } from "./nail-designer-paint";
import { appNailDesignerPropsSchema, BUILDER_NODE_REGISTRY } from "./registry";
import { validateBuilderNodeTree } from "./validate";
import type { BuilderAppNailDesignerNode, BuilderNode } from "./types";

function node(over: Partial<BuilderAppNailDesignerNode["props"]> = {}): BuilderAppNailDesignerNode {
  const n = createBuilderNode("app_nail_designer") as BuilderAppNailDesignerNode;
  return { ...n, props: { ...n.props, ...over } };
}

test("the kind is registered, droppable, and allowed in talent Designs", () => {
  assert.ok(BUILDER_NODE_REGISTRY.app_nail_designer);
  assert.equal(BUILDER_NODE_REGISTRY.app_nail_designer.label, "Nail Designer");
  assert.equal(builderNodeKindAllowedAtRoot("app_nail_designer"), true);
  assert.ok(DESIGN_ALLOWED_NODE_KINDS.has("app_nail_designer"));
});

test("zero config: a fresh block has no required props and passes the schema", () => {
  const n = node();
  assert.deepEqual(n.props, {});
  assert.equal(appNailDesignerPropsSchema.safeParse(n.props).success, true);
  assert.equal(appNailDesignerPropsSchema.safeParse({}).success, true);
});

test("legacy option lists on stored nodes are stripped, not rejected", () => {
  const res = appNailDesignerPropsSchema.safeParse({ colors: ["cherry"], shapes: [], sendWithBooking: false });
  assert.equal(res.success, true);
  if (res.success) assert.equal("colors" in res.data, false);
});

test("schema rejects oversized copy", () => {
  assert.equal(appNailDesignerPropsSchema.safeParse({ title: "x".repeat(500) }).success, false);
});

test("a tree holding the node validates", () => {
  const section = createBuilderNode("section") as BuilderNode & { children: BuilderNode[] };
  const res = validateBuilderNodeTree([{ ...section, children: [node()] } as BuilderNode]);
  assert.equal(res.ok, true);
});

test("the starter look is the reference start: blush french, rosewood crystal ring", () => {
  const d = starterNailDesign();
  assert.equal(d.shape, "almond");
  assert.equal(d.length, "medium");
  assert.equal(d.skin, "#E9BE9E");
  assert.equal(d.nails[0].pattern, "french");
  assert.equal(d.nails[1].c1, "#8E3B46");
  assert.equal(d.nails[1].sticker, "gem");
});

test("patchNails touches one nail or all", () => {
  const d = starterNailDesign();
  assert.equal(patchNails(d.nails, 1, { finish: "chrome" }).filter((n) => n.finish === "chrome").length, 1);
  assert.equal(patchNails(d.nails, null, { finish: "chrome" }).filter((n) => n.finish === "chrome").length, NAIL_FINGERS.length);
});

test("surprise me paints the ring nail as the accent nail with a charm", () => {
  let i = 0;
  const seq = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8];
  const r = surpriseNailDesign(() => seq[i++ % seq.length]);
  assert.equal(r.nails.length, 5);
  assert.equal(r.nails[1].c1, r.nails[0].c2);
  assert.notEqual(r.nails[1].sticker, "none");
  assert.equal(r.nails[0].sticker, "none");
  assert.notEqual(r.nails[0].c1, r.nails[0].c2);
});

test("polish names resolve, custom hex gets a Custom label", () => {
  assert.equal(nailColorName("#e8a9a6", false), "Blush");
  assert.equal(nailColorName("#123456", false), "Custom #123456");
  assert.equal(nailColorName("#123456", true), "Personalizado #123456");
  assert.equal(NAIL_COLORS.length, 18);
});

test("every art pattern paints a gradient (ported patternBg)", () => {
  const n = { c1: "#E8A9A6", c2: "#F7F3EE" };
  for (const pattern of ["french", "ombre", "dots", "stripes", "moon", "check", "marble"]) {
    assert.match(nailPatternBg({ ...n, pattern }, 1), /gradient/);
  }
  assert.equal(nailPatternBg({ ...n, pattern: "solid" }, 1), "#E8A9A6");
});

test("the summary is plain words, bilingual, capped, with no em dashes or ids", () => {
  const d = starterNailDesign();
  const same = { ...d, nails: patchNails(d.nails, null, { c1: "#E8A9A6", pattern: "french", sticker: "none" }) };
  const en = nailDesignSummary(same, "en");
  assert.match(en, /^My nail design: almond shape, medium length\. All nails: french tip, blush with milk accent, gloss finish\.$/);
  const es = nailDesignSummary(same, "es-MX");
  assert.match(es, /^Mi diseño de uñas: forma almendra, largo media\. Todas las uñas: /);
  const mixed = nailDesignSummary(d, "en");
  assert.match(mixed, /Ring: solid, rosewood, gloss finish, crystal\./);
  assert.ok(mixed.length <= NAIL_SUMMARY_MAX);
  for (const text of [en, es, mixed]) assert.doesNotMatch(text, /[—–]/);
});

test("preflight has nothing to warn about: the app is zero config", () => {
  assert.deepEqual(collectAppPreflightIssues([{ id: "s1", kind: "section", children: [node()] }]), []);
});
