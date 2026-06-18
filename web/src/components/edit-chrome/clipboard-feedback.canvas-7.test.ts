import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { clipboardActionLabel } from "./builder-clipboard-toast";
import type { BuilderClipboardAction } from "./edit-context";

/**
 * CANVAS-7 — copy/cut/paste/duplicate success feedback + chip "More" menu.
 *
 * THE CONTRACT THIS GUARDS. (A) The four block clipboard gestures raise a
 * SHARED transient success toast from the EditContext chokepoints (copy/cut/
 * paste/duplicate), so every entry point — keyboard, the selection-chip "More"
 * menu, the right-click context menu — on all four surfaces surfaces identical
 * feedback. The setter COALESCES: a copy→paste burst replaces the chip (one
 * toast, re-armed auto-hide) instead of stacking. (B) All four clipboard
 * actions are reachable from the chip "More" menu (BlockChipOverflowMenu),
 * with Cut/Paste/Duplicate joining the pre-existing Copy.
 *
 * WHY A LOCAL HARNESS. The production seam is a React `useState`/`useRef`
 * closure inside `EditProvider`; it can't be imported without a DOM. The
 * `ClipboardFeedbackHarness` below is a faithful, line-cited mirror of ONLY the
 * coalescing toast mechanics of the real `notifyClipboardAction`
 * (edit-context.tsx) — bump a nonce, replace the single toast, clamp count ≥1.
 * The pure `clipboardActionLabel` copy resolver is imported and tested for
 * real. Static-source assertions then prove every chokepoint and the chip menu
 * are wired (the wiring can't be exercised without React, but its presence is
 * the regression that would silently drop the feedback / a menu action).
 */

// ── (1) The pure feedback copy resolver (real import) ────────────────────────

test("clipboardActionLabel: each gesture renders its own past-tense verb", () => {
  assert.equal(clipboardActionLabel("copy", 1), "Copied block");
  assert.equal(clipboardActionLabel("cut", 1), "Cut block");
  assert.equal(clipboardActionLabel("paste", 1), "Pasted block");
  assert.equal(clipboardActionLabel("duplicate", 1), "Duplicated block");
});

test("clipboardActionLabel: pluralizes and clamps the count", () => {
  assert.equal(clipboardActionLabel("copy", 3), "Copied 3 blocks");
  assert.equal(clipboardActionLabel("duplicate", 2), "Duplicated 2 blocks");
  // A malformed 0 / negative / NaN count never renders "0 blocks".
  assert.equal(clipboardActionLabel("copy", 0), "Copied block");
  assert.equal(clipboardActionLabel("paste", -5), "Pasted block");
  assert.equal(clipboardActionLabel("cut", Number.NaN), "Cut block");
  // Fractional count floors, then pluralizes.
  assert.equal(clipboardActionLabel("copy", 2.9), "Copied 2 blocks");
});

// ── (2) The coalescing toast trigger (faithful mirror) ───────────────────────

interface ClipboardActionToast {
  action: BuilderClipboardAction;
  count: number;
  nonce: number;
}

/** Faithful mirror of EditContext's `notifyClipboardAction` coalescing setter. */
class ClipboardFeedbackHarness {
  toast: ClipboardActionToast | null = null;
  private nonce = 0;

  /** Mirror of `notifyClipboardAction` (edit-context.tsx). */
  notify(action: BuilderClipboardAction, count: number): void {
    this.nonce += 1;
    this.toast = { action, count: Math.max(1, count), nonce: this.nonce };
  }

  /** Mirror of `clearClipboardActionToast`. */
  clear(): void {
    this.toast = null;
  }
}

test("notifyClipboardAction trigger: a single gesture raises a labelled toast", () => {
  const h = new ClipboardFeedbackHarness();
  assert.equal(h.toast, null, "no toast before any gesture");

  h.notify("copy", 1);
  const toast = h.toast as ClipboardActionToast | null;
  assert.ok(toast, "copy raises a toast");
  assert.equal(toast.action, "copy");
  assert.equal(clipboardActionLabel(toast.action, toast.count), "Copied block");
});

test("notifyClipboardAction trigger: a copy→paste burst COALESCES into one chip", () => {
  const h = new ClipboardFeedbackHarness();
  h.notify("copy", 1);
  const afterCopy = h.toast?.nonce;
  h.notify("paste", 1);

  // Still exactly ONE toast object — the latest gesture replaced the prior one
  // (the regression would be stacking multiple toasts on a rapid sequence).
  assert.equal(h.toast?.action, "paste", "latest gesture wins");
  assert.notEqual(
    h.toast?.nonce,
    afterCopy,
    "nonce bumped so the auto-hide timer re-arms",
  );
});

test("notifyClipboardAction trigger: cut overwrites the copy toast it fires internally", () => {
  // cutSelectedBuilderNodes calls copySelectedBuilderNodes (→ 'copy' toast),
  // then re-notifies 'cut'. The coalescing setter means only 'cut' is visible.
  const h = new ClipboardFeedbackHarness();
  h.notify("copy", 2); // the internal copy leg
  h.notify("cut", 2); // the cut re-notify
  const toast = h.toast;
  assert.ok(toast, "a toast is present after cut");
  assert.equal(toast.action, "cut", "cut feedback wins, not copy");
  assert.equal(clipboardActionLabel(toast.action, toast.count), "Cut 2 blocks");
});

test("clearClipboardActionToast trigger: dismiss removes the toast", () => {
  const h = new ClipboardFeedbackHarness();
  h.notify("duplicate", 1);
  assert.ok(h.toast);
  h.clear();
  assert.equal(h.toast, null, "dismiss clears the toast");
});

// ── (3) Static-source wiring proofs ──────────────────────────────────────────

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const editContextSource = readFileSync(
  join(THIS_DIR, "edit-context.tsx"),
  "utf-8",
);
const selectionLayerSource = readFileSync(
  join(THIS_DIR, "selection-layer.tsx"),
  "utf-8",
);
const editShellSource = readFileSync(
  join(THIS_DIR, "edit-shell.tsx"),
  "utf-8",
);

test("feedback wiring: every clipboard chokepoint calls notifyClipboardAction", () => {
  // Each shared handler must raise the success toast on its ok-path. A missing
  // call is the silent-clipboard regression CANVAS-7 closes.
  for (const action of ["copy", "cut", "paste", "duplicate"] as const) {
    assert.ok(
      editContextSource.includes(`notifyClipboardAction("${action}"`),
      `edit-context raises notifyClipboardAction("${action}", …)`,
    );
  }
  // The single-node copy/duplicate handlers and the multi-node selection
  // handlers all route through it — at least 6 call sites (copyBuilderNode,
  // copySelectedBuilderNodes, cutSelectedBuilderNodes, duplicateBuilderNode,
  // duplicateSelectedBuilderNodes, pasteCopiedBuilderNode, pasteBuilderNode-
  // Clipboard, pasteBuilderBlockPreset).
  const callCount = (editContextSource.match(/notifyClipboardAction\(/g) ?? [])
    .length;
  assert.ok(
    callCount >= 6,
    `expected ≥6 notifyClipboardAction call sites, found ${callCount}`,
  );
});

test("feedback wiring: the shared ClipboardActionToast is mounted in edit-shell", () => {
  assert.ok(
    editShellSource.includes("function ClipboardActionToast"),
    "ClipboardActionToast component defined in shared edit-shell chrome",
  );
  assert.ok(
    editShellSource.includes("<ClipboardActionToast />"),
    "ClipboardActionToast mounted alongside the other shared toasts",
  );
  // It must consume the shared EditContext state, not a surface-local store.
  assert.ok(
    editShellSource.includes("clipboardActionToast") &&
      editShellSource.includes("clipboardActionLabel"),
    "toast reads shared EditContext state + the shared label resolver",
  );
});

test("More-menu wiring: the chip overflow menu exposes all four clipboard actions", () => {
  // BlockChipOverflowMenu is the chip "More" menu. It must accept and render
  // Copy, Cut, Paste, and Duplicate (Cut/Paste/Duplicate are the CANVAS-7
  // additions joining the pre-existing Copy).
  const menuStart = selectionLayerSource.indexOf(
    "function BlockChipOverflowMenu",
  );
  assert.ok(menuStart > -1, "BlockChipOverflowMenu exists");
  // Scope the assertion to the menu body (to its next top-level function).
  const menuBody = selectionLayerSource.slice(menuStart, menuStart + 4000);
  for (const label of ["Copy", "Cut", "Paste", "Duplicate"]) {
    assert.ok(
      menuBody.includes(`>\n            ${label}\n`),
      `chip More menu renders a "${label}" action item`,
    );
  }
  // And it must receive the handler props (not just hard-coded labels).
  for (const prop of ["onCopy", "onCut", "onPaste", "onDuplicate"]) {
    assert.ok(
      menuBody.includes(prop),
      `BlockChipOverflowMenu wires the ${prop} handler`,
    );
  }
});

test("More-menu wiring: a single 'cut' path exists (no copy+remove fork in the chip)", () => {
  // commitChildCut routes through the shared cutSelectedBuilderNodes chokepoint
  // so the chip menu and the ⌘X shortcut share one path + the correct toast.
  assert.ok(
    selectionLayerSource.includes("commitChildCut"),
    "chip cut helper exists",
  );
  assert.ok(
    /commitChildCut\s*=\s*useCallback\([\s\S]{0,200}cutSelectedBuilderNodes\(\)/.test(
      selectionLayerSource,
    ),
    "commitChildCut delegates to the shared cutSelectedBuilderNodes (no fork)",
  );
});
