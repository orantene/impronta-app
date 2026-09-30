/**
 * Theme releases: payload diff → release items, and stamping pre-stamp sites.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildMaisonV2Payload } from "../theme-catalog/collection/designs";
import type { DesignPayload } from "../theme-catalog/types";
import { classifyTree } from "./classify";
import { diffDesignPayloads } from "./diff-payload";
import { mergeDesignUpdate } from "./merge";
import { UNKNOWN_FP, readOrigin, stampDesignOrigin, stripDesignOrigin } from "./origin";
import { stampFromBase } from "./stamp-existing";
import { addNode, built, edit, plain, prop, rawDesign, type Opts } from "./test-fixtures";

const payload = (o: Opts = {}, tokenDefaults?: Record<string, string>): DesignPayload => {
  const raw = rawDesign(o);
  return { shellTree: raw.shell, homeTree: raw.home, ...(tokenDefaults ? { tokenDefaults } : {}) };
};
const diff = (a: DesignPayload, b: DesignPayload, notes: Array<{ en: string; es: string }> = []) =>
  diffDesignPayloads("maison-v2", { payload: a, version: 1 }, { payload: b, version: 2 }, notes);

test("diff: identical payloads (and Maison v2 against itself) give no items", () => {
  assert.deepEqual(diff(payload(), payload()), []);
  assert.deepEqual(diff(buildMaisonV2Payload(), buildMaisonV2Payload()), []);
});

test("diff: a variant change is a variant-default item with its paths", () => {
  const items = diff(payload(), payload({ heroVariant: "stacked", heroPadding: "xl" }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.type, "variant-default");
  assert.equal(items[0]!.key, "home:hero");
  assert.deepEqual(items[0]!.paths, ["style.paddingY", "variant"]);
});

test("diff: content token changes are not design items", () => {
  const a = payload();
  const b = payload();
  const hero = b.homeTree[0] as unknown as { children: Array<{ props: Record<string, unknown> }> };
  hero.children[1]!.props.text = "{{disciplinesLine}}";
  assert.deepEqual(diff(a, b), []);
});

test("diff: a new top-level section is a new-block; a new child is layout", () => {
  const items = diff(payload(), payload({ withGallery: true, extraHeroChild: true }));
  const types = items.map((i) => `${i.type}:${i.key}`);
  assert.ok(types.includes("new-block:home:gallery"));
  assert.ok(types.includes("layout:home:hero/paragraph#2"));
});

test("diff: removed, kind swap and order are layout items", () => {
  const items = diff(payload(), payload({ dropFaq: true, aboutKind: "section", order: ["hero", "about", "menu"] }));
  const details = items.filter((i) => i.type === "layout").map((i) => i.layout).sort();
  assert.deepEqual(details, ["kind", "order", "removed", "removed"]);
});

test("diff: token defaults and code notes become items", () => {
  const items = diff(payload({}, { "space.row": "12px" }), payload({}, { "space.row": "16px", "shadow.card": "soft" }), [
    { en: "Price line wraps on phones", es: "La línea de precio se ajusta en el teléfono" },
  ]);
  assert.deepEqual(items.filter((i) => i.type === "token-default").map((i) => i.key), ["shadow.card", "space.row"]);
  assert.equal(items.find((i) => i.type === "code")?.note?.es, "La línea de precio se ajusta en el teléfono");
});

test("diff items drive the merge: only the chosen block is added", () => {
  const items = diff(payload(), payload({ withGallery: true, heroVariant: "stacked" }));
  const chosen = items.filter((i) => i.type === "new-block");
  const r = mergeDesignUpdate({ base: built(1), ours: built(1), theirs: built(2, { withGallery: true, heroVariant: "stacked" }), items: chosen });
  assert.ok(r.report.added.some((e) => e.key === "gallery"));
  assert.equal(prop({ trees: r.trees }, "home", "hero", "variant"), "split");
});

// ── backfill: stamping sites applied before stamps existed ──────────────────

const unstamped = (o: Opts = {}) => {
  const side = built(1, o);
  return { shell: stripDesignOrigin(side.trees.shell!), home: stripDesignOrigin(side.trees.home!) };
};

test("backfill: an untouched pre-stamp site matches every key and reads untouched", () => {
  const { tree, stats } = stampFromBase(unstamped().home, built(1).trees.home!);
  assert.equal(stats.unmatched, 0);
  assert.equal(stats.missing.length, 0);
  assert.equal(classifyTree(tree).counts.edited, 0);
});

test("backfill: her edits show as edited against the base fingerprints", () => {
  const stamped = stampFromBase(unstamped().home, built(1).trees.home!).tree;
  const edited = edit({ trees: { home: stamped } }, "home", "hero", "variant", "overlay");
  assert.equal(classifyTree(edited.trees.home!).states.get("hero"), "edited");
});

test("backfill: talent-added nodes stay unstamped; removed keys are listed", () => {
  const base = built(1).trees.home!;
  let site: BuilderNode[] = unstamped().home.filter((_, i) => i !== 3);
  site = [...site, plain("container", { layout: "row" })];
  const { tree, stats } = stampFromBase(site, base);
  assert.deepEqual(stats.missing.sort(), ["faq", "faq/faq"]);
  assert.equal(stats.unmatched, 1);
  assert.equal(readOrigin(tree.at(-1)!), undefined);
});

test("backfill: same-kind siblings a demo style reordered still match by layer label", () => {
  const make = (swap: boolean): BuilderNode[] => {
    const copy = { id: "c", kind: "container", props: { layerLabel: "Hero copy", layout: "stack" }, children: [
      { id: "h", kind: "heading", props: { text: "{{displayName}}", level: 1 } },
    ] };
    const media = { id: "m", kind: "container", props: { layerLabel: "Hero media", layout: "stack" }, children: [
      { id: "i", kind: "image", props: { src: "{{headshotUrl}}", layerLabel: "Hero photo" } },
    ] };
    return [{ id: "s", kind: "container", props: { slotKey: "hero", layout: "row" }, children: swap ? [media, copy] : [copy, media] }] as unknown as BuilderNode[];
  };
  const base = stampDesignOrigin(make(false), { design: "maison-v2", version: 1 });
  const { tree, stats } = stampFromBase(make(true), base);
  assert.equal(stats.unmatched, 0);
  assert.equal(stats.missing.length, 0);
  const kids = (tree[0] as unknown as { children: BuilderNode[] }).children;
  assert.equal(readOrigin(kids[0]!)?.key, "hero/container#2");
  assert.equal(readOrigin((kids[0] as unknown as { children: BuilderNode[] }).children[0]!)?.key, "hero/container#2/image");
  assert.equal(classifyTree(tree).counts.edited, 0);
});

test("backfill: an unknown base version stamps fp '?' (everything reads edited)", () => {
  const { tree } = stampFromBase(unstamped().home, built(1).trees.home!, { unknownBase: true });
  assert.equal(readOrigin(tree[0]!)?.fp, UNKNOWN_FP);
  assert.equal(classifyTree(tree).counts.untouched, 0);
});

test("backfill: already-stamped nodes are left alone (re-run is a no-op)", () => {
  const once = stampFromBase(unstamped().home, built(1).trees.home!).tree;
  const twice = stampFromBase(once, built(1).trees.home!);
  assert.equal(twice.stats.matched, 0);
  assert.deepEqual(twice.tree, once);
});

test("backfill then merge: an unknown-base site only receives new blocks", () => {
  const stamped = stampFromBase(unstamped().home, built(1).trees.home!, { unknownBase: true }).tree;
  const withAdded = addNode({ trees: { home: stamped, shell: built(1).trees.shell! } }, "home", null, plain("container", { layout: "row" }));
  const r = mergeDesignUpdate({ base: built(1), ours: withAdded, theirs: built(2, { heroVariant: "stacked", withGallery: true }) });
  assert.equal(prop({ trees: r.trees }, "home", "hero", "variant"), "split");
  assert.ok(r.report.added.some((e) => e.key === "gallery"));
});

// ── the real Maison v2 payload end to end ───────────────────────────────────

test("Maison v2: a services_catalog default change diffs, merges and undoes cleanly", async () => {
  const { buildDesignTrees, fallbackHydrationTokens } = await import("../server/theme-apply-core");
  const { reverseMerge } = await import("./reverse-merge");
  const v1 = buildMaisonV2Payload();
  const v2 = buildMaisonV2Payload();
  const walk = (nodes: BuilderNode[]): BuilderNode | undefined => {
    for (const n of nodes) {
      if (n.kind === "services_catalog") return n;
      const hit = walk(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[]);
      if (hit) return hit;
    }
    return undefined;
  };
  (walk(v2.homeTree)!.props as Record<string, unknown>).density = "compact";
  const items = diffDesignPayloads("maison-v2", { payload: v1, version: 1 }, { payload: v2, version: 2 });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.type, "variant-default");

  const tokens = { ...fallbackHydrationTokens("Valeria"), bio: "Bio", tagline: "Uñas" };
  const b = buildDesignTrees(v1, tokens, 2026, { design: "maison-v2", version: 1 });
  const t = buildDesignTrees(v2, tokens, 2026, { design: "maison-v2", version: 2 });
  assert.ok(b.ok && t.ok);
  if (!b.ok || !t.ok) return;
  const side = (x: { shellTree: BuilderNode[]; homeTree: BuilderNode[] }) => ({
    trees: { shell: x.shellTree, home: x.homeTree },
  });
  const r = mergeDesignUpdate({ base: side(b), ours: side(b), theirs: side(t), items });
  assert.equal(r.report.applied.length, 1);
  assert.equal((walk(r.trees.home!)!.props as Record<string, unknown>).density, "compact");
  const back = reverseMerge(r.report, { trees: r.trees, tokens: r.tokens });
  assert.deepEqual(back.trees.home, b.homeTree);
});
