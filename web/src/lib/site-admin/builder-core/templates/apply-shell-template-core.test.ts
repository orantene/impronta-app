/**
 * apply-shell-template-core.test.ts — WS-A A7. Pure tests (node:test +
 * node:assert, NO React / Supabase) for the apply-shell-template tree merge.
 *
 * Covers:
 *   1. `asShellTemplateKind` narrows only the two shell kinds.
 *   2. `slotForShellTemplateKind` maps kind → landmark slot.
 *   3. `applyShellTemplateToTree` writes the template's (re-minted) children onto
 *      ONLY the targeted landmark, preserves the other landmark, and always
 *      returns the slim [header, footer] shape.
 *   4. A template authored from a shell (carrying its own landmark wrapper) is
 *      unwrapped so we never nest a landmark in a landmark.
 *   5. Re-minted ids never collide with the source template ids.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BuilderNode,
  BuilderNodeTree,
  BuilderSectionNode,
} from "@/lib/site-admin/builder-node/types";
import {
  applyShellTemplateToTree,
  asShellTemplateKind,
  galleryTabForTemplateKind,
  slotForShellTemplateKind,
  templateTreeToLandmarkChildren,
} from "./apply-shell-template-core";

function landmark(
  slotKey: "header" | "footer",
  children: BuilderNode[],
): BuilderSectionNode {
  return {
    id: `shell:${slotKey}`,
    kind: "section",
    props: {
      sectionTypeKey: slotKey === "header" ? "site_header" : "site_footer",
      slotKey,
      sortOrder: slotKey === "header" ? 0 : 1,
      label: null,
    },
    children,
  };
}

function heading(id: string, text: string): BuilderNode {
  return { id, kind: "heading", props: { text, level: 2 } } as BuilderNode;
}

// ── kind narrowing ─────────────────────────────────────────────────────────────

test("[A7] asShellTemplateKind narrows only shell kinds", () => {
  assert.equal(asShellTemplateKind("shell_header"), "shell_header");
  assert.equal(asShellTemplateKind("shell_footer"), "shell_footer");
  assert.equal(asShellTemplateKind("page_template"), null);
  assert.equal(asShellTemplateKind("section"), null);
  assert.equal(asShellTemplateKind("element"), null);
});

test("[A7] slotForShellTemplateKind maps kind → slot", () => {
  assert.equal(slotForShellTemplateKind("shell_header"), "header");
  assert.equal(slotForShellTemplateKind("shell_footer"), "footer");
});

// ── A7 follow-up — create-draft kind → gallery_tab wiring ────────────────────

test("[A7 follow-up] galleryTabForTemplateKind pins shell kinds to the 'shell' tab", () => {
  // Shell templates must ONLY ever land on the shell-surface gallery tab.
  assert.equal(galleryTabForTemplateKind("shell_header"), "shell");
  assert.equal(galleryTabForTemplateKind("shell_footer"), "shell");
});

test("[A7 follow-up] galleryTabForTemplateKind maps non-shell kinds to their natural tab", () => {
  assert.equal(galleryTabForTemplateKind("element"), "elements");
  assert.equal(galleryTabForTemplateKind("connected"), "connected");
  assert.equal(galleryTabForTemplateKind("section"), "sections");
  assert.equal(galleryTabForTemplateKind("page_template"), "page_templates");
  assert.equal(galleryTabForTemplateKind("starter_kit"), "page_templates");
  // No non-shell kind ever resolves to the shell tab.
  for (const k of [
    "element",
    "connected",
    "section",
    "page_template",
    "starter_kit",
  ] as const) {
    assert.notEqual(galleryTabForTemplateKind(k), "shell");
  }
});

// ── targeted landmark replacement ───────────────────────────────────────────────

test("[A7] applyShellTemplateToTree replaces ONLY the header landmark, preserves footer", () => {
  const current: BuilderNodeTree = [
    landmark("header", [heading("h-old", "Old header")]),
    landmark("footer", [heading("f-keep", "Keep footer")]),
  ];
  const templateTree: BuilderNode[] = [heading("t-new", "New header brand")];

  const out = applyShellTemplateToTree({
    currentTree: current,
    templateTree,
    kind: "shell_header",
  });

  // Always slim [header, footer] order.
  assert.equal(out.length, 2);
  assert.equal(out[0]!.props.slotKey, "header");
  assert.equal(out[1]!.props.slotKey, "footer");

  // Footer landmark preserved verbatim (same child).
  assert.equal(out[1]!.children?.length, 1);
  assert.equal((out[1]!.children![0]!.props as { text: string }).text, "Keep footer");

  // Header landmark now carries the template child (text matches, id re-minted).
  assert.equal(out[0]!.children?.length, 1);
  assert.equal((out[0]!.children![0]!.props as { text: string }).text, "New header brand");
  assert.notEqual(out[0]!.children![0]!.id, "t-new");
});

test("[A7] applyShellTemplateToTree replaces ONLY the footer landmark for shell_footer", () => {
  const current: BuilderNodeTree = [
    landmark("header", [heading("h-keep", "Keep header")]),
    landmark("footer", [heading("f-old", "Old footer")]),
  ];
  const out = applyShellTemplateToTree({
    currentTree: current,
    templateTree: [heading("t-foot", "New footer")],
    kind: "shell_footer",
  });
  assert.equal((out[0]!.children![0]!.props as { text: string }).text, "Keep header");
  assert.equal((out[1]!.children![0]!.props as { text: string }).text, "New footer");
});

test("[A7] applyShellTemplateToTree synthesizes the missing landmark when the current tree is partial", () => {
  // Current tree has only a header — applying a footer template must still
  // produce both landmarks.
  const current: BuilderNodeTree = [landmark("header", [heading("h", "Header")])];
  const out = applyShellTemplateToTree({
    currentTree: current,
    templateTree: [heading("t", "Footer")],
    kind: "shell_footer",
  });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.props.slotKey, "header");
  assert.equal(out[1]!.props.slotKey, "footer");
  assert.equal((out[1]!.children![0]!.props as { text: string }).text, "Footer");
});

test("[A7] an empty current tree yields both landmarks (target filled, other empty)", () => {
  const out = applyShellTemplateToTree({
    currentTree: [],
    templateTree: [heading("t", "Brand")],
    kind: "shell_header",
  });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.children?.length, 1);
  assert.equal(out[1]!.children?.length ?? 0, 0);
});

// ── landmark-wrapped template unwrap ────────────────────────────────────────────

test("[A7] templateTreeToLandmarkChildren unwraps a matching landmark wrapper", () => {
  const wrapped: BuilderNode[] = [
    landmark("header", [heading("a", "A"), heading("b", "B")]),
  ];
  const children = templateTreeToLandmarkChildren(wrapped, "header");
  // Unwrapped to the two inner children (not the landmark itself).
  assert.equal(children.length, 2);
  assert.equal(children.every((c) => c.kind === "heading"), true);
});

test("[A7] templateTreeToLandmarkChildren drops a MISMATCHED landmark wrapper (footer tree into header)", () => {
  const wrapped: BuilderNode[] = [
    landmark("footer", [heading("a", "A")]),
  ];
  // Filling the HEADER slot but the wrapper is a footer landmark → dropped.
  const children = templateTreeToLandmarkChildren(wrapped, "header");
  assert.equal(children.length, 0);
});

test("[A7] re-minted template ids never collide with source ids", () => {
  const templateTree: BuilderNode[] = [heading("dup", "X")];
  const out = applyShellTemplateToTree({
    currentTree: [landmark("header", []), landmark("footer", [])],
    templateTree,
    kind: "shell_header",
  });
  const newId = out[0]!.children![0]!.id;
  assert.notEqual(newId, "dup");
});
