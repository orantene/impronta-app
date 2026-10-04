import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { editorT } from "./editor-i18n";
import {
  isCanvasInlineTextEditActive,
  setActiveCanvasLexicalEditor,
  subscribeActiveCanvasLexicalEditor,
} from "./canvas-lexical-bridge";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

// Same-in-both-languages words (loanwords) are allowed to match.
const SAME = new Set(["Coach", "Noir", "Festival"]);

test("QA1 item 4: every English string seen in the ES builder resolves to Spanish", () => {
  const keys = [
    "Heading",
    "Text",
    "Level",
    "Follows your profile",
    "This line is filled in from your profile and stays up to date. Turn it off, or type your own words, to keep it as written.",
    "Draft saved",
    "Saving",
    "Unsaved",
    "Add block",
    "Add block here",
    "Discard your draft?",
    "Replace your draft with the live homepage?",
    "This discards your unsaved draft edits.",
    "Discard draft",
    "Replace draft",
    "Your site",
    "Editing now",
    "Coach",
    "Conference",
    "Restaurant",
  ];
  for (const k of keys) {
    if (!SAME.has(k)) assert.notEqual(editorT(k, "es"), k, `ES missing: ${k}`);
    assert.equal(editorT(k, "en"), k);
  }
  assert.equal(editorT("Conference", "es"), "Conferencia");
});

test("QA1 item 4: the surfaces wrap their copy in t() and no native confirm remains", () => {
  assert.ok(read("components/edit-chrome/inspectors/live-text-toggle.tsx").includes('t("Follows your profile")'));
  assert.ok(read("components/edit-chrome/kit/savechip.tsx").includes("t(defaultLabel(status))"));
  assert.ok(read("components/edit-chrome/inspectors/kit/panel-save-chip.tsx").includes('t("Draft saved")'));
  assert.ok(read("components/edit-chrome/canvas-between-blocks-insert.tsx").includes('t("Add block")'));
  assert.ok(read("components/edit-chrome/freeform-layers-tree.tsx").includes('t("Add block")'));
  const node = read("components/edit-chrome/inspectors/builder-node-content.tsx");
  for (const k of ["Heading", "Text", "Level"]) assert.ok(node.includes(`t("${k}")`), k);
  assert.ok(!read("components/edit-chrome/topbar.tsx").includes("window.confirm"));
  assert.ok(!read("components/edit-chrome/use-topbar-draft-reset.tsx").includes("window.confirm"));
});

test("QA1 item 3: a talent site lists its own page and never calls the workspace list", () => {
  const panel = read("components/edit-chrome/all-pages-panel.tsx");
  assert.match(panel, /surfaceKind === "talent_page"/);
  assert.match(panel, /if \(isTalentSurface\) return <TalentAllPagesPanel/);
  assert.match(panel, /if \(isTalentSurface\) return;\n\s+setLoading\(true\)/);
  const talent = read("components/edit-chrome/all-pages-panel-talent.tsx");
  assert.ok(!talent.includes("listPagesForPickerAction"));
  assert.ok(talent.includes('data-testid="talent-pages-row"'));
});

test("QA1 item 2: a talent surface resets its draft through the adapter, then reloads the canvas", () => {
  const hook = read("components/edit-chrome/use-discard-draft-to-live.ts");
  assert.match(hook, /surfaceAdapter\.discardDraft\(/);
  assert.match(hook, /await refreshComposition\(\)/);
  const reset = read("components/edit-chrome/use-topbar-draft-reset.tsx");
  assert.match(reset, /editCtx\.discardDraftToLive/);
  assert.match(reset, /await editCtx\.refreshComposition\(\)/);
  assert.ok(read("components/edit-chrome/edit-context.tsx").includes("discardDraftToLive,"));
});

test("QA1 item 1: Undo stays enabled while a canvas text edit is open", () => {
  assert.ok(read("components/edit-chrome/edit-shell.tsx").includes("useInlineTextEditActive() || historyCanUndo"));
  let calls = 0;
  const off = subscribeActiveCanvasLexicalEditor(() => {
    calls += 1;
  });
  assert.equal(isCanvasInlineTextEditActive(), false);
  setActiveCanvasLexicalEditor({} as never);
  assert.equal(isCanvasInlineTextEditActive(), true);
  setActiveCanvasLexicalEditor(null);
  assert.equal(isCanvasInlineTextEditActive(), false);
  assert.equal(calls, 2);
  off();
});

test("QA1 item 5: the Add gallery is a full-width bottom sheet below md, with a fluid category rail", () => {
  const gallery = read("components/edit-chrome/add-gallery/add-gallery-panel.tsx");
  assert.match(gallery, /compactBottomSheet\n/);
  assert.ok(gallery.includes('"min(148px, 34vw)"'));
  const dock = read("components/edit-chrome/dock-floating-panel.tsx");
  assert.ok(dock.includes("compactBottomSheetBelowLg={compactBottomSheet}"));
  const shell = read("components/edit-chrome/kit/floating-panel-shell.tsx");
  assert.ok(shell.includes("max-md:!left-0") && shell.includes("max-md:!w-full"));
});
