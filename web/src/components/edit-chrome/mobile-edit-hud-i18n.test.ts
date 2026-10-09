import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { editorT } from "./editor-i18n";
import { CANVAS_FLOATING_BAR } from "./kit/tokens";

const PANEL = join(
  process.cwd(),
  "src/components/edit-chrome/mobile-edit-panel.tsx",
);

const HUD_KEYS = [
  "Tablet editing",
  "Mobile editing",
  "Mobile-first editing",
  "Hide and reorder apply to tablet",
  "Style edits scope to mobile",
  "Exit to desktop editing",
  "Exit tablet editing, back to desktop",
  "Exit mobile editing, back to desktop",
  "Exit",
] as const;

test("TUL-456: tablet HUD English keys translate for ES editor chrome", () => {
  assert.equal(
    editorT("Hide and reorder apply to tablet", "es"),
    "Ocultar y reordenar se aplican a la tableta",
  );
  assert.equal(editorT("Tablet editing", "es"), "Edición en tableta");
  assert.equal(editorT("Mobile editing", "es"), "Edición móvil");
  assert.equal(
    editorT("Style edits scope to mobile", "es"),
    "Los cambios de estilo se aplican al móvil",
  );
  assert.equal(editorT("Exit", "es"), "Salir");
  for (const key of HUD_KEYS) {
    assert.equal(editorT(key, "en"), key);
    assert.notEqual(editorT(key, "es"), key);
  }
});

test("TUL-456: MobileEditPanel wraps HUD banner copy in t()", () => {
  const src = readFileSync(PANEL, "utf8");
  assert.match(src, /const \{ t \} = useEditorLocale\(\)/);
  assert.match(src, /t\("Hide and reorder apply to tablet"\)/);
  assert.match(src, /t\("Tablet editing"\)/);
  assert.doesNotMatch(src, /\? "Hide and reorder apply to tablet"/);
});

test("TUL-456: mobile-edit HUD sits above the zoom bar (no 768 overlap)", () => {
  const src = readFileSync(PANEL, "utf8");
  assert.match(src, /CANVAS_FLOATING_BAR/);
  assert.match(src, /PANEL_BOTTOM/);
  // Style must use PANEL_BOTTOM, not a hard-coded band shared with the zoom bar.
  assert.match(src, /bottom:\s*PANEL_BOTTOM\b/);
  assert.doesNotMatch(src, /bottom:\s*18,/);
  // Same clearance recipe as the nested-blocks popover: bar bottom + height + 8.
  const expected =
    CANVAS_FLOATING_BAR.bottom + CANVAS_FLOATING_BAR.height + 8;
  assert.equal(expected, 120);
  assert.match(
    src,
    /CANVAS_FLOATING_BAR\.bottom \+ CANVAS_FLOATING_BAR\.height \+ 8/,
  );
});
