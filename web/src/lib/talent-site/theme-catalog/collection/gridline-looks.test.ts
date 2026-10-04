/**
 * Gridline Look layer (G2): five palettes, values equal the mockup's, every
 * button text and accent text meets AA through the derived accent-on / accent-text.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { designTokensToCssVars } from "@/lib/site-admin/tokens/resolve";

import { validateLook } from "../validate";
import { COLLECTION_DEFAULT_LOOK } from "./folio-looks";
import {
  GRIDLINE_BUILTIN_LOOKS,
  GRIDLINE_CUSTOM_START,
  GRIDLINE_DEFAULT_LOOK,
  GRIDLINE_PALETTES,
  gridlineCustomLook,
  gridlineLookTokensFromCode,
} from "./gridline-looks";

const MOCKUP = readFileSync(path.resolve(process.cwd(), "design-references/gridline/index.html"), "utf8");

function mockupPalette(id: string): Record<string, string> {
  const m = new RegExp(`${id}:\\{([^}]*)\\}`).exec(MOCKUP.slice(MOCKUP.indexOf("palettes:{")));
  assert.ok(m, `mockup palette ${id}`);
  return Object.fromEntries([...m[1].matchAll(/(\w+):'([^']*)'/g)].map((x) => [x[1], x[2]]));
}

const MOCKUP_ID: Record<string, string> = { default: "def", light: "light", dark: "dark", green: "green", orange: "orange" };

test("five palettes, in the mockup's order, each a valid Look", () => {
  assert.deepEqual(GRIDLINE_PALETTES.map((p) => p.key), ["default", "light", "dark", "green", "orange"]);
  for (const look of GRIDLINE_BUILTIN_LOOKS) {
    const check = validateLook(look.buildPayload());
    assert.deepEqual(check.errors, [], look.slug);
    assert.equal(check.ok, true, look.slug);
  }
  assert.equal(COLLECTION_DEFAULT_LOOK.gridline, GRIDLINE_DEFAULT_LOOK);
  assert.ok(gridlineLookTokensFromCode(GRIDLINE_DEFAULT_LOOK));
  assert.equal(gridlineLookTokensFromCode("gridline-nope"), null);
  assert.deepEqual(gridlineLookTokensFromCode("green"), gridlineLookTokensFromCode("gridline-green"));
});

test("palette values equal the mockup's, and no hex is stored for accent-on / accent-text", () => {
  for (const p of GRIDLINE_PALETTES) {
    const m = mockupPalette(MOCKUP_ID[p.key]);
    const t = gridlineLookTokensFromCode(p.key)!;
    assert.equal(t["color.background"], m.bg.toUpperCase(), p.key);
    assert.equal(t["color.surface-raised"], m.surface.toUpperCase(), p.key);
    assert.equal(t["color.ink"], m.ink.toUpperCase(), p.key);
    assert.equal(t["color.muted"], m.mute.toUpperCase(), p.key);
    assert.equal(t["color.line"], m.line.toUpperCase(), p.key);
    assert.equal(t["color.accent"], m.accent.toUpperCase(), p.key);
    assert.equal(t["color.blush"], m.tint.toUpperCase(), p.key);
    assert.equal(t["color.accent-text"], undefined);
    assert.equal(t["color.accent-on"], undefined);
  }
});

function derived(tokens: Record<string, string>) {
  const vars = designTokensToCssVars(tokens);
  return { on: vars["--token-color-accent-on"]!, text: vars["--token-color-accent-text"]! };
}

test("every palette: button text is AA on the accent, accent text is AA on the surface and the page", () => {
  for (const p of GRIDLINE_PALETTES) {
    const t = gridlineLookTokensFromCode(p.key)!;
    const { on, text } = derived(t);
    assert.ok(on && text, `${p.key} derives both`);
    assert.ok((contrastRatio(on, t["color.accent"]) ?? 0) >= 4.5, `${p.key} accent-on ${on}`);
    assert.ok((contrastRatio(text, t["color.surface-raised"]) ?? 0) >= 4.5, `${p.key} accent-text ${text} on surface`);
    assert.ok((contrastRatio(text, t["color.background"]) ?? 0) >= 4.5, `${p.key} accent-text ${text} on page`);
    // Body copy too: ink and muted on the page.
    assert.ok((contrastRatio(t["color.ink"], t["color.background"]) ?? 0) >= 7, `${p.key} ink`);
    assert.ok((contrastRatio(t["color.muted"], t["color.background"]) ?? 0) >= 4.5, `${p.key} muted`);
  }
});

test("the custom start colour works through the same Look layer and stays AA", () => {
  const custom = gridlineCustomLook();
  const check = validateLook(custom);
  assert.equal(check.ok, true, check.errors.join(","));
  assert.equal(custom.tokens["color.accent"], GRIDLINE_CUSTOM_START);
  for (const accent of [GRIDLINE_CUSTOM_START, "#FFFF00", "#6D28D9", "#F4D7E2"]) {
    const t = gridlineCustomLook(accent).tokens as Record<string, string>;
    const { on, text } = derived(t);
    assert.ok((contrastRatio(on, accent) ?? 0) >= 4.5, `${accent} on`);
    assert.ok((contrastRatio(text, t["color.surface-raised"]) ?? 0) >= 4.5, `${accent} text`);
    assert.match(t["color.blush"], /^#[0-9A-F]{6}$/);
  }
});
