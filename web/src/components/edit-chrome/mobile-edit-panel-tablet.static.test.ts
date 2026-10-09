import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-79 #12 (sweep a9277d1f7): at 1280 px the 'Tablet editing' panel (x 36-332)
// overlapped the centred tablet frame (x 223-1057). The tablet HUD now starts as
// its header only, with a Show/Hide toggle for the body; mobile editing is unchanged.
const src = readFileSync(join(process.cwd(), "src/components/edit-chrome/mobile-edit-panel.tsx"), "utf8");

test("the tablet HUD body starts hidden and is toggled by a header button", () => {
  assert.match(src, /const \[tabletBodyOpen, setTabletBodyOpen\] = useState\(false\);/);
  assert.match(src, /display: tabletHud && !tabletBodyOpen \? "none" : "flex"/);
  assert.match(src, /data-tablet-hud-toggle/);
  assert.match(src, /aria-expanded=\{tabletBodyOpen\}/);
});

test("mobile editing keeps its body always visible (the toggle is tablet-only)", () => {
  assert.match(src, /\{tabletHud \? \(\s*<button\s+type="button"\s+data-tablet-hud-toggle/);
  assert.doesNotMatch(src, /display: !tabletBodyOpen/);
});

test("the Show/Hide toggle labels go through the editor i18n (es: Mostrar / Ocultar)", () => {
  assert.match(src, /const \{ t \} = useEditorLocale\(\);\n\s*const ctx = |const ctx = useMaybeEditContext\(\);\n\s*const \{ t \} = useEditorLocale\(\);/);
  assert.match(src, /\{tabletBodyOpen \? t\("Hide"\) : t\("Show"\)\}/);
  assert.doesNotMatch(src, /\{tabletBodyOpen \? "Hide" : "Show"\}/);
  const catalog = readFileSync(join(process.cwd(), "src/components/edit-chrome/editor-i18n-es-publish.ts"), "utf8");
  assert.match(catalog, /"Show": "Mostrar"/);
  const inspectors = readFileSync(join(process.cwd(), "src/components/edit-chrome/editor-i18n-es-inspectors.ts"), "utf8");
  assert.match(inspectors, /Hide: "Ocultar"/);
});

test("the HUD header copy (title, subtitle, exit button, aria/title) goes through t() with Spanish rows", () => {
  for (const key of [
    "Tablet editing",
    "Mobile-first editing",
    "Mobile editing",
    "Hide and reorder apply to tablet",
    "Style edits scope to mobile",
    "Exit to desktop editing",
    "Exit tablet editing, back to desktop",
    "Exit mobile editing, back to desktop",
    "Exit",
  ]) {
    assert.ok(src.includes(`t("${key}")`), `${key} must be rendered through t()`);
    const catalog = readFileSync(join(process.cwd(), "src/components/edit-chrome/editor-i18n-es-publish.ts"), "utf8");
    assert.ok(catalog.includes(`"${key}": "`), `${key} needs a Spanish row`);
  }
  assert.doesNotMatch(src, /aria-label=\{tabletHud \? "Tablet editing"/);
  assert.doesNotMatch(src, /\{tabletHud \? "Tablet editing" : "Mobile editing"\}/);
});
