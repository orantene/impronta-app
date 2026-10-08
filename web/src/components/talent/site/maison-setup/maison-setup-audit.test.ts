/**
 * Maison setup mockup-vs-code audit fixes (P0/P1). Pure helpers are exercised
 * directly; UI wiring is pinned with source contracts, matching the
 * maison-setup.static.test.ts style for this folder.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { liveCardPaletteName } from "./maison-live-summary";
import { maisonSetupT } from "./maison-setup-copy";

const ROOT = join(process.cwd(), "src/components/talent/site/maison-setup");
const read = (name: string) => readFileSync(join(ROOT, name), "utf8");

// ── P0 #1: nothing renders under the live My website card ────────────────
test("P0: live site + nothing opened → host renders nothing; Change design opens it", async () => {
  // The host module is a client component; import only its pure gate.
  const src = read("MaisonSetupHost.tsx");
  assert.match(src, /export function shouldRenderMaisonSetup/);
  assert.match(src, /if \(!shouldRenderMaisonSetup\(\{ siteLive, explicitOpen \}\)\) return null;/);
  assert.match(src, /setExplicitOpen\(true\)/);
  const gate = (siteLive: boolean, explicitOpen: boolean) => !siteLive || explicitOpen;
  assert.equal(gate(true, false), false);
  assert.equal(gate(true, true), true);
  assert.equal(gate(false, false), true);
});

test("P0/P1: host stays hidden while live (or before Activate); gallery hidden when live", () => {
  const manager = readFileSync(
    join(process.cwd(), "src/components/talent/site/TalentMaxSiteManager.tsx"),
    "utf8",
  );
  assert.match(manager, /const hostHidden = maisonLive \|\| !setupOpen;/);
  assert.match(manager, /siteLive=\{hostHidden\}/);
  assert.match(manager, /\{hostHidden \|\| maisonSetupEnabled \? null : \(\s*<>\s*<ManagerThemeGallery/);
  // P1: live card for ANY published design slug, not only "maison".
  assert.match(manager, /const maisonLive = Boolean\(state\.sitePublishedAt\);/);
  assert.doesNotMatch(manager, /themeDesignSlug === "maison"/);
  // P1: the old 5-template starter gallery is gone.
  assert.doesNotMatch(manager, /TemplateGallery|Choose a starter template/);
});

// ── P1 #3: real Undo controls ────────────────────────────────────────────
test("P1: apply toast has a real Undo button, not 'Use Undo on Review' text", () => {
  const host = read("MaisonSetupHost.tsx");
  assert.doesNotMatch(host, /Use Undo on Review/);
  assert.match(host, /<MaisonUndoToast/);
  assert.match(host, /"Design applied to your draft"/);
  const toast = read("MaisonUndoToast.tsx");
  assert.match(toast, /undoMaisonDesignAction/);
  assert.match(toast, /<button/);
  assert.match(toast, /maisonSetupT\(locale, "Undo"\)/);
});

test("P1: Design options reset/reapply toasts carry Undo; restore toast lifted to host", () => {
  const panel = read("DesignOptionsPanel.tsx");
  assert.doesNotMatch(panel, /· Undo"/);
  assert.match(panel, /<MaisonUndoToast/);
  assert.match(panel, /"Colors reset to draft"\),\s*true,/);
  assert.match(panel, /"Demo layout reapplied"\),\s*true,/);
  // restore no longer sets a toast inside the panel (it unmounts)
  assert.doesNotMatch(panel, /Previous design restored/);
  const host = read("MaisonSetupHost.tsx");
  // F58: only a real restore toasts; a resume-forced review is read-only.
  assert.match(host, /if \(forceScreen === "review" && !resume\) setToast\("restored"\)/);
  assert.match(host, /"Previous design restored to your draft"/);
});

test("P1: toast copy has ES translations and no em dashes", () => {
  for (const key of [
    "Design applied to your draft",
    "Previous design restored to your draft",
    "Colors reset to draft",
    "Demo layout reapplied",
    "Demo only · nothing was booked",
  ]) {
    const es = maisonSetupT("es", key);
    assert.notEqual(es, key, `missing ES for ${key}`);
    assert.doesNotMatch(es + key, /—/);
  }
  assert.equal(maisonSetupT("es", "Demo only · nothing was booked"), "Solo demo · no se reservó nada");
});

// ── P1 #4: custom palette name on the live card ──────────────────────────
test("P1: live card shows saved custom palette name, default My colors / Mis colores", () => {
  assert.equal(liveCardPaletteName("en", null, null), "My colors");
  assert.equal(liveCardPaletteName("es", null, null), "Mis colores");
  const custom = {
    name: { en: "Chef night", es: "Noche chef" },
    fields: { page: "#fff", text: "#111", accent: "#a00", section: "#eee" },
    derived: { rule: "#ddd", on_accent: "#fff" },
  };
  assert.equal(liveCardPaletteName("en", null, custom), "Chef night");
  assert.equal(liveCardPaletteName("es", null, custom), "Noche chef");
  assert.notEqual(liveCardPaletteName("en", null, null), "Colors");
  const card = read("MyWebsiteCard.tsx");
  assert.match(card, /paletteDisplayName\(\{/);
});

// ── P1 #5: live-stays line at all widths ─────────────────────────────────
test("P1: 'live site stays' line is not hidden below lg", () => {
  // The pill lives in the detail header (ThemeDetailChrome), not the screen.
  const src = read("ThemeDetailChrome.tsx");
  const idx = src.indexOf('data-testid="maison-live-stays-pill"');
  assert.ok(idx > 0);
  const cls = src.slice(idx, idx + 200);
  assert.doesNotMatch(cls, /\bhidden\b/);
  assert.doesNotMatch(cls, /lg:inline/);
});

// ── P1 #6: no browser confirm on Undo import ─────────────────────────────
test("P1: Undo import is an inline choice, keep edited drafts is the default", () => {
  const src = read("ImportStarterPanel.tsx");
  assert.doesNotMatch(src, /window\.confirm/);
  assert.match(src, /maison-import-undo-choice/);
  const keepIdx = src.indexOf('data-testid="maison-import-undo-keep-edited"');
  const removeIdx = src.indexOf('data-testid="maison-import-undo-remove-all"');
  assert.ok(keepIdx > 0 && removeIdx > keepIdx, "keep edited is first");
  const keepBlock = src.slice(keepIdx, removeIdx);
  assert.match(keepBlock, /autoFocus/);
  assert.match(keepBlock, /handleUndo\(false\)/);
});
