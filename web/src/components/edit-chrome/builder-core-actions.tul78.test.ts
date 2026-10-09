/**
 * TUL-78 — page builder core editing actions.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test src/components/edit-chrome/builder-core-actions.tul78.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { insertLevelForGalleryAction, resolveInsertAnchor } from "./add-gallery/gallery-insert-hint";
import { duplicateBuilderNode, insertBuilderNode } from "@/lib/site-admin/builder-node/operations";
import { keyboardFocusIsInPanel } from "./builder-keyboard";
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

describe("nested section duplicate (B-2)", () => {
  const tree: BuilderNodeTree = [
    node("hero", "section", { sectionId: "db-hero" }, [
      node("gallery", "section", { sectionId: "db-gallery" }),
      node("plain", "container"),
    ]),
  ];

  it("a section row nested in another block is reported, not sent to the section duplicate", () => {
    const route = resolveDuplicateRoute(tree, "gallery");
    assert.equal(route.route, "unsupported");
    assert.ok(route.route === "unsupported" && route.message.length > 20);
  });

  it("the page-root section still routes to the section duplicate; nested plain blocks use the node lane", () => {
    assert.deepEqual(resolveDuplicateRoute(tree, "hero"), { route: "section", sectionId: "db-hero" });
    assert.deepEqual(resolveDuplicateRoute(tree, "plain"), { route: "node" });
  });
});

describe("whole-section insert never nests in the selected hero (B-1)", () => {
  const tree: BuilderNodeTree = [
    node("hero", "section", {}, [node("heading", "heading"), node("box", "container", {}, [node("t", "text")])]),
    node("faq", "section_embed"),
  ];

  it("a section-level insert after a nested selection lands after the page-root ancestor", () => {
    assert.deepEqual(resolveInsertAnchor(tree, "box", null, "page-root"), { parentId: null, index: 1 });
    assert.deepEqual(resolveInsertAnchor(tree, "t", null, "page-root"), { parentId: null, index: 1 });
    assert.deepEqual(resolveInsertAnchor(tree, "faq", null, "page-root"), { parentId: null, index: 2 });
  });

  it("an element insert keeps landing next to the selection inside its container", () => {
    assert.deepEqual(resolveInsertAnchor(tree, "box", null), { parentId: "hero", index: 2 });
    assert.deepEqual(resolveInsertAnchor(tree, "t", null, "nearest"), { parentId: "box", index: 1 });
  });

  it("maps gallery actions to an insert level", () => {
    assert.equal(insertLevelForGalleryAction("sectionEmbed"), "page-root");
    assert.equal(insertLevelForGalleryAction("connectedNode"), "page-root");
    assert.equal(insertLevelForGalleryAction("sectionTemplate"), "page-root");
    assert.equal(insertLevelForGalleryAction("nativeNode"), "nearest");
    assert.equal(insertLevelForGalleryAction("dbTemplate"), "nearest");
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

describe("nested Gallery/FAQ section duplicate (TUL-396)", () => {
  // A Gallery/FAQ nested in a hero is a `section_embed` node, which the node
  // lane duplicates (a DB-backed `section` child of a section is not a valid
  // tree shape at all, so it is not duplicated here).
  const tree = (): BuilderNodeTree => [
    node("hero", "section", { sectionTypeKey: "hero" }, [
      node("faq", "section_embed", { sectionTypeKey: "faq_accordion" }),
      node("tail", "section_embed", { sectionTypeKey: "gallery_strip" }),
    ]),
  ];

  it("routes a nested embed to the node lane", () => {
    assert.deepEqual(resolveDuplicateRoute(tree(), "faq"), { route: "node" });
  });

  it("copies it right after the original inside its parent with a fresh id", () => {
    const res = duplicateBuilderNode({ tree: tree(), nodeId: "faq" });
    assert.ok(res.ok);
    if (!res.ok) return;
    const kids = (res.tree[0] as { children: BuilderNode[] }).children;
    assert.deepEqual(kids.map((k) => k.id), ["faq", res.nodeId, "tail"]);
    assert.notEqual(res.nodeId, "faq");
  });

  it("undo: the operation never mutates the input tree, so the previous tree restores exactly", () => {
    const before = tree();
    const snapshot = JSON.stringify(before);
    const res = duplicateBuilderNode({ tree: before, nodeId: "faq" });
    assert.ok(res.ok);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("insert undo (TUL-396)", () => {
  it("insert returns a new tree; the previous tree is unchanged so undo restores it", () => {
    const props = { sectionTypeKey: "faq" };
    const before: BuilderNodeTree = [node("a", "section_embed", props), node("b", "section_embed", props)];
    const snapshot = JSON.stringify(before);
    const res = insertBuilderNode({ tree: before, node: node("n", "section_embed", props), parentId: null, index: 1 });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepEqual(res.tree.map((n) => n.id), ["a", "n", "b"]);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("Tab inside a panel is not hijacked (#11)", () => {
  const el = (inPanel: boolean) => ({ closest: () => (inPanel ? {} : null) }) as unknown as Element;
  it("focus in the inspector, drawer, dock or topbar keeps native Tab", () => {
    assert.equal(keyboardFocusIsInPanel(el(true)), true);
    assert.equal(keyboardFocusIsInPanel(el(false)), false);
    assert.equal(keyboardFocusIsInPanel(null), false);
  });
});
