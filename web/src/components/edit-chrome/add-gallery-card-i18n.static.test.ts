/**
 * add-gallery-card-i18n.static.test.ts — add-block gallery ES parity (FIX #7).
 *
 * The gallery CHROME (tabs, search field, headings, empty states) has been
 * translated since W2-C6, but the 55 item CARDS were not: `add-gallery-panel`
 * passed `item.label` and the short description straight through from the
 * section `meta.ts` files with no `t()`, so a Spanish operator saw a fully
 * Spanish frame around 55 English section names. FIX #7 wraps them in `t()`
 * inside `useGalleryCardState`.
 *
 * `editorT` falls back to the English input for anything it doesn't recognise,
 * which is the right runtime behaviour (tenant-authored and connected-source
 * items must still render) but means a MISSING translation is silent — the card
 * just quietly goes back to English. This test makes it loud: every `label` and
 * `description` in the section catalog must have an ES_TEXT entry.
 *
 * If you add a section, add its two strings to `editor-i18n-es.ts`.
 *
 * Test runner: node:test + node:assert/strict
 * Lives in edit-chrome (not next to the sections it scans) because it imports
 * the ES catalog, and `lib/site-admin` may not import `components/edit-chrome`
 * outside the allow-list — see the import-boundary guard in test:builder.
 *
 * Run:  npm run test:builder-chrome
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { ES_TEXT } from "./editor-i18n-es";

const HERE = dirname(fileURLToPath(import.meta.url));
const SECTIONS_ROOT = resolve(HERE, "../../lib/site-admin/sections");

/**
 * Pull the `label:` and `description:` string literals out of a `meta.ts`.
 *
 * Deliberately a text scan rather than an import: importing the section
 * registry drags in React components and server-only modules, which is exactly
 * the weight a static guard should avoid. The literals are simple and
 * hand-written, so a scan is reliable — it just has to cope with the
 * description sometimes wrapping onto the next line and sometimes containing
 * escaped double quotes (`directory`, `press_strip`).
 */
function readMetaCopy(text: string): { label?: string; description?: string } {
  const label = text.match(/^\s*label:\s*"((?:[^"\\]|\\.)*)"/m)?.[1];
  const description = text.match(
    /^\s*description:\s*\n?\s*"((?:[^"\\]|\\.)*)"/m,
  )?.[1];
  const unescape = (s?: string) =>
    s === undefined ? undefined : s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return { label: unescape(label), description: unescape(description) };
}

function metaFiles(): Array<{ section: string; text: string }> {
  const out: Array<{ section: string; text: string }> = [];
  for (const name of readdirSync(SECTIONS_ROOT)) {
    const dir = join(SECTIONS_ROOT, name);
    if (!statSync(dir).isDirectory()) continue;
    let text: string;
    try {
      text = readFileSync(join(dir, "meta.ts"), "utf8");
    } catch {
      continue; // not every subdirectory is a section (e.g. `shared`)
    }
    out.push({ section: name, text });
  }
  return out;
}

test("the section catalog actually has meta files to check", () => {
  // Guards the guard: a broken walk would make every assertion below vacuous.
  assert.ok(
    metaFiles().length >= 50,
    `expected 50+ section meta.ts files, found ${metaFiles().length}`,
  );
});

test("every add-block gallery card label + description has an ES translation", () => {
  const missing: string[] = [];
  for (const { section, text } of metaFiles()) {
    const { label, description } = readMetaCopy(text);
    for (const [field, value] of [
      ["label", label],
      ["description", description],
    ] as const) {
      if (!value) {
        missing.push(`${section}/meta.ts  (no ${field} literal found)`);
        continue;
      }
      const es = ES_TEXT[value];
      if (!es || !es.trim()) {
        missing.push(`${section}.${field}  "${value}"`);
      }
    }
  }
  assert.equal(
    missing.length,
    0,
    `Add-block gallery card copy is rendered through t() but these strings ` +
      `have no entry in editor-i18n-es.ts, so they silently fall back to ` +
      `English on a Spanish workspace. Add each one to ES_TEXT:\n` +
      missing.join("\n"),
  );
});

test("gallery card ES translations carry no em dashes (owner copy rule)", () => {
  const offenders: string[] = [];
  for (const { section, text } of metaFiles()) {
    const { label, description } = readMetaCopy(text);
    for (const value of [label, description]) {
      if (!value) continue;
      const es = ES_TEXT[value];
      if (es?.includes("—")) offenders.push(`${section}  "${es}"`);
    }
  }
  assert.equal(offenders.length, 0, `em dash in ES:\n${offenders.join("\n")}`);
});
