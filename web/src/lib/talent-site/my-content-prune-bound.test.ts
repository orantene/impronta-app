/**
 * F31: empty FAQ / visit / reviews sections never render (preview and live),
 * and their eyebrow + heading go with them. F26: the Maison v2 ticker shows
 * her services, never the trade next to them.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { BuilderNodeRenderDataSources } from "@/lib/site-admin/builder-node/render";
import { buildMaisonV2Payload } from "./theme-catalog/collection/designs";
import { pruneEmptyBoundSections, pruneEmptyMyContentBlocks } from "./my-content-prune";

function find(nodes: readonly BuilderNode[], pred: (n: BuilderNode) => boolean, out: BuilderNode[] = []): BuilderNode[] {
  for (const n of nodes) {
    if (pred(n)) out.push(n);
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) find(kids, pred, out);
  }
  return out;
}

const texts = (nodes: readonly BuilderNode[]) =>
  find(nodes, (n) => n.kind === "heading" || n.kind === "paragraph").map((n) =>
    String((n.props as { text?: unknown }).text ?? ""),
  );

const isFaq = (n: BuilderNode) =>
  n.kind === "accordion" && (n.props as { bindSource?: string }).bindSource === "talent_faq_items";

const ds = (x: Record<string, unknown>) => x as BuilderNodeRenderDataSources;

test("an empty FAQ removes the whole Questions band, labels included (live subset)", () => {
  const tree = buildMaisonV2Payload().homeTree;
  assert.equal(find(tree, isFaq).length, 1);
  const out = pruneEmptyBoundSections(
    tree,
    ds({ talentFaqItems: [], talentVisitFacts: [{ label: "Where", value: "CDMX", icon: "place" }] }),
  );
  assert.equal(find(out, isFaq).length, 0);
  assert.ok(!texts(out).includes("Questions"));
  assert.ok(!texts(out).some((t) => t.includes("What I get")));
  // The visit block had facts, so it stays.
  assert.equal(find(out, (n) => n.kind === "visit").length, 1);
});

test("published questions keep the band", () => {
  const tree = buildMaisonV2Payload().homeTree;
  const out = pruneEmptyBoundSections(
    tree,
    ds({
      talentFaqItems: [{ id: "q1", question: "Do you do gel?", answer: "Yes." }],
      talentVisitFacts: [{ label: "Where", value: "CDMX", icon: "place" }],
    }),
  );
  assert.equal(find(out, isFaq).length, 1);
  assert.ok(texts(out).includes("Questions"));
});

test("My content prune hides an empty visit and an empty FAQ too", () => {
  const tree = buildMaisonV2Payload().homeTree;
  const out = pruneEmptyMyContentBlocks(tree, ds({ talentFaqItems: [], talentVisitFacts: [] }));
  assert.equal(find(out, isFaq).length, 0);
  assert.equal(find(out, (n) => n.kind === "visit").length, 0);
});

test("the Maison v2 ticker binds services, not the trade", () => {
  const tree = buildMaisonV2Payload().homeTree;
  const ticker = find(tree, (n) => n.kind === "marquee")[0]!;
  const items = (ticker.props as { items: Array<{ text: string }> }).items.map((i) => i.text);
  assert.deepEqual(items, ["{{service1}}", "{{service2}}", "{{service3}}"]);
});
