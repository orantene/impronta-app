/**
 * The footer "See location" link is decided at render time: kept when the page
 * has a Location section, retargeted to the visit band when only that exists,
 * dropped when neither does. It is never a dead anchor.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildMaisonV2Payload } from "./theme-catalog/collection/designs";
import { pruneDeadSectionLinks } from "./dead-section-links";
import { pruneEmptyBoundSections } from "./my-content-prune";

type AnyNode = BuilderNode & { children?: BuilderNode[] };

function find(nodes: readonly BuilderNode[], pred: (n: BuilderNode) => boolean, out: BuilderNode[] = []): BuilderNode[] {
  for (const n of nodes) {
    if (pred(n)) out.push(n);
    const kids = (n as AnyNode).children;
    if (Array.isArray(kids)) find(kids, pred, out);
  }
  return out;
}

const link = (href: string) => ({ id: "l", kind: "button", props: { label: "See location", href } }) as unknown as BuilderNode;
const section = (anchorId: string) => ({ id: anchorId, kind: "container", props: { anchorId } }) as unknown as BuilderNode;
const footer = (href: string): BuilderNode[] => [
  { id: "f", kind: "container", props: {}, children: [{ id: "h", kind: "heading", props: { text: "Where" } } as BuilderNode, link(href)] } as unknown as BuilderNode,
];
const hrefs = (tree: readonly BuilderNode[]) =>
  find(tree, (n) => n.kind === "button").map((n) => (n.props as { href: string }).href);

test("the link stays when the page has a Location section", () => {
  assert.deepEqual(hrefs(pruneDeadSectionLinks(footer("#location"), [section("location")])), ["#location"]);
});

test("only a visit band on the page: the link points at it", () => {
  assert.deepEqual(hrefs(pruneDeadSectionLinks(footer("#location"), [section("visit")])), ["#visit"]);
  assert.deepEqual(hrefs(pruneDeadSectionLinks(footer("#visit"), [section("location")])), ["#location"]);
});

test("neither section on the page: the link is dropped, the rest of the footer stays", () => {
  const out = pruneDeadSectionLinks(footer("#location"), [section("about")]);
  assert.deepEqual(hrefs(out), []);
  assert.equal(find(out, (n) => n.kind === "heading").length, 1);
  // A page that renders no sections at all (a policy page) drops it too.
  assert.deepEqual(hrefs(pruneDeadSectionLinks(footer("#location"), [])), []);
});

test("other links are never touched", () => {
  const tree = footer("#talent-ask");
  assert.deepEqual(hrefs(pruneDeadSectionLinks(tree, [])), ["#talent-ask"]);
  assert.deepEqual(hrefs(pruneDeadSectionLinks(footer("/blog"), [])), ["/blog"]);
});

test("Maison v2: the real footer link follows the real page (empty Location is pruned, so the link goes)", () => {
  const p = buildMaisonV2Payload();
  const has = (tree: readonly BuilderNode[]) => hrefs(tree).includes("#location");
  assert.ok(has(p.shellTree), "the footer ships the link");
  const withZone = pruneEmptyBoundSections(p.homeTree, {
    talentLocation: { addressMode: "zone_only", studioKind: "studio", city: "Mérida", neighbourhood: "", arrivalNote: "", arrivalPhotoUrl: "" },
  });
  assert.ok(has(pruneDeadSectionLinks(p.shellTree, withZone)), "a zone: the Location band renders, the link stays");
  const noZone = pruneEmptyBoundSections(p.homeTree, {});
  assert.ok(!has(pruneDeadSectionLinks(p.shellTree, noZone)), "no zone: no Location band, no link");
  assert.ok(!hrefs(pruneDeadSectionLinks(p.shellTree, noZone)).includes("#visit"));
});
