/**
 * TUL-78 — page builder core editing actions.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test src/components/edit-chrome/builder-core-actions.tul78.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { resolveInsertAnchor } from "./add-gallery/gallery-insert-hint";
import { resolveDuplicateRoute } from "./builder-duplicate-route";
import { nextAddMenuChrome, type AddMenuChrome } from "./add-menu-chrome";
import { liveTextCommitValue } from "./inspectors/live-text-commit";
import { resolveInlineEditBox } from "./rich-editor/inline-edit-box";

function node(id: string, kind: string, props: Record<string, unknown> = {}, children?: BuilderNode[]): BuilderNode {
  return { id, kind, props, ...(children ? { children } : {}) } as unknown as BuilderNode;
}

describe("insert position (#5): a new block lands AFTER the selected root block", () => {
  it("selected root section_embed: index is its own position + 1, not 1", () => {
    const tree: BuilderNodeTree = [
      node("hero", "section"),
      node("about", "section_embed"),
      node("testimonials", "section_embed"),
      node("contact", "section_embed"),
    ];
    assert.deepEqual(resolveInsertAnchor(tree, "testimonials", null), { parentId: null, index: 3 });
    assert.deepEqual(resolveInsertAnchor(tree, "contact", null), { parentId: null, index: 4 });
  });

  it("Testimonials, then FAQ, then Gallery keeps the order T, FAQ, Gallery", () => {
    let tree: BuilderNodeTree = [
      node("hero", "section"),
      node("testimonials", "section_embed"),
      node("contact", "section_embed"),
    ];
    let selected = "testimonials";
    for (const id of ["faq", "gallery"]) {
      const anchor = resolveInsertAnchor(tree, selected, null);
      const next = [...tree];
      next.splice(anchor.index, 0, node(id, "section_embed"));
      tree = next;
      selected = id; // the inserted block becomes the selection
    }
    assert.deepEqual(
      tree.map((n) => n.id),
      ["hero", "testimonials", "faq", "gallery", "contact"],
    );
  });
});

describe("duplicate guard (#6): Duplicate never dead-ends on a section node", () => {
  const tree: BuilderNodeTree = [
    node("sec-a", "section", { sectionId: "db-1", sectionTypeKey: "gallery_strip" }),
    node("sec-b", "section", { sectionTypeKey: "freeform" }, [node("t1", "text")]),
    node("emb", "section_embed", { sectionTypeKey: "faq" }),
  ];

  it("a section node backed by a DB section routes to the section duplicate", () => {
    assert.deepEqual(resolveDuplicateRoute(tree, "sec-a"), { route: "section", sectionId: "db-1" });
  });

  it("a plain tree section and every other kind use the node duplicate", () => {
    assert.deepEqual(resolveDuplicateRoute(tree, "sec-b"), { route: "node" });
    assert.deepEqual(resolveDuplicateRoute(tree, "emb"), { route: "node" });
    assert.deepEqual(resolveDuplicateRoute(tree, "t1"), { route: "node" });
    assert.deepEqual(resolveDuplicateRoute(tree, "missing"), { route: "node" });
  });
});

describe("add while inspector open (#3)", () => {
  const inspectorOpen: AddMenuChrome = {
    addMenuOpen: false,
    inspectorOpen: true,
    searchOpen: true,
    pagesOpen: true,
    designOpen: false,
    navigatorOpen: true,
  };

  it("opens the Add panel with the inspector open and leaves the inspector alone", () => {
    const next = nextAddMenuChrome(inspectorOpen, "toggle");
    assert.equal(next.addMenuOpen, true);
    assert.equal(next.inspectorOpen, true);
    assert.equal(next.searchOpen, false);
    assert.equal(next.pagesOpen, false);
    assert.equal(next.navigatorOpen, false);
  });

  it("is idempotent: open never closes, toggle twice returns to closed", () => {
    const opened = nextAddMenuChrome(inspectorOpen, "open");
    assert.equal(nextAddMenuChrome(opened, "open").addMenuOpen, true);
    assert.equal(nextAddMenuChrome(opened, "toggle").addMenuOpen, false);
  });
});

describe("live inspector text (#11)", () => {
  it("returns the value to save, or null when nothing should be saved", () => {
    assert.equal(liveTextCommitValue({ draft: "New", saved: "Old", allowEmpty: false }), "New");
    assert.equal(liveTextCommitValue({ draft: "Old", saved: "Old", allowEmpty: false }), null);
    assert.equal(liveTextCommitValue({ draft: "  ", saved: "Old", allowEmpty: false }), null);
    assert.equal(liveTextCommitValue({ draft: "", saved: "Old", allowEmpty: true }), "");
  });
});

describe("inline edit box (#7 / E-06)", () => {
  it("block targets keep their own width", () => {
    const box = resolveInlineEditBox({
      rect: { top: 10, left: 20, width: 600, height: 80 },
      parentRect: { left: 20, width: 600 },
      display: "block",
      viewportWidth: 1280,
    });
    assert.equal(box.width, 600);
    assert.equal(box.left, 20);
  });

  it("an inline or shrink-wrapped target widens to its container so words wrap, not break", () => {
    const box = resolveInlineEditBox({
      rect: { top: 10, left: 120, width: 90, height: 40 },
      parentRect: { left: 40, width: 700 },
      display: "inline-block",
      viewportWidth: 1280,
    });
    assert.equal(box.left, 40);
    assert.equal(box.width, 700);
  });

  it("never extends past the viewport", () => {
    const box = resolveInlineEditBox({
      rect: { top: 0, left: 200, width: 50, height: 20 },
      parentRect: { left: 100, width: 2000 },
      display: "inline",
      viewportWidth: 800,
    });
    assert.ok(box.left + box.width <= 800);
  });
});
