/**
 * Nail Designer (app_nail_designer): schema + validation, the pure model, and
 * the preflight warning. Render and gallery live in sibling test files.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DESIGN_ALLOWED_NODE_KINDS } from "@/lib/talent-site/theme-catalog/validate";
import {
  NAIL_DESIGNER_EMPTY_MESSAGE,
  collectAppPreflightIssues,
} from "@/lib/site-admin/edit-mode/publish-preflight-apps";

import { createBuilderNode } from "./create";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import {
  NAIL_FINGERS,
  NAIL_SUMMARY_MAX,
  initialNailDesign,
  nailDesignSummary,
  nailOfferedCount,
  patchNails,
  resolveNailOffered,
  surpriseNailDesign,
} from "./nail-designer-model";
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

test("defaults offer everything with booking on, and pass the schema", () => {
  const n = node();
  assert.equal(n.props.sendWithBooking, true);
  assert.equal(appNailDesignerPropsSchema.safeParse(n.props).success, true);
  const offered = resolveNailOffered(n.props);
  assert.equal(offered.shapes.length, 6);
  assert.equal(offered.colors.length, 18);
  assert.equal(offered.charms[0].id, "none");
});

test("schema rejects wrong types and oversized copy", () => {
  assert.equal(appNailDesignerPropsSchema.safeParse({ sendWithBooking: "yes" }).success, false);
  assert.equal(appNailDesignerPropsSchema.safeParse({ title: "x".repeat(500) }).success, false);
  assert.equal(appNailDesignerPropsSchema.safeParse({ colors: "cherry" }).success, false);
});

test("a tree holding the node validates", () => {
  const section = createBuilderNode("section") as BuilderNode & { children: BuilderNode[] };
  const res = validateBuilderNodeTree([{ ...section, children: [node()] } as BuilderNode]);
  assert.equal(res.ok, true);
});

test("an absent list offers all, an empty list switches the group off, unknown ids are ignored", () => {
  const o = resolveNailOffered({ shapes: ["round", "nope"], colors: [], arts: undefined, finishes: [], charms: [] });
  assert.deepEqual(o.shapes.map((s) => s.id), ["round"]);
  assert.equal(o.colors.length, 0);
  assert.equal(o.arts.length, 8);
  assert.equal(o.finishes.length, 0);
  assert.equal(o.charms.length, 0);
  assert.equal(nailOfferedCount(o), 1 + 8);
});

test("the starter and the random look stay inside what is offered", () => {
  const offered = resolveNailOffered({ shapes: ["square"], colors: ["cherry", "onyx"], arts: ["dots"], finishes: ["matte"], charms: ["star"] });
  const d = initialNailDesign(offered);
  assert.equal(d.shape, "square");
  assert.ok(["cherry", "onyx"].includes(d.nails[0].c1));
  assert.equal(d.nails[0].art, "dots");
  assert.equal(d.nails[0].finish, "matte");
  let i = 0;
  const seq = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8];
  const s = surpriseNailDesign(offered, () => seq[i++ % seq.length]);
  for (const nail of s.nails) {
    assert.ok(["cherry", "onyx"].includes(nail.c1) && ["cherry", "onyx"].includes(nail.c2));
    assert.equal(nail.art, "dots");
    assert.equal(nail.finish, "matte");
    assert.ok(["none", "star"].includes(nail.charm));
  }
  assert.equal(s.shape, "square");
});

test("patchNails touches one nail or all", () => {
  const d = initialNailDesign(resolveNailOffered({}));
  assert.equal(patchNails(d, 1, { finish: "chrome" }).nails.filter((n) => n.finish === "chrome").length, 1);
  assert.equal(patchNails(d, null, { finish: "chrome" }).nails.filter((n) => n.finish === "chrome").length, NAIL_FINGERS.length);
});

test("the summary is plain words, bilingual, capped, with no em dashes or ids", () => {
  const d = initialNailDesign(resolveNailOffered({}));
  const en = nailDesignSummary(d, "en");
  assert.match(en, /^My nail design: almond shape, medium length\. All nails: french tip, blush with milk accent, gloss finish\.$/);
  const es = nailDesignSummary(d, "es-MX");
  assert.match(es, /^Mi diseño de uñas: forma almendra, largo media\. Todas las uñas: /);
  const mixed = patchNails(patchNails(d, 1, { charm: "gem", c1: "cherry" }), 4, { art: "marble", finish: "glitter" });
  const long = nailDesignSummary(mixed, "en");
  assert.match(long, /Ring: /);
  assert.match(long, /Thumb: marble/);
  assert.ok(long.length <= NAIL_SUMMARY_MAX);
  for (const text of [en, es, long]) {
    assert.doesNotMatch(text, /[—–]/);
    assert.doesNotMatch(text, /\bc1\b|blush_/);
  }
});

test("preflight warns when no option at all is switched on, and only then", () => {
  const empty = node({ shapes: [], colors: [], arts: [], finishes: [], charms: [] });
  const issues = collectAppPreflightIssues([{ id: "s1", kind: "section", children: [empty] }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "warn");
  assert.equal(issues[0].nodeId, empty.id);
  assert.equal(issues[0].message, NAIL_DESIGNER_EMPTY_MESSAGE);
  assert.deepEqual(collectAppPreflightIssues([node()]), []);
  assert.deepEqual(collectAppPreflightIssues([node({ shapes: [], colors: [], arts: [], finishes: [], charms: ["gem"] })]), []);
});
