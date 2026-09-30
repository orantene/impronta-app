/**
 * Layout key swaps are ONE atomic choice (plan §1.4). Covers the v17 services
 * two-column swap (`services_catalog` to `services_two_col`) and the 2.1 hero
 * inset swap (`image#2` to `hero_inset_bl`): untouched, edited (mappable),
 * edited (unmappable), removed, removed + critical, undo, re-run, dry-run
 * counts and the talent's What's new grouping. Never two nodes.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../theme-catalog/types";
import { indexTree } from "./classify";
import { diffDesignPayloads, type CandidateItem } from "./diff-payload";
import { siteResultFromReport } from "./manager/dry-run";
import { MOVED_EDITS_NOTE, SWAP_KEPT_NOTE, mergeDesignUpdate } from "./merge";
import { maisonV2At } from "./maison-v2-releases.fixtures";
import { applyLayoutGroups, authoredRelease, withAuthoredNotes } from "./release-notes";
import { reverseMerge } from "./reverse-merge";
import { detectSwaps } from "./swap";
import { groupItems, summarizeReport } from "./talent-update/view";
import type { DesignSide, ReleaseItem } from "./types";

type Props = Record<string, unknown>;

const OLD_SERVICES = "services/services_catalog";
const NEW_SERVICES = "services/services_two_col";
const OLD_INSET = "hero/container#2/image#2";
const NEW_INSET = "hero/container#2/hero_inset_bl";

/** Maison v2 before release 2.1 (the inset top-right, no Before and after, no row gap). */
function maisonV2At14(): DesignPayload {
  const prev = JSON.parse(JSON.stringify(maisonV2At(15))) as DesignPayload;
  prev.homeTree = prev.homeTree.filter((n) => (n.props as Props).slotKey !== "before_after");
  const visit = (nodes: BuilderNode[]) => {
    for (const n of nodes) {
      const p = n.props as Props;
      if (p.slotKey === "hero_inset_bl") {
        delete p.slotKey;
        const style = p.style as Props;
        delete style.left;
        delete style.bottom;
        Object.assign(style, { right: "-26px", top: "38px", width: "34%" });
      }
      visit(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[]);
    }
  };
  visit(prev.homeTree);
  delete prev.tokenDefaults!["layout.menu-row-gap"];
  return prev;
}

interface Case {
  name: string;
  from: number;
  to: number;
  prev: () => DesignPayload;
  next: () => DesignPayload;
  oldKey: string;
  newKey: string;
  /** Kind of the swapped node (count guard: never two). */
  kind: string;
  /** A design-owned edit the new node can carry. */
  mappable: (p: Props) => void;
  mappableCheck: (p: Props) => void;
  /** A design-owned edit the new layout redefines or drops. */
  unmappable: (p: Props) => void;
}

/** True once the payload carries the v17 services swap (r17 and up). */
const HAS_V17 = (() => {
  let found = false;
  const visit = (nodes: ReadonlyArray<BuilderNode>) => {
    for (const n of nodes) {
      if ((n.props as Props).slotKey === "services_two_col") found = true;
      visit(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[]);
    }
  };
  visit(maisonV2At(15).homeTree);
  return found;
})();

const ALL_CASES: Case[] = [
  {
    name: "services two-column",
    from: 16,
    to: 17,
    prev: () => maisonV2At(16),
    next: () => maisonV2At(17),
    oldKey: OLD_SERVICES,
    newKey: NEW_SERVICES,
    kind: "services_catalog",
    mappable: (p) => {
      p.eyebrow = "My menu";
      p.density = "compact";
    },
    mappableCheck: (p) => {
      assert.equal(p.eyebrow, "My menu");
      assert.equal(p.density, "compact");
      assert.equal(p.layout, "cards", "the new layout still lands");
    },
    // The swap itself changes `layout`: her own layout collides with it.
    unmappable: (p) => {
      p.layout = "grid";
    },
  },
  {
    name: "hero inset",
    from: 14,
    to: 15,
    prev: maisonV2At14,
    next: () => maisonV2At(15),
    oldKey: OLD_INSET,
    newKey: NEW_INSET,
    kind: "image",
    mappable: (p) => {
      p.alt = "Nails close-up";
      p.layerLabel = "My inset";
    },
    mappableCheck: (p) => {
      assert.equal(p.alt, "Nails close-up");
      assert.equal(p.layerLabel, "My inset");
      const style = p.style as Props;
      assert.equal(style.left, "-22px", "the new position still lands");
      assert.equal(style.top, undefined, "no old position left behind");
    },
    // She nudged the old top-right position: the bottom-left layout has no `top`.
    unmappable: (p) => {
      (p.style as Props).top = "10px";
    },
  },
];

const CASES: Case[] = ALL_CASES.filter((c) => c.to !== 17 || HAS_V17);

async function sides(c: Case) {
  const { buildDesignTrees, fallbackHydrationTokens } = await import("../server/theme-apply-core");
  const tokens = { ...fallbackHydrationTokens("Valeria"), bio: "Bio", tagline: "Uñas", gallery1: "https://img.example/g1.jpg" };
  const prev = c.prev();
  const next = c.next();
  const b = buildDesignTrees(prev, tokens, 2026, { design: "maison-v2", version: c.from });
  const t = buildDesignTrees(next, tokens, 2026, { design: "maison-v2", version: c.to });
  if (!b.ok || !t.ok) throw new Error("build failed");
  const side = (x: { shellTree: BuilderNode[]; homeTree: BuilderNode[] }, d: DesignPayload): DesignSide => ({
    trees: { shell: x.shellTree, home: x.homeTree },
    tokens: { ...(d.tokenDefaults ?? {}) },
  });
  const raw = diffDesignPayloads("maison-v2", { payload: prev, version: c.from }, { payload: next, version: c.to });
  const layout = raw.filter((i) => i.type === "layout" && i.swap);
  return { base: side(b, prev), theirs: side(t, next), raw, layout };
}

const clone = (s: DesignSide): DesignSide => JSON.parse(JSON.stringify(s)) as DesignSide;
const nodeAt = (tree: BuilderNode[], key: string) => indexTree(tree).byKey.get(key)?.node;
const propsAt = (s: DesignSide, key: string) => nodeAt(s.trees.home!, key)!.props as Props;

function countKind(tree: ReadonlyArray<BuilderNode>, kind: string, keys: ReadonlyArray<string>): number {
  const idx = indexTree(tree);
  return keys.filter((k) => idx.byKey.get(k)?.node.kind === kind).length;
}

for (const c of CASES) {
  test(`${c.name}: the diff detects the swap pair and groups it (no hand-listed keys)`, async () => {
    const { raw, layout } = await sides(c);
    assert.equal(layout.length, 2, "both halves carry the swap");
    for (const i of layout) {
      assert.deepEqual(i.swap, { from: c.oldKey, to: c.newKey });
      assert.equal(i.group, layout[0]!.group);
    }
    // Nothing else is grouped.
    assert.equal(raw.filter((i) => i.group).length, 2);
  });

  test(`${c.name}: untouched old node swaps cleanly`, async () => {
    const { base, theirs, layout } = await sides(c);
    const r = mergeDesignUpdate({ base, ours: clone(base), theirs, items: layout });
    const home = r.trees.home!;
    assert.equal(nodeAt(home, c.oldKey), undefined);
    assert.ok(nodeAt(home, c.newKey));
    assert.equal(countKind(home, c.kind, [c.oldKey, c.newKey]), 1);
    const swap = r.report.applied.filter((e) => e.change === "swap");
    assert.equal(swap.length, 1);
    assert.equal(swap[0]!.reason, undefined);
    assert.equal(r.report.conflicts.length, 0);
    assert.equal(r.report.added.length, 0, "the new node is not a second insert");
    assert.equal(r.report.removed.length, 0, "the old node is not a separate removal");
  });

  test(`${c.name}: edited old node moves her edits to the new node`, async () => {
    const { base, theirs, layout } = await sides(c);
    const ours = clone(base);
    c.mappable(propsAt(ours, c.oldKey));
    // Content she owns travels too.
    propsAt(ours, c.oldKey).i18n = { es: { eyebrow: "Mi menú" } };
    const r = mergeDesignUpdate({ base, ours, theirs, items: layout });
    const home = r.trees.home!;
    assert.equal(nodeAt(home, c.oldKey), undefined, "old node removed");
    assert.equal(countKind(home, c.kind, [c.oldKey, c.newKey]), 1, "never two");
    const moved = propsAt({ trees: r.trees }, c.newKey);
    c.mappableCheck(moved);
    assert.deepEqual(moved.i18n, { es: { eyebrow: "Mi menú" } });
    assert.deepEqual((nodeAt(home, c.newKey) as unknown as Props).i18n, { es: { eyebrow: "Mi menú" } }, "base mirror in step");
    const e = r.report.applied.find((x) => x.change === "swap")!;
    assert.equal(e.reason, "moved_edits");
    assert.equal(e.note, MOVED_EDITS_NOTE);
    assert.equal(e.fromKey, c.oldKey);
    assert.equal(r.report.conflicts.length, 0);
    assert.equal(summarizeReport(r.report).moved, 1);
  });

  test(`${c.name}: unmappable edits keep her version and skip the swap (no duplicate)`, async () => {
    const { base, theirs, layout } = await sides(c);
    const ours = clone(base);
    c.unmappable(propsAt(ours, c.oldKey));
    const r = mergeDesignUpdate({ base, ours, theirs, items: layout });
    const home = r.trees.home!;
    assert.deepEqual(nodeAt(home, c.oldKey), nodeAt(ours.trees.home!, c.oldKey), "her node untouched");
    assert.equal(nodeAt(home, c.newKey), undefined, "new layout not applied");
    assert.equal(countKind(home, c.kind, [c.oldKey, c.newKey]), 1);
    assert.equal(r.report.conflicts.length, 1);
    assert.equal(r.report.conflicts[0]!.note, SWAP_KEPT_NOTE);
    assert.equal(r.report.conflicts[0]!.change, "swap");
    assert.ok(r.report.kept.some((e) => e.change === "swap" && e.key === c.oldKey));
    assert.equal(r.report.applied.filter((e) => e.change === "swap").length, 0);
  });

  test(`${c.name}: old node removed by her stays out; a critical item brings the new one`, async () => {
    const { base, theirs, layout } = await sides(c);
    const ours = clone(base);
    const idx = indexTree(ours.trees.home!);
    const parentKey = idx.byKey.get(c.oldKey)!.parentKey!;
    const parent = idx.byKey.get(parentKey)!.node as { children: BuilderNode[] };
    parent.children = parent.children.filter((n) => (n.props as Props).__origin && (n.props as { __origin: { key: string } }).__origin.key !== c.oldKey);
    const r = mergeDesignUpdate({ base, ours, theirs, items: layout });
    assert.equal(countKind(r.trees.home!, c.kind, [c.oldKey, c.newKey]), 0);
    assert.ok(r.report.kept.some((e) => e.change === "swap" && e.reason === "removed"));
    assert.equal(r.report.added.length, 0);

    const critical: ReleaseItem[] = layout.map((i) => ({ ...i, type: "critical", keys: [c.oldKey, c.newKey] }));
    const forced = mergeDesignUpdate({ base, ours, theirs, items: critical });
    assert.ok(nodeAt(forced.trees.home!, c.newKey), "critical re-adds the new layout");
    assert.equal(countKind(forced.trees.home!, c.kind, [c.oldKey, c.newKey]), 1);
  });

  test(`${c.name}: only one half chosen does nothing (atomic)`, async () => {
    const { base, theirs, layout } = await sides(c);
    for (const half of layout) {
      const r = mergeDesignUpdate({ base, ours: clone(base), theirs, items: [half] });
      assert.ok(nodeAt(r.trees.home!, c.oldKey), "old kept");
      assert.equal(nodeAt(r.trees.home!, c.newKey), undefined, "new not added");
      assert.ok(r.report.pending.some((e) => e.change === "swap"));
    }
  });

  test(`${c.name}: undo restores exactly her pre-apply tree (edited old node included)`, async () => {
    const { base, theirs, layout } = await sides(c);
    for (const edit of [() => undefined, c.mappable]) {
      const ours = clone(base);
      edit(propsAt(ours, c.oldKey));
      const r = mergeDesignUpdate({ base, ours, theirs, items: layout });
      const back = reverseMerge(r.report, { trees: r.trees, tokens: r.tokens });
      assert.deepEqual(back.trees.home, ours.trees.home);
      assert.deepEqual(back.trees.shell, ours.trees.shell);
    }
    // Undo after the conflict case is a no-op on her page.
    const ours = clone(base);
    c.unmappable(propsAt(ours, c.oldKey));
    const r = mergeDesignUpdate({ base, ours, theirs, items: layout });
    assert.deepEqual(reverseMerge(r.report, { trees: r.trees, tokens: r.tokens }).trees.home, ours.trees.home);
  });

  test(`${c.name}: undo keeps a later design edit on the new node`, async () => {
    const { base, theirs, layout } = await sides(c);
    const r = mergeDesignUpdate({ base, ours: clone(base), theirs, items: layout });
    const after = { trees: JSON.parse(JSON.stringify(r.trees)) as DesignSide["trees"] };
    propsAt(after, c.newKey).layerLabel = "Edited after the update";
    const back = reverseMerge(r.report, { trees: after.trees, tokens: r.tokens });
    assert.ok(nodeAt(back.trees.home!, c.newKey), "her later edit stays");
    assert.equal(nodeAt(back.trees.home!, c.oldKey), undefined);
    assert.ok(back.kept.some((e) => e.change === "swap"));
  });

  test(`${c.name}: running the merge again on its output changes nothing`, async () => {
    const { base, theirs, layout } = await sides(c);
    const ours = clone(base);
    c.mappable(propsAt(ours, c.oldKey));
    const once = mergeDesignUpdate({ base, ours, theirs, items: layout });
    const twice = mergeDesignUpdate({ base, ours: { trees: once.trees, tokens: once.tokens }, theirs, items: layout });
    assert.deepEqual(twice.trees, once.trees);
    assert.equal(twice.report.applied.filter((e) => e.change === "swap").length, 0);
    assert.equal(countKind(twice.trees.home!, c.kind, [c.oldKey, c.newKey]), 1);
  });

  test(`${c.name}: dry-run counts per site`, async () => {
    const { base, theirs, layout } = await sides(c);
    const meta = { siteId: "s", profileCode: "p", displayName: "d", isDemo: false, pinnedVersion: c.from, noBase: false };
    const clean = siteResultFromReport(meta, mergeDesignUpdate({ base, ours: clone(base), theirs, items: layout }).report);
    assert.equal(clean.status, "clean");
    assert.deepEqual(
      { applied: clean.counts.applied, added: clean.counts.added, removed: clean.counts.removed, conflicts: clean.counts.conflicts },
      { applied: 1, added: 0, removed: 0, conflicts: 0 },
    );

    const edited = clone(base);
    c.mappable(propsAt(edited, c.oldKey));
    const moved = siteResultFromReport(meta, mergeDesignUpdate({ base, ours: edited, theirs, items: layout }).report);
    assert.equal(moved.status, "clean", "moving her edits is not a conflict");
    assert.equal(moved.counts.applied, 1);

    const clash = clone(base);
    c.unmappable(propsAt(clash, c.oldKey));
    const conflict = siteResultFromReport(meta, mergeDesignUpdate({ base, ours: clash, theirs, items: layout }).report);
    assert.equal(conflict.status, "conflicts");
    assert.deepEqual(
      { applied: conflict.counts.applied, added: conflict.counts.added, kept: conflict.counts.kept, conflicts: conflict.counts.conflicts },
      { applied: 0, added: 0, kept: 1, conflicts: 1 },
    );
    assert.equal(conflict.conflicts[0]!.key, c.oldKey);
  });

  test(`${c.name}: the whole update (no item list) is atomic too`, async () => {
    const { base, theirs } = await sides(c);
    const ours = clone(base);
    c.unmappable(propsAt(ours, c.oldKey));
    const r = mergeDesignUpdate({ base, ours, theirs });
    assert.equal(countKind(r.trees.home!, c.kind, [c.oldKey, c.newKey]), 1);
    assert.equal(nodeAt(r.trees.home!, c.newKey), undefined);
  });
}

test("talent What's new shows a grouped swap as ONE layout item", async () => {
  const all = await Promise.all(CASES.map(async (c) => [await sides(c), c.to] as const));
  for (const [s, v] of all) {
    const items = withAuthoredNotes(s.raw, authoredRelease("maison-v2", v)!);
    const layout = groupItems(items).find((g) => g.group === "layout")!;
    assert.equal(layout.items.length, 1, `v${v}: one row for the swap`);
    assert.equal(layout.items[0]!.itemIds!.length, 2);
    assert.ok(layout.items[0]!.noteEn && layout.items[0]!.noteEs);
  }
});

test("authored layoutKeys override declares a pair detection missed", { skip: !HAS_V17 }, async () => {
  const { base, theirs, raw } = await sides(CASES[0]!);
  const bare: CandidateItem[] = raw.map((i) => {
    const rest = { ...i };
    delete rest.swap;
    delete rest.group;
    return rest;
  });
  assert.ok(bare.every((i) => !i.swap));
  const grouped = applyLayoutGroups(bare, [["layout:home:services/services_catalog:removed", "layout:home:services/services_two_col"]]);
  const layout = grouped.filter((i) => i.type === "layout");
  for (const i of layout) assert.deepEqual(i.swap, { from: OLD_SERVICES, to: NEW_SERVICES });
  // The declared swap drives the engine: her edit moves, never two catalogs.
  const ours = clone(base);
  propsAt(ours, OLD_SERVICES).eyebrow = "Mine";
  const r = mergeDesignUpdate({ base, ours, theirs, items: layout });
  assert.equal(propsAt({ trees: r.trees }, NEW_SERVICES).eyebrow, "Mine");
  assert.equal(nodeAt(r.trees.home!, OLD_SERVICES), undefined);
});

test("detectSwaps pairs by keyed position and kind, and by the only pair of a kind", () => {
  const n = (key: string, kind = "image"): BuilderNode =>
    ({ id: key, kind, props: { __origin: { design: "d", version: 1, key, fp: "x" } } }) as unknown as BuilderNode;
  assert.deepEqual(detectSwaps([n("a"), n("b"), n("c")], [n("a"), n("x"), n("c")]), [{ from: "b", to: "x" }]);
  // Different kind at the same position: not a swap.
  assert.deepEqual(detectSwaps([n("a"), n("b")], [n("a"), n("x", "heading")]), []);
  // Moved position, only pair of its kind: still a swap.
  assert.deepEqual(detectSwaps([n("b"), n("a", "heading")], [n("a", "heading"), n("x")]), [{ from: "b", to: "x" }]);
  // Two removed + two new of a kind at different positions: ambiguous, no pairing.
  assert.deepEqual(
    detectSwaps([n("b"), n("c"), n("h", "heading"), n("k", "heading")], [n("h", "heading"), n("k", "heading"), n("x"), n("y")]),
    [],
  );
});
