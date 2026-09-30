/**
 * Theme releases: origin stamps + classification (plan §1.2).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { translatableTextOf } from "@/lib/site-admin/builder-node/translatable-text";
import { buildMaisonV2Payload } from "../theme-catalog/collection/designs";
import { buildDesignTrees, fallbackHydrationTokens } from "../server/theme-apply-core";
import { classifyTree, designKeys, indexTree } from "./classify";
import {
  contentPaths,
  hashString,
  isNodeEdited,
  readOrigin,
  stableStringify,
  stripDesignOrigin,
  tokenOriginMap,
} from "./origin";
import { addNode, built, edit, plain, rawDesign, removeKey } from "./test-fixtures";

const allNodes = (tree: BuilderNode[]): BuilderNode[] =>
  tree.flatMap((n) => [n, ...allNodes(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[])]);

test("every seeded node is stamped with design, version and a key", () => {
  const side = built(3);
  for (const n of [...allNodes(side.trees.shell!), ...allNodes(side.trees.home!)]) {
    const o = readOrigin(n);
    assert.ok(o, `${n.kind} stamped`);
    assert.equal(o.design, "maison-v2");
    assert.equal(o.version, 3);
  }
});

test("keys are slotKey for sections and slotKey/segment for children", () => {
  const keys = designKeys(built(1).trees.home!);
  assert.deepEqual(keys.slice(0, 4), ["hero", "hero/heading", "hero/paragraph", "hero/button"]);
  assert.ok(keys.includes("menu/services_catalog"));
  assert.ok(keys.includes("about/image"));
});

test("same-segment siblings get #2, #3", () => {
  const keys = designKeys(built(1, { extraHeroChild: true }).trees.home!);
  assert.ok(keys.includes("hero/paragraph#2"));
});

test("keys do not depend on node ids or section position", () => {
  const a = built(1);
  const b = built(1, { order: ["about", "menu", "hero", "faq"] });
  assert.deepEqual([...designKeys(a.trees.home!)].sort(), [...designKeys(b.trees.home!)].sort());
});

test("{{token}} props are content-owned; literal labels are design-owned", () => {
  const raw = rawDesign().home[0]!;
  const kids = (raw as { children: BuilderNode[] }).children;
  assert.deepEqual(contentPaths(kids[0]!.props as Record<string, unknown>), ["text"]);
  assert.deepEqual(contentPaths(kids[2]!.props as Record<string, unknown>), ["href"]);
  assert.equal(contentPaths(raw.props as Record<string, unknown>).length, 0);
});

test("a freshly built site is fully untouched", () => {
  const side = built(1);
  const c = classifyTree(side.trees.home!);
  assert.equal(c.counts.edited, 0);
  assert.equal(c.counts.added, 0);
});

test("editing a design-owned prop marks only that node edited", () => {
  const side = edit(built(1), "home", "hero", "variant", "stacked");
  const c = classifyTree(side.trees.home!);
  assert.equal(c.states.get("hero"), "edited");
  assert.equal(c.states.get("hero/heading"), "untouched");
  assert.equal(c.counts.edited, 1);
});

test("editing content (heading text, i18n) keeps the node untouched", () => {
  let side = edit(built(1), "home", "hero/heading", "text", "Valeria Nails");
  side = edit(side, "home", "hero/heading", "i18n", { es: { text: "Uñas Valeria" } });
  assert.equal(classifyTree(side.trees.home!).states.get("hero/heading"), "untouched");
});

test("a literal seeded label edit is a talent edit", () => {
  const side = edit(built(1), "home", "hero/button", "label", "Reserve");
  assert.equal(classifyTree(side.trees.home!).states.get("hero/button"), "edited");
});

test("removed keys and talent-added nodes are classified", () => {
  let side = removeKey(built(1), "home", "faq");
  side = addNode(side, "home", null, plain("paragraph", { text: "Mine" }));
  const c = classifyTree(side.trees.home!, designKeys(built(1).trees.home!));
  assert.equal(c.states.get("faq"), "removed");
  assert.equal(c.states.get("faq/faq"), "removed");
  assert.equal(c.counts.added, 1);
});

test("a duplicated block (copied stamp) counts as talent-added", () => {
  const side = built(1);
  const hero = side.trees.home![0]!;
  const home = [...side.trees.home!, { ...hero, id: "dup" } as BuilderNode];
  const idx = indexTree(home);
  assert.ok(idx.added.some((a) => a.node.id === "dup"));
});

test("stamp survives validateBuilderNodeTree (carrier) and strip removes it", () => {
  const side = built(1);
  const origin = { design: "maison-v2", version: 1, key: "hero/heading", fp: "abc", cp: ["text"] };
  const wrap = (o: unknown) => [
    {
      id: "c1",
      kind: "container",
      props: { layout: "stack", __origin: { ...origin, key: "hero", cp: [] } },
      children: [{ id: "h1", kind: "heading", props: { text: "Hi", level: 2, __origin: o } }],
    },
  ];
  const check = validateBuilderNodeTree(wrap(origin));
  assert.deepEqual(check.ok ? [] : check.issues, []);
  const kid = (check.tree[0] as { children: BuilderNode[] }).children[0]!;
  assert.deepEqual(readOrigin(kid), origin);
  assert.equal(readOrigin(check.tree[0] as BuilderNode)?.key, "hero");
  const junk = validateBuilderNodeTree(wrap({ key: 3 }));
  assert.equal(readOrigin((junk.tree[0] as { children: BuilderNode[] }).children[0]!), undefined);
  const stripped = stripDesignOrigin(side.trees.home!);
  assert.equal(allNodes(stripped).filter((n) => readOrigin(n)).length, 0);
});

test("the stamp is never offered as translatable copy", () => {
  const side = built(1);
  for (const n of allNodes(side.trees.home!)) {
    assert.ok(translatableTextOf(n).every((t) => !t.prop.startsWith("__origin")));
  }
});

test("Maison v2 build: stamped, all untouched, render output unchanged", () => {
  const payload = buildMaisonV2Payload();
  const tokens = { ...fallbackHydrationTokens("Valeria"), bio: "Bio", tagline: "Tag" };
  const plainBuild = buildDesignTrees(payload, tokens, 2026);
  const stampedBuild = buildDesignTrees(payload, tokens, 2026, { design: "maison-v2", version: 7 });
  assert.ok(plainBuild.ok && stampedBuild.ok);
  if (!plainBuild.ok || !stampedBuild.ok) return;
  for (const tree of [stampedBuild.shellTree, stampedBuild.homeTree]) {
    const nodes = allNodes(tree);
    assert.ok(nodes.every((n) => readOrigin(n)), "every node stamped");
    assert.ok(nodes.every((n) => !isNodeEdited(n)), "every node untouched");
  }
  assert.equal(
    stableStringify(stripDesignOrigin(stampedBuild.homeTree)),
    stableStringify(stripDesignOrigin(plainBuild.homeTree)),
  );
  assert.equal(
    stableStringify(stripDesignOrigin(stampedBuild.shellTree)),
    stableStringify(stripDesignOrigin(plainBuild.shellTree)),
  );
  const keys = designKeys(stampedBuild.homeTree);
  assert.equal(new Set(keys).size, keys.length, "keys unique");
  // Release 2.5 keyed the catalog as the two-column row-card layout.
  assert.ok(keys.some((k) => k.endsWith("/services_row_cards")));
});

test("Maison v2 stamps survive a second validation (a builder save)", () => {
  const built2 = buildDesignTrees(buildMaisonV2Payload(), fallbackHydrationTokens("V"), 2026, {
    design: "maison-v2",
    version: 1,
  });
  assert.ok(built2.ok);
  if (!built2.ok) return;
  const again = validateBuilderNodeTree(built2.homeTree);
  assert.ok(again.ok);
  assert.equal(classifyTree(again.tree as BuilderNode[]).counts.edited, 0);
});

test("token origin hashes each default; hash + stable stringify are deterministic", () => {
  const map = tokenOriginMap({ "space.m": "16px", "font.body": "Inter" });
  assert.equal(map["space.m"], hashString("16px"));
  assert.notEqual(map["space.m"], map["font.body"]);
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
});
