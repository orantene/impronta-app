/**
 * Gridline assembly (G14): mockup section order, parity keys, no baked claims,
 * EN + ES summaries, tier, and the preview Look resolution.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateDesign } from "../validate";
import { COLLECTION_DESIGNS, COLLECTION_DESIGN_SUMMARY_ES } from "./designs";
import { buildGridlinePayload } from "./gridline";
import { gridlineLookTokensFromCode } from "./gridline-looks";

const html = (nodes: BuilderNode[]) =>
  renderToStaticMarkup(renderBuilderNodes(nodes, { mode: "freeform", includeRendererStyles: false, includeFontLinks: false }));

const slot = (n: BuilderNode) => String((n.props as Record<string, unknown>).slotKey);

test("gridline is registered, validates, is talent_basic and has EN + ES summaries", () => {
  const d = COLLECTION_DESIGNS.find((x) => x.slug === "gridline");
  assert.ok(d);
  assert.equal(d.required_talent_tier, "talent_basic");
  assert.ok(d.summary.length > 20 && (COLLECTION_DESIGN_SUMMARY_ES.gridline ?? "").length > 20);
  assert.deepEqual(validateDesign(d.buildPayload()).errors, []);
});

test("gridline home sections follow the mockup order and stamp parity keys", () => {
  const p = buildGridlinePayload();
  assert.deepEqual(p.homeTree.map(slot), ["emergency", "hero", "tasks", "services", "proof", "area", "faq"]);
  assert.equal(slot(p.shellTree[0]!), "header");
  assert.equal(slot(p.shellTree[1]!), "footer");
  for (const n of [...p.shellTree, ...p.homeTree]) {
    assert.match(html([n]), new RegExp(`data-parity-key="${slot(n)}"`), slot(n));
  }
  // Header is the utility bar; services is the matrix layout.
  const json = JSON.stringify(p);
  assert.match(json, /"kind":"utility_bar"/);
  assert.match(json, /"layout":"matrix"/);
  assert.match(json, /"layout":"work_order"/);
  assert.match(json, /"layout":"area"/);
});

test("gridline bakes no hex and no talent-specific claim (spec cells, rows and tasks ship unfilled)", () => {
  const p = buildGridlinePayload();
  const json = JSON.stringify(p);
  assert.doesNotMatch(json, /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(json, /—/);
  const rows = JSON.stringify(p.homeTree.find((n) => slot(n) === "proof"));
  assert.doesNotMatch(rows, /"value":"[^"]/);
  assert.match(json, /"offeringId":""/);
  assert.doesNotMatch(json, /"specs"/);
});

test("gridline Looks resolve by bare palette key or full slug", () => {
  assert.ok(gridlineLookTokensFromCode("green"));
  assert.ok(gridlineLookTokensFromCode("gridline-default"));
  assert.equal(gridlineLookTokensFromCode("nope"), null);
});
