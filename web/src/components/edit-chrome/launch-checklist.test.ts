/**
 * ONB-2 — unit tests for launch-checklist step-completion derivation helpers.
 *
 * Runs via `npx tsx --test` (Node test runner + ts-node shim). No DOM required
 * for these functions — they operate on plain data structures.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ES_TEXT } from "./editor-i18n-es";
import {
  deriveContentDone,
  deriveAddSectionDone,
  derivePublishDone,
  loadChecklistState,
  saveChecklistState,
  LAUNCH_CHECKLIST_STEPS,
} from "./launch-checklist";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

// ─── helper ────────────────────────────────────────────────────────────────

function makeSection(id = "s1"): BuilderNodeTree[number] {
  return {
    id,
    kind: "section",
    props: { sectionTypeKey: "hero" },
    children: [],
  } as BuilderNodeTree[number];
}

function makeNode(id = "n1", kind: string = "heading"): BuilderNodeTree[number] {
  return { id, kind, props: {}, children: [] } as unknown as BuilderNodeTree[number];
}

// ─── deriveContentDone ──────────────────────────────────────────────────────

describe("deriveContentDone", () => {
  it("returns false for empty tree", () => {
    assert.strictEqual(deriveContentDone([]), false);
  });

  it("returns false when tree contains only non-section nodes", () => {
    assert.strictEqual(deriveContentDone([makeNode("n1", "heading"), makeNode("n2", "paragraph")]), false);
  });

  it("returns true when tree contains a section node", () => {
    assert.strictEqual(deriveContentDone([makeSection("s1")]), true);
  });

  it("returns true when tree contains a section_embed node", () => {
    const node = { id: "e1", kind: "section_embed", props: {}, children: [] } as unknown as BuilderNodeTree[number];
    assert.strictEqual(deriveContentDone([node]), true);
  });

  it("returns true when mixed with non-section nodes", () => {
    assert.strictEqual(deriveContentDone([makeNode("n1", "heading"), makeSection("s1")]), true);
  });
});

// ─── deriveAddSectionDone ───────────────────────────────────────────────────

describe("launch checklist copy is in ES_TEXT", () => {
  it("every step label, hint, and CTA has a Spanish entry", () => {
    for (const step of LAUNCH_CHECKLIST_STEPS) {
      for (const key of [step.label, step.hint, step.cta]) {
        assert.ok(ES_TEXT[key]?.trim(), `missing ES_TEXT for "${key}"`);
      }
    }
  });

  it("the panel does not complete Add a section from the starter section count", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/edit-chrome/launch-checklist-panel.tsx"),
      "utf8",
    );
    assert.equal(source.includes("deriveAddSectionDone"), false);
    assert.match(source, /addMenuOpen/);
  });
});

describe("deriveAddSectionDone", () => {
  it("returns false for empty tree", () => {
    assert.strictEqual(deriveAddSectionDone([]), false);
  });

  it("returns false when only one section exists", () => {
    assert.strictEqual(deriveAddSectionDone([makeSection("s1")]), false);
  });

  it("returns true when two or more sections exist", () => {
    assert.strictEqual(deriveAddSectionDone([makeSection("s1"), makeSection("s2")]), true);
  });

  it("returns true when sections are mixed with non-section nodes", () => {
    assert.strictEqual(
      deriveAddSectionDone([makeSection("s1"), makeNode("n1", "heading"), makeSection("s2")]),
      true,
    );
  });

  it("counts section_embed towards total", () => {
    const embed = { id: "e1", kind: "section_embed", props: {}, children: [] } as unknown as BuilderNodeTree[number];
    assert.strictEqual(deriveAddSectionDone([makeSection("s1"), embed]), true);
  });
});

// ─── derivePublishDone ──────────────────────────────────────────────────────

describe("derivePublishDone", () => {
  it("returns false when publishedAt is null", () => {
    assert.strictEqual(derivePublishDone(null), false);
  });

  it("returns true when publishedAt is a date string", () => {
    assert.strictEqual(derivePublishDone("2026-06-17T12:00:00Z"), true);
  });

  it("returns true for any non-null string", () => {
    assert.strictEqual(derivePublishDone("any-value"), true);
  });
});

// ─── loadChecklistState / saveChecklistState ────────────────────────────────

describe("loadChecklistState", () => {
  it("returns default state when window is undefined", () => {
    // Node environment — window is undefined, so loadChecklistState returns defaults
    const state = loadChecklistState("test-page-key");
    assert.strictEqual(state.dismissed, false);
    assert.strictEqual(state.done.content, false);
    assert.strictEqual(state.done.theme, false);
    assert.strictEqual(state.done.addSection, false);
    assert.strictEqual(state.done.publish, false);
  });
});

describe("saveChecklistState", () => {
  it("is a no-op when window is undefined", () => {
    // Should not throw
    assert.doesNotThrow(() => {
      saveChecklistState("test-page-key", {
        dismissed: true,
        done: { content: true, theme: false, addSection: false, publish: false },
      });
    });
  });
});
