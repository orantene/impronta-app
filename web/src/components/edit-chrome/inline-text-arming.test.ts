import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { resolveLegacySectionArming } from "./inline-text-arming";

// WAVE 2.1 — the canvas text-edit arming path.
//
// The defect: editing text on the canvas took FOUR interactions and dropped
// every character typed before the last one. Two independent causes:
//
//   1. the legacy CMS-section branch refused to arm until the section was
//      already selected AND the inspector had loaded its draft props, both of
//      which only become true because of the operator's own click, so the first
//      double-click was swallowed
//   2. the overlay mounted with nothing focused, so typing went to <body>
//
// These tests pin both. (1) is pure and asserted directly. (2) is a DOM/Lexical
// behaviour, so it is pinned structurally: the plugin must exist, must be wired
// into the canvas overlay, and must focus in a LAYOUT effect - a focus deferred
// to a timeout or rAF re-opens the window where the editor is mounted but
// cannot capture input, which is the bug wearing a disguise.

test("arms on the FIRST double-click, before the section is selected", () => {
  const decision = resolveLegacySectionArming({
    sectionId: "sec-1",
    originalText: "Your studio, live in one page.",
    draftPropsLoaded: false,
    selectedSectionId: null,
  });
  assert.deepEqual(decision, { arm: true });
});

test("arms while a DIFFERENT section is still the selected one", () => {
  const decision = resolveLegacySectionArming({
    sectionId: "sec-1",
    originalText: "Headline",
    draftPropsLoaded: true,
    selectedSectionId: "sec-2",
  });
  assert.deepEqual(decision, { arm: true });
});

test("arms with the draft props still loading", () => {
  const decision = resolveLegacySectionArming({
    sectionId: "sec-1",
    originalText: "Headline",
    draftPropsLoaded: false,
    selectedSectionId: "sec-1",
  });
  assert.deepEqual(decision, { arm: true });
});

test("does not arm outside a cms section", () => {
  const decision = resolveLegacySectionArming({
    sectionId: null,
    originalText: "Headline",
    draftPropsLoaded: true,
    selectedSectionId: "sec-1",
  });
  assert.deepEqual(decision, { arm: false, reason: "no-section" });
});

test("does not arm on empty or whitespace-only text", () => {
  for (const originalText of ["", "   ", "\n\t"]) {
    assert.deepEqual(
      resolveLegacySectionArming({
        sectionId: "sec-1",
        originalText,
        draftPropsLoaded: true,
        selectedSectionId: "sec-1",
      }),
      { arm: false, reason: "empty-text" },
    );
  }
});

// ── the focus half of the defect ────────────────────────────────────────────

const here = new URL(".", import.meta.url).pathname;
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

test("the inline overlay focuses itself synchronously, in a layout effect", () => {
  const plugin = read("rich-editor/plugins/AutoFocusCaretPlugin.tsx");
  assert.match(
    plugin,
    /useLayoutEffect/,
    "focus must run in a layout effect - a deferred focus leaves a window where the editor is mounted but drops keystrokes",
  );
  assert.doesNotMatch(
    plugin,
    /setTimeout|requestAnimationFrame/,
    "focus must not be deferred to a timer or a frame",
  );
  assert.match(plugin, /\.focus\(/, "it must actually focus the editor root");
});

test("the canvas overlay wires the auto-focus caret and passes the click point", () => {
  const overlay = read("rich-editor/CanvasEditOverlay.tsx");
  assert.match(overlay, /autoFocusCaretRef=\{caretPointRef\}/);
  assert.match(overlay, /caretPoint/);

  const editor = read("rich-editor/RichEditor.tsx");
  assert.match(editor, /AutoFocusCaretPlugin/);

  const inline = read("inline-editor.tsx");
  assert.match(
    inline,
    /caretPoint: \{ x: e\.clientX, y: e\.clientY \}/,
    "the double-click point must be captured for caret placement",
  );
  assert.match(inline, /resolveLegacySectionArming/);
  assert.doesNotMatch(
    inline,
    /if \(!draftPropsRef\.current\) return;/,
    "the draft-props open-time gate is what ate the first double-click",
  );
});
