import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const palette = readFileSync("src/components/admin/shell/internal/palette.tsx", "utf8");

test("TUL-906: the command palette does not react to the ? key", () => {
  assert.doesNotMatch(palette, /isHelpKey/);
  assert.doesNotMatch(palette, /setQuery\("shortcut"\)/);
});

const layer = readFileSync("src/components/admin/shell/internal/keyboard-layer.tsx", "utf8");
const shell = readFileSync("src/components/admin/shell/internal/page-modules/WorkspaceShell.tsx", "utf8");

test("TUL-906: '?' opens only the shortcuts dialog (layer -> onOpenHelp), never the Ctrl+K palette", () => {
  assert.match(layer, /if \(e\.key === "\?"\) \{ onOpenHelp\(\); return; \}/);
  assert.match(shell, /onOpenHelp:\s+\(\) => setHelpOpen\(\(v\) => !v\)/);
  // The palette opener is bound to Cmd/Ctrl-K only.
  assert.match(shell, /onOpenPalette: \(\) => setSearchOpen\(true\)/);
  assert.match(palette, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === "k"/);
});

test("TUL-906: the help dialog closes on ONE Escape and the layer is inert while it is open", () => {
  assert.match(layer, /e\.key === "Escape" \|\| e\.key === "\?"\) onClose\(\)/);
  assert.match(shell, /isModalOpen:\s+!!state\.drawer\.drawerId \|\| helpOpen/);
  assert.match(shell, /<ShortcutHelpOverlay open=\{helpOpen\} onClose=\{\(\) => setHelpOpen\(false\)\} \/>/);
});
