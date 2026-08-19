import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { collectHudNavs, pinnedDrawerCss } from "./mobile-hud-cards";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

const TREE = [
  {
    id: "header",
    kind: "container",
    props: {},
    children: [
      {
        id: "nav-main",
        kind: "nav",
        props: { ariaLabel: "Primary", links: [{ id: "a" }, { id: "b" }] },
      },
    ],
  },
  {
    id: "footer",
    kind: "container",
    props: {},
    children: [
      { id: "nav-footer", kind: "nav", props: { links: [{ id: "c" }] } },
    ],
  },
] as unknown as BuilderNodeTree;

test("every nav in the tree is offered, nested ones included", () => {
  const navs = collectHudNavs(TREE);
  assert.deepEqual(
    navs.map((n) => n.id),
    ["nav-main", "nav-footer"],
    "a nav nested inside the footer must still be reachable",
  );
  assert.equal(navs[0].label, "Primary");
  assert.equal(navs[0].linkCount, 2);
  assert.equal(navs[1].label, "Navigation", "an unlabelled nav still needs a name");
});

test("the pin targets ONE nav, never every menu on the page", () => {
  // A header nav and a footer nav both springing open would overlap and make
  // the canvas unusable.
  const css = pinnedDrawerCss("nav-main");
  assert.ok(css.includes('[data-builder-node-id="nav-main"]'));
  assert.ok(!css.includes("nav-footer"));
  // Every rule must be scoped; an unscoped selector would leak to other navs.
  for (const rule of css.split("}").filter(Boolean)) {
    if (!rule.trim()) continue;
    assert.ok(
      rule.includes('[data-builder-node-id="nav-main"]'),
      `unscoped rule would open every menu: ${rule.slice(0, 60)}`,
    );
  }
});

test("the pinned menu also shows the burger's open state", () => {
  // The details element is not really open, so without this the operator sees
  // a menu with no X — not what a visitor gets.
  const css = pinnedDrawerCss("n1");
  assert.match(css, /nav-burger\{background:transparent/);
  assert.match(css, /nav-burger::before\{top:0 !important;transform:rotate\(45deg\)/);
});

test("opening a menu writes nothing to the tree", () => {
  // It is a view state. If it patched the node, previewing the drawer would
  // dirty the page and could be published by accident.
  const src = readFileSync(new URL("./mobile-hud-cards.tsx", import.meta.url), "utf8");
  for (const writer of ["commitPatch", "patchBuilderNode", "setBuilderNode", "updateNode"]) {
    assert.ok(!src.includes(writer), `the HUD card must not call ${writer}`);
  }
});
