/**
 * Template editor: pinned design keys (`props.designKey`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { COLLECTION_DESIGNS, buildMaisonV2Payload } from "../theme-catalog/collection/designs";
import type { DesignPayload } from "../theme-catalog/types";
import { buildDesignTrees, fallbackHydrationTokens } from "../server/theme-apply-core";
import { diffDesignPayloads } from "./diff-payload";
import {
  designKeyIssues,
  ensureDesignKeys,
  freezeDesignKeys,
  mintDesignKey,
  withDesignKey,
} from "./design-keys";
import { hasKids, kidsOf, nodeSegment, readOrigin, stampDesignOrigin } from "./origin";

const SRC = { design: "x", version: 1 };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const all = (tree: ReadonlyArray<BuilderNode>): BuilderNode[] =>
  tree.flatMap((n) => [n, ...(hasKids(n) ? all(kidsOf(n)) : [])]);
const stampedKeys = (tree: BuilderNode[]) => all(stampDesignOrigin(tree, SRC)).map((n) => readOrigin(n)!.key);
const diff = (a: DesignPayload, b: DesignPayload) =>
  diffDesignPayloads("maison-v2", { payload: a, version: 1 }, { payload: b, version: 2 }, []);

/** The pre-designKey algorithm, verbatim, as the identity reference. */
function legacyKeys(tree: ReadonlyArray<BuilderNode>, parentKey: string | null = null): string[] {
  const seen = new Map<string, number>();
  return tree.flatMap((n) => {
    const seg = nodeSegment(n);
    const count = (seen.get(seg) ?? 0) + 1;
    seen.set(seg, count);
    const local = count === 1 ? seg : `${seg}#${count}`;
    const key = parentKey ? `${parentKey}/${local}` : local;
    return [key, ...(hasKids(n) ? legacyKeys(kidsOf(n), key) : [])];
  });
}

const heroOf = (p: DesignPayload) => p.homeTree.find((n) => n.props && (n.props as { slotKey?: string }).slotKey === "hero")!;
const heroKids = (p: DesignPayload) => kidsOf(kidsOf(heroOf(p))[0]!);

test("no designKey: every collection design stamps byte-identical keys", () => {
  for (const d of COLLECTION_DESIGNS) {
    const p = d.buildPayload();
    for (const tree of [p.shellTree, p.homeTree]) {
      assert.deepEqual(stampedKeys(tree), legacyKeys(tree), d.slug);
    }
  }
});

test("freeze keeps every stamped key and the release diff is empty", () => {
  for (const d of COLLECTION_DESIGNS) {
    const p = d.buildPayload();
    const f = freezeDesignKeys(p);
    assert.deepEqual(stampedKeys(f.homeTree), stampedKeys(p.homeTree), d.slug);
    assert.deepEqual(stampedKeys(f.shellTree), stampedKeys(p.shellTree), d.slug);
    assert.ok(all([...f.shellTree, ...f.homeTree]).every((n) => typeof (n.props as { designKey?: unknown }).designKey === "string"));
    assert.deepEqual(diff(p, f), [], d.slug);
    assert.deepEqual(designKeyIssues(f), [], d.slug);
  }
});

test("maison-v2 hero has paragraph twins (fixture precondition)", () => {
  const keys = stampedKeys(buildMaisonV2Payload().homeTree);
  assert.ok(keys.includes("hero/container/paragraph#3"));
});

test("after freeze, deleting a twin is one removed item, no rewrites on siblings", () => {
  const before = freezeDesignKeys(buildMaisonV2Payload());
  const after = clone(before);
  const kids = heroKids(after);
  const at = kids.findIndex((n) => n.kind === "paragraph");
  kids.splice(at, 1);
  const items = diff(before, after);
  assert.equal(items.length, 1, JSON.stringify(items));
  assert.equal(items[0]!.type, "layout");
  assert.equal(items[0]!.layout, "removed");
  assert.equal(items[0]!.key, "home:hero/container/paragraph");
  // Unfrozen, the same delete shifts ordinals and reports bogus rewrites.
  const raw = buildMaisonV2Payload();
  const rawAfter = clone(raw);
  heroKids(rawAfter).splice(heroKids(rawAfter).findIndex((n) => n.kind === "paragraph"), 1);
  assert.ok(diff(raw, rawAfter).some((i) => i.type === "variant-default"));
});

test("after freeze, reordering twins is one layout order item", () => {
  const before = freezeDesignKeys(buildMaisonV2Payload());
  const after = clone(before);
  const kids = heroKids(after);
  const idx = kids.map((n, i) => (n.kind === "paragraph" ? i : -1)).filter((i) => i >= 0);
  const [a, b] = [idx[0]!, idx[1]!];
  [kids[a], kids[b]] = [kids[b]!, kids[a]!];
  const items = diff(before, after);
  assert.equal(items.length, 1, JSON.stringify(items));
  assert.equal(items[0]!.layout, "order");
  assert.equal(items[0]!.key, "home:hero/container");
});

test("inserting a new node with a minted key is one nested-new item", () => {
  const before = freezeDesignKeys(buildMaisonV2Payload());
  const edited = clone(before);
  const kids = heroKids(edited);
  const src = kids.find((n) => n.kind === "paragraph")!;
  // A builder duplicate: new id, props copied (including the pin).
  kids.splice(0, 0, { ...clone(src), id: "dup-paragraph-1" } as BuilderNode);
  assert.equal(designKeyIssues(edited).length, 1);
  const after = ensureDesignKeys(before, edited);
  assert.deepEqual(designKeyIssues(after), []);
  const minted = (heroKids(after)[0]!.props as { designKey: string }).designKey;
  assert.match(minted, /^paragraph~[a-z0-9]+$/);
  const items = diff(before, after);
  assert.equal(items.length, 1, JSON.stringify(items));
  assert.equal(items[0]!.layout, "nested-new");
  assert.equal(items[0]!.key, `home:hero/container/${minted}`);
});

test("ensureDesignKeys keeps prev keys by id and is stable", () => {
  const raw = buildMaisonV2Payload();
  const first = ensureDesignKeys(null, raw);
  assert.deepEqual(designKeyIssues(first), []);
  const again = ensureDesignKeys(first, clone(first));
  assert.deepEqual(again, clone(first));
  // With prev = the unpinned design, nodes keep today's computed keys.
  const pinned = ensureDesignKeys(raw, raw);
  assert.deepEqual(stampedKeys(pinned.homeTree), stampedKeys(raw.homeTree));
});

test("ensureDesignKeys: a duplicate claim keeps the prev holder, re-mints the other", () => {
  const before = freezeDesignKeys(buildMaisonV2Payload());
  const edited = clone(before);
  const kids = heroKids(edited);
  const i = kids.findIndex((n) => n.kind === "paragraph");
  const j = kids.findIndex((n, k) => k > i && n.kind === "paragraph");
  kids[j] = withDesignKey(kids[j]!, (kids[i]!.props as { designKey: string }).designKey);
  const after = ensureDesignKeys(before, edited);
  assert.equal((heroKids(after)[i]!.props as { designKey: string }).designKey, "paragraph");
  assert.equal((heroKids(after)[j]!.props as { designKey: string }).designKey, "paragraph#2");
});

test("mintDesignKey is unique within taken keys", () => {
  const node = { id: "n1", kind: "paragraph", props: {} } as unknown as BuilderNode;
  const k1 = mintDesignKey(node, new Set());
  const k2 = mintDesignKey(node, new Set([k1]));
  assert.notEqual(k1, k2);
  assert.match(k2, /^paragraph~/);
});

test("builder validator keeps designKey; buildDesignTrees strips it", () => {
  const f = freezeDesignKeys(buildMaisonV2Payload());
  const check = validateBuilderNodeTree(f.homeTree);
  assert.ok(check.ok);
  if (check.ok) assert.ok(JSON.stringify(check.tree).includes('"designKey"'));
  for (const origin of [undefined, { design: "maison-v2", version: 7 }]) {
    const built = buildDesignTrees(f, fallbackHydrationTokens("V"), 2026, origin);
    assert.ok(built.ok);
    if (built.ok) assert.ok(!JSON.stringify([built.shellTree, built.homeTree]).includes("designKey"));
  }
  const a = buildDesignTrees(buildMaisonV2Payload(), fallbackHydrationTokens("V"), 2026, SRC);
  const b = buildDesignTrees(f, fallbackHydrationTokens("V"), 2026, SRC);
  assert.deepEqual(b, a);
});
