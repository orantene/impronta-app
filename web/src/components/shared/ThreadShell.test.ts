/**
 * CHARACTERIZATION (GOLDEN) SPEC — shared <ThreadShell> primitive.
 * Phase 2 zero-behaviour-change net for the slot extension that lets the
 * client + admin consoles adopt without a pixel/affordance regression
 * (remediation-plan-2026-05-19 §3 + §4).
 *
 * Two guarantees, both proven here against the REAL component (no mocked
 * internals), rendered with react-dom/server:
 *
 *  A. BACK-COMPAT — with no `scaffold`/`renderRow`/`emptyListSlot`, the
 *     two original return paths (list-only rail; built-in thread surface)
 *     render exactly as before the extension. The landed talent-inbox
 *     adoption only ever hits these, so an unchanged-green run is the
 *     proof it is untouched.
 *  B. SLOTTED SEAM — with `scaffold` supplied, the shell composes the
 *     three regions in the documented order and passes the adapter's
 *     bespoke nodes through verbatim (no built-in chrome leaks in), so
 *     the dense console stays byte-identical.
 *
 * Run: npx tsx --test src/components/shared/ThreadShell.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ThreadShell,
  type ThreadShellListItem,
  type ThreadShellProps,
  type ThreadShellScaffoldRegions,
  type ThreadShellRowContext,
} from "./ThreadShell";

function render(props: ThreadShellProps): string {
  return renderToStaticMarkup(h(Fragment, null, h(ThreadShell, props)));
}

const ITEMS: ThreadShellListItem[] = [
  { id: "i1", title: "Alpha", ctaLabel: "Open thread" },
  { id: "i2", title: "Bravo", ctaLabel: "Open thread" },
];

// ── A. BACK-COMPAT — no new props → original behaviour ──────────────────

describe("ThreadShell back-compat (scaffold absent)", () => {
  it("list-only (activeId null, no messages/details) → built-in rail, no scaffold leak", () => {
    const html = render({
      role: "talent",
      inquiries: ITEMS,
      activeId: null,
      actions: {},
    });
    // Built-in ListRow chrome present: titles + the default/explicit CTA.
    assert.match(html, />Alpha</);
    assert.match(html, />Bravo</);
    assert.match(html, />Open thread<\/button>/);
    // No thread region (no detail card) on a list-only surface.
    assert.doesNotMatch(html, /SENTINEL-/);
  });

  it("empty + list-only → built-in 'Nothing in this view.' card (unchanged)", () => {
    const html = render({ role: "talent", inquiries: [], activeId: null, actions: {} });
    assert.match(html, /Nothing in this view\./);
  });

  it("built-in thread surface (activeId + details, no scaffold) renders details + rail", () => {
    const html = render({
      role: "client",
      inquiries: ITEMS,
      activeId: "i1",
      details: h("p", null, "DETAIL-BODY"),
      actions: {},
    });
    assert.match(html, /DETAIL-BODY/);
    assert.match(html, />Alpha</); // list rail still rendered beside detail
  });
});

// ── B. SLOTTED SEAM — scaffold supplied → composition + pass-through ─────

describe("ThreadShell slotted scaffold path", () => {
  function scaffold(regions: ThreadShellScaffoldRegions) {
    return h(
      "main",
      { "data-scaffold": "client" },
      h("header", null, regions.listHeader),
      h("section", { "data-list": "" }, regions.list),
      h("aside", { "data-thread": "" }, regions.thread),
    );
  }

  it("composes listHeader + list + thread; bespoke renderRow replaces built-in row", () => {
    const seen: ThreadShellRowContext[] = [];
    const html = render({
      role: "client",
      inquiries: ITEMS,
      activeId: "i2",
      actions: { onSelectInquiry: () => {} },
      listHeaderSlot: h("div", null, "SENTINEL-HEADER"),
      details: h("div", null, "SENTINEL-THREAD"),
      renderRow: (item, ctx) => {
        seen.push(ctx);
        return h(
          "article",
          { "data-row": item.id, "data-active": String(ctx.active), "data-idx": ctx.index },
          item.title,
        );
      },
      scaffold,
    });

    // Adapter wrapper owns the outer markup.
    assert.match(html, /<main data-scaffold="client">/);
    // Region order: header → list → thread.
    assert.match(
      html,
      /<header><div>SENTINEL-HEADER<\/div><\/header><section data-list=""><article data-row="i1"/,
    );
    assert.match(html, /<aside data-thread=""><div>SENTINEL-THREAD<\/div><\/aside>/);
    // Bespoke rows in input order; active flag only on the activeId row.
    assert.match(html, /data-row="i1" data-active="false" data-idx="0">Alpha</);
    assert.match(html, /data-row="i2" data-active="true" data-idx="1">Bravo</);
    // Built-in ListRow chrome must NOT leak in (no default "Open" button).
    assert.doesNotMatch(html, /<button[^>]*>Open<\/button>/);
    // ctx handed to the adapter for both rows, in order.
    assert.deepEqual(
      seen.map((c) => [c.index, c.active, c.isLast]),
      [
        [0, false, false],
        [1, true, true],
      ],
    );
  });

  it("emptyListSlot replaces the built-in empty card when inquiries is []", () => {
    const html = render({
      role: "client",
      inquiries: [],
      activeId: null,
      actions: {},
      emptyListSlot: h("div", null, "SENTINEL-EMPTY-CTA"),
      scaffold,
    });
    assert.match(html, /SENTINEL-EMPTY-CTA/);
    assert.doesNotMatch(html, /Nothing in this view\./);
  });

  it("ctx.select() routes through actions.onSelectInquiry with the row id", () => {
    const picked: string[] = [];
    let captured: ThreadShellRowContext | null = null;
    render({
      role: "client",
      inquiries: ITEMS,
      activeId: null,
      actions: { onSelectInquiry: (id) => picked.push(id) },
      renderRow: (item, ctx) => {
        if (item.id === "i2") captured = ctx;
        return h("span", null, item.title);
      },
      scaffold,
    });
    assert.ok(captured, "renderRow received a ctx for i2");
    (captured as unknown as ThreadShellRowContext).select();
    assert.deepEqual(picked, ["i2"]);
  });
});
