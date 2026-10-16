import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

import {
  STYLE_BINDABLE_COLOR_TOKENS,
  STYLE_BINDABLE_FONT_FAMILY_TOKENS,
  STYLE_BINDABLE_RADIUS_TOKENS,
} from "@/lib/site-admin/builder-node/style-token-bindings";

import { ES_TEXT } from "./editor-i18n-es";
import { ES_THEME_DRAWER_TEXT } from "./editor-i18n-es-theme-drawer";

/**
 * TUL-542 — the talent theme editor (Diseño → Tema) rendered mostly English on
 * a Spanish dashboard: tabs, labels, contrast messages, Discard / Save /
 * Publish. `editorT` falls back to English when a key is missing, and the
 * generic parity guard only sees strings that were already wrapped in `t()`.
 * This guard scans the drawer's sources for user-facing English literals
 * (label/hint/title/sub/info/placeholder props, JSX text, ternary strings) and
 * requires (a) an ES entry for each and (b) that the file resolves the locale.
 */

const DIR = join(process.cwd(), "src/components/edit-chrome");
const FILES = [
  "theme-drawer.tsx",
  "ContrastChecker.tsx",
  "custom-accent-card.tsx",
  "component-defaults-tab.tsx",
  "GoogleFontPicker.tsx",
  "BrandKitImport.tsx",
  "MeshGradientGenerator.tsx",
];

/** Identical in both languages (tokens, units, proper nouns, glyphs). */
const SAME_IN_ES = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6", "Aa", "CSS", "JSON", "Mesh", "Atelier Blanc",
  "Espresso", "Noir & Or", "Cinzel editorial", "Google Fonts", "Promise", "Google",
]);

const PROP =
  /\b(?:label|hint|title|sub|info|content|placeholder|description|tip|aria-label|floatLabel|text|caption|message|error)\s*[:=]\s*\{?\s*(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;
const TERNARY = /(?:\?|:|\|\||&&)\s*(["'])([A-Z][^"'\n]*?)\1/g;
const JSX_TEXT = />\s*([^<>{}=;\n][^<>{}]*?)\s*</g;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function looksEnglish(s: string): boolean {
  if (!/[A-Za-z]{3}/.test(s)) return false;
  if (/^[a-z0-9_.\-/#:]+$/.test(s)) return false; // tokens, ids, css, urls
  if (/[=;{}]|=>|^\w+\(|px|rem|var\(|clamp\(/.test(s)) return false;
  if (!/^[A-Z⚠"“¿¡'0-9]/.test(s)) return false;
  return true;
}

function candidates(file: string): string[] {
  const code = blankComments(readFileSync(join(DIR, file), "utf8"));
  const out = new Set<string>();
  for (const re of [PROP, TERNARY, JSX_TEXT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const raw = re === JSX_TEXT ? m[1] : m[2];
      if (raw.includes("${")) continue;
      const s = norm(raw);
      if (looksEnglish(s)) out.add(s);
    }
  }
  return [...out].sort();
}

test("theme drawer sources have no untranslated user-facing English", () => {
  const missing: string[] = [];
  for (const f of FILES) {
    for (const s of candidates(f)) {
      if (SAME_IN_ES.has(s)) continue;
      if (!(s in ES_TEXT)) missing.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(missing, [], `untranslated:\n${missing.join("\n")}`);
});

test("bindable token labels shown in the Components tab have ES entries", () => {
  const missing = [
    ...STYLE_BINDABLE_COLOR_TOKENS,
    ...STYLE_BINDABLE_FONT_FAMILY_TOKENS,
    ...STYLE_BINDABLE_RADIUS_TOKENS,
  ]
    .map((tok) => tok.label.replace(" \u2014 ", ": "))
    .filter((l) => !(l in ES_TEXT));
  assert.deepEqual(missing, []);
});

test("every theme drawer file resolves the editor locale", () => {
  for (const f of ["theme-drawer.tsx", "ContrastChecker.tsx", "GoogleFontPicker.tsx",
    "BrandKitImport.tsx", "MeshGradientGenerator.tsx", "component-defaults-tab.tsx"]) {
    const code = blankComments(readFileSync(join(DIR, f), "utf8"));
    assert.match(code, /useEditorLocale\(\)/, `${f} must call useEditorLocale()`);
  }
});

test("ES entries for the theme drawer carry no em dashes", () => {
  for (const [k, v] of Object.entries(ES_TEXT)) {
    if (FILES.length && /theme|contrast|WCAG/i.test(k)) assert.ok(!v.includes("—"), k);
  }
});
