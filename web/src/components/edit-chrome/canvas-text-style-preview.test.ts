import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCanvasTextStylePreview,
  clearCanvasTextStylePreview,
} from "./canvas-text-style-preview";

/**
 * The toolbar previews style tweaks by writing inline styles straight onto the
 * canvas DOM, outside React. When the committed tree carries no explicit value
 * for a previewed property — the common case, since the original value comes
 * from the theme, a re-render never touches that property, so the stamped
 * value outlives the tree it previewed. Undo then reverts the data while the
 * canvas keeps showing the undone value.
 *
 * These tests pin the clearing contract that keeps the rendered tree
 * authoritative. A minimal element stub stands in for the DOM (the node:test
 * lane has no jsdom).
 */

interface StyleStub {
  setProperty(name: string, value: string): void;
  removeProperty(name: string): void;
  getPropertyValue(name: string): string;
}

function makeElement(id: string): { style: StyleStub; declared: Map<string, string> } {
  const declared = new Map<string, string>();
  const style: StyleStub = {
    setProperty: (name, value) => void declared.set(name, value),
    removeProperty: (name) => void declared.delete(name),
    getPropertyValue: (name) => declared.get(name) ?? "",
  };
  return { style, declared, ...({ id } as object) } as never as {
    style: StyleStub;
    declared: Map<string, string>;
  };
}

const elements = new Map<string, ReturnType<typeof makeElement>>();

function installDom(): void {
  (globalThis as { CSS?: { escape(value: string): string } }).CSS = {
    escape: (value: string) => value,
  };
  (
    globalThis as {
      document?: { querySelector(selector: string): unknown };
    }
  ).document = {
    querySelector(selector: string) {
      const match = /\[data-builder-node-id="(.+)"\]/.exec(selector);
      if (!match) return null;
      return elements.get(match[1]!) ?? null;
    },
  };
}

function resetDom(): void {
  elements.clear();
  installDom();
}

test("clearing an uncommitted preview restores the value that was underneath", () => {
  resetDom();
  const el = makeElement("node-1");
  elements.set("node-1", el);
  el.declared.set("font-size", "12px"); // rendered by React from the tree

  applyCanvasTextStylePreview("node-1", { fontSize: "13px", align: "center" });
  assert.equal(el.declared.get("font-size"), "13px");
  assert.equal(el.declared.get("text-align"), "center");

  clearCanvasTextStylePreview();

  // Restored, NOT deleted: deleting would drop the block to its theme default,
  // which is a different wrong answer from the no-op-undo bug.
  assert.equal(el.declared.get("font-size"), "12px");
  assert.equal(
    el.declared.has("text-align"),
    false,
    "a property with nothing underneath is removed",
  );
});

test("a committed patch still restores correctly: a commit does not repaint every surface", () => {
  resetDom();
  const el = makeElement("node-committed");
  elements.set("node-committed", el);
  el.declared.set("font-size", "12px"); // rendered from the tree

  applyCanvasTextStylePreview("node-committed", { fontSize: "13px" });
  // The patch commits to the tree. On a surface with no client canvas mounted
  // for this node the canvas is server-rendered and undo/redo skip the RSC
  // refresh, so React never rewrites the property: the stamp is still the only
  // thing on screen. Tracking must therefore survive the commit.
  clearCanvasTextStylePreview();

  assert.equal(
    el.declared.get("font-size"),
    "12px",
    "undo must land on the pre-edit value, not the stamped one and not the theme default",
  );
});

test("clearing is scoped when a node id is supplied", () => {
  resetDom();
  const a = makeElement("node-a");
  const b = makeElement("node-b");
  elements.set("node-a", a);
  elements.set("node-b", b);

  applyCanvasTextStylePreview("node-a", { fontSize: "20px" });
  applyCanvasTextStylePreview("node-b", { fontSize: "30px" });

  clearCanvasTextStylePreview("node-a");

  assert.equal(a.declared.has("font-size"), false);
  assert.equal(b.declared.get("font-size"), "30px");
});

test("clearing twice is a no-op and never throws", () => {
  resetDom();
  const el = makeElement("node-2");
  elements.set("node-2", el);

  applyCanvasTextStylePreview("node-2", { textColor: "#fff" });
  clearCanvasTextStylePreview();
  clearCanvasTextStylePreview();

  assert.equal(el.declared.size, 0);
});

test("only the first stamp records the original - a burst cannot overwrite it", () => {
  resetDom();
  const el = makeElement("node-burst");
  elements.set("node-burst", el);
  el.declared.set("font-size", "12px");

  applyCanvasTextStylePreview("node-burst", { fontSize: "13px" });
  applyCanvasTextStylePreview("node-burst", { fontSize: "14px" });
  applyCanvasTextStylePreview("node-burst", { fontSize: "15px" });
  clearCanvasTextStylePreview();

  assert.equal(
    el.declared.get("font-size"),
    "12px",
    "the pre-preview value, not an intermediate preview, is what gets restored",
  );
});

test("clearing only removes properties this module stamped", () => {
  resetDom();
  const el = makeElement("node-3");
  elements.set("node-3", el);
  el.declared.set("border-radius", "8px"); // authored elsewhere

  applyCanvasTextStylePreview("node-3", { fontWeight: "700" });
  clearCanvasTextStylePreview();

  assert.equal(el.declared.get("border-radius"), "8px");
  assert.equal(el.declared.has("font-weight"), false);
});

test("a preview that clears a property is itself undone by clearing", () => {
  resetDom();
  const el = makeElement("node-4");
  elements.set("node-4", el);
  el.declared.set("font-size", "18px"); // rendered by React from the tree

  // The operator resets the field: the preview removes the property so the
  // block shows its theme size immediately.
  applyCanvasTextStylePreview("node-4", { fontSize: undefined });
  assert.equal(el.declared.has("font-size"), false);

  // Undo before the patch commits: the removal was only a preview, so the
  // value it hid comes back.
  clearCanvasTextStylePreview();

  assert.equal(
    el.declared.get("font-size"),
    "18px",
    "an uncommitted removal is an overlay too, and clearing restores what it hid",
  );
});

test("stamped margin-side expansion is cleared too", () => {
  resetDom();
  const el = makeElement("node-5");
  elements.set("node-5", el);
  el.declared.set("margin", "0 auto");

  applyCanvasTextStylePreview("node-5", { marginLeftFree: "40px" });
  assert.equal(el.declared.get("margin-left"), "40px");
  assert.equal(el.declared.get("margin-right"), "0");

  clearCanvasTextStylePreview();

  assert.equal(el.declared.has("margin-left"), false);
  assert.equal(el.declared.has("margin-right"), false);
});

/**
 * Rotation joined this module because the rotate handle stamps its live angle
 * onto the DOM for the same reason the text toolbar does. Found in live QA of
 * the direct-manipulation pack: the handle owned a PRIVATE stamp, so undo
 * reverted the tree while the canvas kept painting the old angle — the #996
 * class exactly, in a new lane.
 *
 * Worth recording why the obvious fix is wrong: clearing the stamp on COMMIT
 * (rather than tracking it) was tried first and made the rotation vanish the
 * moment the pointer was released, because React does not rewrite `rotate`
 * from the prop on this surface. The stamp has to survive the commit and come
 * down only when a restore says so.
 */
test("a rotate stamp is tracked, so undo restores the angle underneath it", () => {
  resetDom();
  const el = makeElement("node-rotate");
  elements.set("node-rotate", el);
  // The angle the committed tree already renders inline.
  el.declared.set("rotate", "45deg");

  applyCanvasTextStylePreview("node-rotate", { rotate: "90deg" });
  assert.equal(el.declared.get("rotate"), "90deg", "the drag previews live");

  clearCanvasTextStylePreview();

  assert.equal(
    el.declared.get("rotate"),
    "45deg",
    "undo must land on the pre-drag angle — leaving 90deg is the no-op-undo bug this fixes",
  );
});

test("rotating a never-rotated block clears back to no rotation at all", () => {
  resetDom();
  const el = makeElement("node-rotate-fresh");
  elements.set("node-rotate-fresh", el);
  // Nothing underneath: the block has never carried a rotate escape.

  applyCanvasTextStylePreview("node-rotate-fresh", { rotate: "45deg" });
  assert.equal(el.declared.get("rotate"), "45deg");

  clearCanvasTextStylePreview();

  assert.equal(
    el.declared.has("rotate"),
    false,
    "with nothing underneath the property is removed, not left at 0deg",
  );
});
