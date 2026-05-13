/**
 * P7A-6 / P7B regression coverage — Hero data-hero-layout attribute.
 *
 * The Component emits `data-hero-layout` based on the schema's `layout`
 * field. CSS rules in globals.css target this attribute to switch the
 * spatial composition. If we ever rename or drop this attribute, the
 * styling silently breaks but no other test catches it.
 *
 * This is a string-grep test on the source so it survives without
 * rendering React. The Component is server-rendered + uses many
 * dependencies that aren't easy to mock; the attribute presence is
 * the contract.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

test("hero/Component.tsx emits data-hero-layout attribute", () => {
  const componentSrc = readFileSync(resolve(here, "Component.tsx"), "utf-8");
  assert.ok(
    componentSrc.includes("data-hero-layout"),
    "Component must emit data-hero-layout for the CSS variant rules to work",
  );
});

test("hero/Component.tsx defaults data-hero-layout to 'centered' when unset", () => {
  // The default-value fallback is critical because rows written before
  // P7B don't have `layout` in their payload. CSS rules don't fire
  // unless the attribute is present with a value.
  const componentSrc = readFileSync(resolve(here, "Component.tsx"), "utf-8");
  assert.ok(
    componentSrc.includes('?? "centered"'),
    "data-hero-layout must default to 'centered' when layout is unset",
  );
});

test("hero/Editor.tsx includes the layout select with a11y attributes", () => {
  // Lock the a11y wiring from the polish commit (aria-describedby,
  // aria-label, role=status on the hint) so a future refactor of the
  // editor layout doesn't silently lose them.
  const editorSrc = readFileSync(resolve(here, "Editor.tsx"), "utf-8");
  assert.ok(editorSrc.includes("hero-layout-hint"), "hint id must be 'hero-layout-hint'");
  assert.ok(editorSrc.includes('aria-describedby="hero-layout-hint"'), "select must reference the hint");
  assert.ok(editorSrc.includes('aria-label="Hero layout variant"'), "select must have an aria-label");
});

test("globals.css contains data-hero-layout rules for both split variants", () => {
  // Path: sections/hero → sections → site-admin → lib → src → app/globals.css
  const cssPath = resolve(here, "../../../..", "app/globals.css");
  const css = readFileSync(cssPath, "utf-8");
  assert.ok(
    css.includes('data-hero-layout="split-left"'),
    "globals.css must include split-left rule",
  );
  assert.ok(
    css.includes('data-hero-layout="split-right"'),
    "globals.css must include split-right rule",
  );
});
