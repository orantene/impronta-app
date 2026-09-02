/**
 * builder-2027-native-data-resolvers.test.ts — BUILDER 2027 · P2B.
 *
 * Phase 2A shipped twelve native kinds. Four of them read live data that
 * NOTHING provided: `renderNativeLiveBlock` was passed by zero callers and no
 * writer populated `directoryProfiles` or `headerWidgets`. The blocks rendered
 * their fallbacks and every test stayed green, because a fallback IS a correct
 * render — which is exactly how this repo has shipped six dead features.
 *
 * So this file tests the two halves separately and deliberately:
 *
 *   - RENDER CONTRACT (here): given data, the block paints it; given none, the
 *     block paints a WORKING fallback (a real GET form, a real link) and never
 *     a hole. Pure, no server imports, runs under `test:builder-node-bindings`.
 *   - WIRING (`builder-2027-native-data-wiring.static.test.ts`): the real call
 *     sites actually pass the real values. A render test alone can never catch
 *     "nobody calls this", and that is the bug that was there.
 *
 * Runner: `tsx --test`, reached by `test:builder-node-bindings` (every
 * `*.test.ts` under this directory), so this file cannot be orphaned from CI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  collectNativeDataBlockNeeds,
  nativeDirectoryScopeSignature,
} from "./native-data-block-needs";
import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function directoryNode(
  id: string,
  props: Partial<Extract<BuilderNode, { kind: "directory" }>["props"]> = {},
): BuilderNode {
  return { id, kind: "directory", props } as BuilderNode;
}

function card(profileCode: string, displayName: string) {
  return {
    id: `id-${profileCode}`,
    profileCode,
    slugPart: null,
    displayName,
    primaryTalentTypeLabel: "Chef",
    locationLabel: "Tulum",
    isFeatured: false,
    thumbnailUrl: null,
  };
}

/**
 * `includeRendererStyles: false` is not incidental. The injected stylesheet
 * legitimately contains every class name in the renderer, so an assertion that
 * a class is ABSENT from the markup passes or fails on the stylesheet rather
 * than on the node — the same trap `mobile-safe-width.static.test.ts` documents.
 */
function renderHtml(
  nodes: ReadonlyArray<BuilderNode>,
  options: Parameters<typeof renderBuilderNodes>[1],
): string {
  return renderToStaticMarkup(
    createElement(
      "div",
      null,
      renderBuilderNodes(nodes, {
        includeRendererStyles: false,
        ...options,
      }) as unknown as ReactNode,
    ),
  );
}

// ---------------------------------------------------------------------------
// The pure walk — what the server caller is told to fetch
// ---------------------------------------------------------------------------

test("collectNativeDataBlockNeeds reports every directory node, in document order", () => {
  const tree: BuilderNode[] = [
    {
      id: "wrap",
      kind: "container",
      props: {},
      children: [
        directoryNode("dir-chefs", {
          scope: "by_talent_type",
          talentTypeKeys: ["chef"],
          pageSize: 12,
        }),
        directoryNode("dir-all"),
      ],
    } as BuilderNode,
  ];

  const needs = collectNativeDataBlockNeeds(tree);
  assert.deepEqual(
    needs.directories.map((d) => d.nodeId),
    ["dir-chefs", "dir-all"],
    "a nested directory node must still be seen — the walk recurses",
  );
  assert.equal(needs.directories[0]!.scope, "by_talent_type");
  assert.deepEqual(needs.directories[0]!.talentTypeKeys, ["chef"]);
  assert.equal(needs.directories[0]!.pageSize, 12);
  assert.equal(needs.directories[1]!.scope, "all");
});

test("collectNativeDataBlockNeeds clamps pageSize into the range the grid can render", () => {
  const needs = collectNativeDataBlockNeeds([
    directoryNode("a", { pageSize: 5000 }),
    directoryNode("b", { pageSize: 1 }),
  ]);
  assert.equal(needs.directories[0]!.pageSize, 60);
  assert.equal(needs.directories[1]!.pageSize, 6);
});

test("collectNativeDataBlockNeeds drops blank scope keys rather than querying for them", () => {
  const needs = collectNativeDataBlockNeeds([
    directoryNode("a", {
      scope: "manual",
      manualProfileCodes: ["  ", "TAL-1", ""],
    }),
  ]);
  assert.deepEqual(needs.directories[0]!.manualProfileCodes, ["TAL-1"]);
});

test("collectNativeDataBlockNeeds flags the two session-dependent header widgets only", () => {
  const none = collectNativeDataBlockNeeds([directoryNode("d")]);
  assert.deepEqual(none.headerWidgets, { account: false, inquiry: false });

  const both = collectNativeDataBlockNeeds([
    { id: "s", kind: "header_search", props: {} } as BuilderNode,
    { id: "l", kind: "header_language", props: {} } as BuilderNode,
    { id: "a", kind: "header_account", props: {} } as BuilderNode,
    { id: "i", kind: "header_inquiry", props: {} } as BuilderNode,
  ]);
  assert.deepEqual(
    both.headerWidgets,
    { account: true, inquiry: true },
    "header_search and header_language are fully native and need no session read",
  );
});

test("nativeDirectoryScopeSignature separates differently-scoped bands and unites identical ones", () => {
  const chefs = collectNativeDataBlockNeeds([
    directoryNode("a", { scope: "by_talent_type", talentTypeKeys: ["chef"] }),
  ]).directories[0]!;
  const chefsAgain = collectNativeDataBlockNeeds([
    directoryNode("b", {
      scope: "by_talent_type",
      talentTypeKeys: ["chef"],
      // Presentation-only differences must NOT split the fetch.
      columnsDesktop: 2,
      density: "compact",
    }),
  ]).directories[0]!;
  const everyone = collectNativeDataBlockNeeds([directoryNode("c")])
    .directories[0]!;

  assert.equal(
    nativeDirectoryScopeSignature(chefs),
    nativeDirectoryScopeSignature(chefsAgain),
  );
  assert.notEqual(
    nativeDirectoryScopeSignature(chefs),
    nativeDirectoryScopeSignature(everyone),
    "an 'Our Chefs' band and an 'Everyone' band must never share one card list",
  );
});

// ---------------------------------------------------------------------------
// The render contract — with data, and without
// ---------------------------------------------------------------------------

test("directory renders per-node cards, so two bands on a page cannot swap people", () => {
  const html = renderHtml(
    [directoryNode("dir-chefs"), directoryNode("dir-all")],
    {
      dataSources: {
        directoryProfilesByNodeId: {
          "dir-chefs": [card("CHEF-1", "Ana Chef")],
          "dir-all": [card("MOD-1", "Bea Model")],
        },
      },
    },
  );
  const chefsBand = html.split('data-builder-node-id="dir-all"')[0]!;
  assert.ok(chefsBand.includes("Ana Chef"));
  assert.ok(
    !chefsBand.includes("Bea Model"),
    "the chefs band must not paint the other band's roster",
  );
  assert.ok(html.includes("Bea Model"));
});

test("directory falls back to the whole-tree array when no per-node entry exists", () => {
  const html = renderHtml([directoryNode("dir-1")], {
    dataSources: { directoryProfiles: [card("TAL-9", "Cleo Legacy")] },
  });
  assert.ok(html.includes("Cleo Legacy"));
});

test("a per-node entry WINS over the whole-tree array for that node", () => {
  const html = renderHtml([directoryNode("dir-1")], {
    dataSources: {
      directoryProfiles: [card("TAL-9", "Shared Fallback")],
      directoryProfilesByNodeId: { "dir-1": [card("TAL-1", "Scoped Card")] },
    },
  });
  assert.ok(html.includes("Scoped Card"));
  assert.ok(!html.includes("Shared Fallback"));
});

test("a resolver that returns NOTHING still renders a working block, never a hole", () => {
  // This is the degradation contract: a failed fetch yields no entry for the
  // node, and the node must still be a usable directory.
  const html = renderHtml([directoryNode("dir-1")], {
    dataSources: { directoryProfilesByNodeId: {} },
  });
  assert.ok(
    html.includes('data-builder-node-kind="directory"'),
    "the band must still be in the document",
  );
  assert.ok(
    html.includes('method="get"') && html.includes('name="q"'),
    "the fallback's search form must be a REAL GET that submits",
  );
  assert.ok(
    html.includes("No matches yet"),
    "an empty result needs an empty STATE, not a blank band",
  );
});

test("an EMPTY per-node entry renders the empty state, not the shared array", () => {
  // A node scoped to keys that resolved to nothing gets `[]` — deliberately
  // distinct from "absent". Falling through to the shared array here would
  // paint an unscoped roster under a scoped heading, which is the exact bug
  // the by-node map exists to prevent.
  const html = renderHtml([directoryNode("dir-1")], {
    dataSources: {
      directoryProfiles: [card("TAL-9", "Unscoped Person")],
      directoryProfilesByNodeId: { "dir-1": [] },
    },
  });
  assert.ok(!html.includes("Unscoped Person"));
  assert.ok(html.includes("No matches yet"));
});

test("directory delegates to the injected live engine and marks itself live", () => {
  const seen: string[] = [];
  const html = renderHtml([directoryNode("dir-1")], {
    renderNativeLiveBlock: (node) => {
      seen.push(node.id);
      return createElement("p", null, "LIVE ENGINE");
    },
    dataSources: { directoryProfilesByNodeId: { "dir-1": [card("X", "Static Card")] } },
  });
  assert.deepEqual(seen, ["dir-1"], "the engine is called with the node itself");
  assert.ok(html.includes("LIVE ENGINE"));
  assert.ok(html.includes('data-bn-directory-mode="live"'));
  assert.ok(
    !html.includes("Static Card"),
    "the live engine replaces the fallback grid rather than rendering beside it",
  );
});

test("a live engine that opts OUT (returns null) hands the node back its fallback", () => {
  const html = renderHtml([directoryNode("dir-1")], {
    renderNativeLiveBlock: () => null,
    dataSources: { directoryProfilesByNodeId: { "dir-1": [card("X", "Static Card")] } },
  });
  assert.ok(html.includes("Static Card"));
  assert.ok(!html.includes('data-bn-directory-mode="live"'));
});

// ---------------------------------------------------------------------------
// Header widgets
// ---------------------------------------------------------------------------

test("header_account renders the resolved signed-in destination", () => {
  const html = renderHtml(
    [{ id: "acct", kind: "header_account", props: { showLabel: true } } as BuilderNode],
    {
      dataSources: {
        headerWidgets: {
          account: { signedIn: true, href: "/talent", displayName: "Ana" },
        },
      },
    },
  );
  assert.ok(html.includes('href="/talent"'));
  assert.ok(html.includes("Ana"));
});

test("header_account with NO resolved session is still a real sign-in link", () => {
  const html = renderHtml(
    [{ id: "acct", kind: "header_account", props: { showLabel: true } } as BuilderNode],
    { dataSources: {} },
  );
  assert.ok(html.includes('href="/login"'), "never a dead chip");
  assert.ok(html.includes("Sign in"));
});

test("header_inquiry shows the resolved count and leads to the resolved page", () => {
  const html = renderHtml(
    [{ id: "inq", kind: "header_inquiry", props: {} } as BuilderNode],
    {
      dataSources: {
        headerWidgets: { inquiry: { count: 3, href: "/directory" } },
      },
    },
  );
  assert.ok(html.includes('href="/directory"'));
  assert.ok(html.includes(">3<"));
});

test("header_inquiry hides the badge at zero rather than rendering an empty one", () => {
  const html = renderHtml(
    [{ id: "inq", kind: "header_inquiry", props: {} } as BuilderNode],
    { dataSources: { headerWidgets: { inquiry: { count: 0, href: "/directory" } } } },
  );
  assert.ok(!html.includes("header-widget-badge"));
});

test("an operator's own href still outranks the resolved one", () => {
  const html = renderHtml(
    [
      {
        id: "inq",
        kind: "header_inquiry",
        props: { href: "/contact" },
      } as BuilderNode,
    ],
    { dataSources: { headerWidgets: { inquiry: { count: 1, href: "/directory" } } } },
  );
  assert.ok(html.includes('href="/contact"'));
});
