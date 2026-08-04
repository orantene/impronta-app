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
 * from the theme — a re-render never touches that property, so the stamped
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

test("clearing the preview removes stamped properties so the tree is authoritative again", () => {
  resetDom();
  const el = makeElement("node-1");
  elements.set("node-1", el);

  applyCanvasTextStylePreview("node-1", { fontSize: "13px", align: "center" });
  assert.equal(el.declared.get("font-size"), "13px");
  assert.equal(el.declared.get("text-align"), "center");

  clearCanvasTextStylePreview();

  assert.equal(
    el.declared.size,
    0,
    "an undone preview must not survive on the DOM — that is the no-op-undo bug",
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

test("a preview that clears a property stops tracking it", () => {
  resetDom();
  const el = makeElement("node-4");
  elements.set("node-4", el);

  applyCanvasTextStylePreview("node-4", { fontSize: "18px" });
  applyCanvasTextStylePreview("node-4", { fontSize: undefined });
  assert.equal(el.declared.has("font-size"), false);

  el.declared.set("font-size", "11px"); // now owned by the rendered tree
  clearCanvasTextStylePreview();

  assert.equal(
    el.declared.get("font-size"),
    "11px",
    "clearing must not strip a value the tree rendered",
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
