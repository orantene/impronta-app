/**
 * builtin-starter-drift.test.ts — the staleness detector for the built-in Site
 * Starter Kit rows.
 *
 * WHAT MAKES THIS TEST WORTH ANYTHING
 * ───────────────────────────────────
 * A drift detector has two ways to be useless and only one way to be right:
 *
 *   • cry wolf — report every row stale forever, so the banner is noise and the
 *     operator learns to ignore it. `bakePageDesignTree` re-mints every node id
 *     on every call, so ANY hash that includes ids reports 11/11 stale for good.
 *   • stay silent — normalise so aggressively that a real content change no
 *     longer moves the hash, which is the same as having no check.
 *
 * So the assertions below are deliberately adversarial in both directions: a
 * re-mint, a jsonb key reorder and a dropped `undefined` must NOT move the hash;
 * a changed prop, a changed child order, a changed node kind and a re-pointed
 * `defaultTabId` MUST.
 *
 * Runs in the `test:builder` lane (globbed from `src/lib/site-admin/builder-core`).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  builtinStarterSlug,
  compareBuiltinStarterDrift,
  driftHeadline,
  hashBuilderTreeContent,
  isBuiltinStarterSlug,
  normalizeBuilderTreeForHash,
  outOfSyncSlugs,
  type DriftComparableRow,
} from "./builtin-starter-hash";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A heading node with a caller-chosen id, so a "re-bake" is easy to simulate. */
function heading(id: string, text: string): BuilderNode {
  return {
    id,
    kind: "heading",
    props: { text, level: 2 },
  } as BuilderNode;
}

/** Tabs + two panels — the `defaultTabId` case, which the bake remaps. */
function tabsTree(ids: [string, string, string], defaultTab: 0 | 1): BuilderNode[] {
  const [tabsId, firstId, secondId] = ids;
  const panel = (id: string, title: string): BuilderNode =>
    ({ id, kind: "tab_panel", props: { title }, children: [] }) as BuilderNode;
  return [
    {
      id: tabsId,
      kind: "tabs",
      props: { defaultTabId: defaultTab === 0 ? firstId : secondId },
      children: [panel(firstId, "One"), panel(secondId, "Two")],
    } as BuilderNode,
  ];
}

const BASE_TREE: BuilderNode[] = [
  {
    id: "sec-a",
    kind: "container",
    props: { label: "Hero", layout: "stack" },
    children: [heading("h-a", "Sell what you do"), heading("h-b", "Not what you ship")],
  } as BuilderNode,
];

/** The SAME design after a re-bake: identical content, all-new ids. */
const REBAKED_TREE: BuilderNode[] = [
  {
    id: "sec-z9",
    kind: "container",
    props: { label: "Hero", layout: "stack" },
    children: [heading("h-q1", "Sell what you do"), heading("h-q2", "Not what you ship")],
  } as BuilderNode,
];

// ── The hash ─────────────────────────────────────────────────────────────────

describe("hashBuilderTreeContent — what it must ignore", () => {
  it("ignores node ids, so a re-bake of the same design is not drift", () => {
    // This is the assertion that keeps the banner from reading 11/11 stale on
    // day one: bakePageDesignTree mints fresh ids on every single call.
    assert.equal(
      hashBuilderTreeContent(REBAKED_TREE),
      hashBuilderTreeContent(BASE_TREE),
    );
  });

  it("ignores prop key ORDER, which a jsonb round-trip is free to change", () => {
    const a = [{ id: "n", kind: "heading", props: { text: "Hi", level: 2 } }];
    const b = [{ id: "n", kind: "heading", props: { level: 2, text: "Hi" } }];
    assert.equal(
      hashBuilderTreeContent(b as BuilderNode[]),
      hashBuilderTreeContent(a as BuilderNode[]),
    );
  });

  it("ignores `undefined` props, which never survive the trip into jsonb", () => {
    const withUndefined = [
      { id: "n", kind: "heading", props: { text: "Hi", level: 2, href: undefined } },
    ];
    const without = [{ id: "n", kind: "heading", props: { text: "Hi", level: 2 } }];
    assert.equal(
      hashBuilderTreeContent(withUndefined as BuilderNode[]),
      hashBuilderTreeContent(without as BuilderNode[]),
    );
  });

  it("ignores id churn in `defaultTabId` when it still points at the same panel", () => {
    assert.equal(
      hashBuilderTreeContent(tabsTree(["t-9", "p-9", "q-9"], 0)),
      hashBuilderTreeContent(tabsTree(["t-1", "p-1", "q-1"], 0)),
    );
  });
});

describe("hashBuilderTreeContent — what it must catch", () => {
  it("catches a changed prop value", () => {
    const edited = structuredClone(BASE_TREE) as BuilderNode[];
    (edited[0] as { children: BuilderNode[] }).children[0] = heading(
      "h-a",
      "Sell what you SHIP",
    );
    assert.notEqual(
      hashBuilderTreeContent(edited),
      hashBuilderTreeContent(BASE_TREE),
    );
  });

  it("catches a changed node kind", () => {
    const edited = [
      { ...(BASE_TREE[0] as unknown as Record<string, unknown>), kind: "section" },
    ];
    assert.notEqual(
      hashBuilderTreeContent(edited as unknown as BuilderNode[]),
      hashBuilderTreeContent(BASE_TREE),
    );
  });

  it("catches reordered children", () => {
    const edited = structuredClone(BASE_TREE) as BuilderNode[];
    const kids = (edited[0] as { children: BuilderNode[] }).children;
    (edited[0] as { children: BuilderNode[] }).children = [kids[1], kids[0]];
    assert.notEqual(
      hashBuilderTreeContent(edited),
      hashBuilderTreeContent(BASE_TREE),
    );
  });

  it("catches a re-POINTED `defaultTabId` — the signal the path rewrite keeps", () => {
    // Same ids-are-random shape, but the default now opens the OTHER panel.
    // If the normaliser had simply dropped the prop, this would pass silently.
    assert.notEqual(
      hashBuilderTreeContent(tabsTree(["t-1", "p-1", "q-1"], 1)),
      hashBuilderTreeContent(tabsTree(["t-1", "p-1", "q-1"], 0)),
    );
  });

  it("catches an added child (a section appended to the design)", () => {
    const edited = structuredClone(BASE_TREE) as BuilderNode[];
    (edited[0] as { children: BuilderNode[] }).children.push(
      heading("h-new", "Extra"),
    );
    assert.notEqual(
      hashBuilderTreeContent(edited),
      hashBuilderTreeContent(BASE_TREE),
    );
  });
});

describe("normalizeBuilderTreeForHash", () => {
  it("emits no node ids anywhere in the normalised shape", () => {
    const json = JSON.stringify(normalizeBuilderTreeForHash(BASE_TREE));
    for (const id of ["sec-a", "h-a", "h-b"]) {
      assert.equal(json.includes(id), false, `normalised tree leaked id ${id}`);
    }
  });

  it("rewrites `defaultTabId` to a structural path, not a raw id", () => {
    const json = JSON.stringify(
      normalizeBuilderTreeForHash(tabsTree(["t-1", "p-1", "q-1"], 1)),
    );
    assert.equal(json.includes("q-1"), false, "raw panel id leaked");
    assert.equal(json.includes("#0.1"), true, "structural path missing");
  });
});

// ── The report ───────────────────────────────────────────────────────────────

const IN_SYNC_HASH = hashBuilderTreeContent(BASE_TREE);

function row(over: Partial<DriftComparableRow>): DriftComparableRow {
  return {
    id: "row-1",
    slug: builtinStarterSlug("studio-one"),
    status: "published",
    builder_tree: BASE_TREE,
    ...over,
  };
}

describe("compareBuiltinStarterDrift", () => {
  const designs = [
    { designId: "studio-one", label: "Studio One", hash: IN_SYNC_HASH },
  ];

  it("reports in_sync when the published tree still matches the code design", () => {
    const report = compareBuiltinStarterDrift(designs, [row({})]);
    assert.equal(report.entries[0].state, "in_sync");
    assert.equal(report.outOfSyncCount, 0);
    assert.deepEqual(report.staleTemplateIds, []);
    assert.deepEqual(outOfSyncSlugs(report), []);
  });

  it("reports stale — with the row id — when the trees differ", () => {
    const drifted = structuredClone(BASE_TREE) as BuilderNode[];
    (drifted[0] as { children: BuilderNode[] }).children[0] = heading(
      "h-a",
      "Changed in code",
    );
    const report = compareBuiltinStarterDrift(designs, [
      row({ builder_tree: drifted }),
    ]);
    assert.equal(report.entries[0].state, "stale");
    assert.equal(report.outOfSyncCount, 1);
    // The Default surfaces panel keys its warning on exactly this list.
    assert.deepEqual(report.staleTemplateIds, ["row-1"]);
    assert.deepEqual(outOfSyncSlugs(report), ["builtin-studio-one"]);
  });

  it("reports missing when sync has never imported the design", () => {
    const report = compareBuiltinStarterDrift(designs, []);
    assert.equal(report.entries[0].state, "missing");
    assert.equal(report.entries[0].templateId, null);
    // Not stale: there is no published row shipping old content.
    assert.deepEqual(report.staleTemplateIds, []);
  });

  it("reports unpublished separately, and never as stale", () => {
    // A draft row is not serving anyone, so it must not raise the "every tenant
    // is getting old content" alarm — but it is still out of sync.
    const report = compareBuiltinStarterDrift(designs, [row({ status: "draft" })]);
    assert.equal(report.entries[0].state, "unpublished");
    assert.equal(report.outOfSyncCount, 1);
    assert.deepEqual(report.staleTemplateIds, []);
  });

  it("matches rows by the deterministic slug, not by title or position", () => {
    const report = compareBuiltinStarterDrift(designs, [
      row({ id: "decoy", slug: "some-other-template" }),
      row({ id: "real" }),
    ]);
    assert.equal(report.entries[0].templateId, "real");
    assert.equal(report.entries[0].state, "in_sync");
  });
});

describe("slug convention", () => {
  it("round-trips through isBuiltinStarterSlug", () => {
    assert.equal(isBuiltinStarterSlug(builtinStarterSlug("x")), true);
    assert.equal(isBuiltinStarterSlug("platform-default-storefront"), false);
  });
});

describe("driftHeadline", () => {
  const designs = [
    { designId: "a", label: "A", hash: "deadbeefdeadbeef" },
    { designId: "b", label: "B", hash: "deadbeefdeadbeef" },
  ];

  it("says the CONSEQUENCE, not just a count", () => {
    const report = compareBuiltinStarterDrift(designs, []);
    const line = driftHeadline(report);
    assert.match(line, /2 built-in starters/);
    // The whole point of the banner: a count alone taught nobody anything.
    assert.match(line, /ships older content/);
  });

  it("uses singular grammar for one row", () => {
    const report = compareBuiltinStarterDrift([designs[0]], []);
    assert.match(driftHeadline(report), /1 built-in starter is out of date/);
  });

  it("is reassuring, not alarming, when everything matches", () => {
    const report = compareBuiltinStarterDrift([], []);
    assert.equal(driftHeadline(report), "Built-in starters match the code designs.");
  });
});
