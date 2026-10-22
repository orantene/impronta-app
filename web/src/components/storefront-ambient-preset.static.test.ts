import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * TUL-1934 — the tenant storefront ambient layer and the header CTA pair must
 * follow the active preset, for every tenant (not only s2-agencia).
 */
const ROOT = process.cwd();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const GLOBALS = strip(fs.readFileSync(path.join(ROOT, "src", "app", "globals.css"), "utf8"));
const HEADER = fs.readFileSync(path.join(ROOT, "src", "components", "public-header.tsx"), "utf8");

function ambientRuleSelector(): string {
  const i = GLOBALS.indexOf("background-attachment: fixed");
  assert.notEqual(i, -1, "ambient rule must still exist");
  const open = GLOBALS.lastIndexOf("{", i);
  const prevClose = GLOBALS.lastIndexOf("}", open);
  return GLOBALS.slice(prevClose + 1, open).replace(/\s+/g, " ").trim();
}

test("(1) ambient aurora is skipped for plain / absent background.mode", () => {
  const sel = ambientRuleSelector();
  assert.match(sel, /html\[data-token-background-mode\]/, "needs the attribute present");
  assert.match(sel, /:not\(\[data-token-background-mode="plain"\]\)/, "must exclude plain");
  assert.match(sel, /body\.site-theme-tenant-override > div\.bg-background/);
});

test("(1) ambient glows stay derived from the preset's colour tokens", () => {
  for (const t of ["--token-color-primary", "--token-color-accent", "--token-color-secondary"]) {
    assert.ok(GLOBALS.includes(`var(${t},`), `glow must read ${t}`);
  }
});

test("(2) header CTA safe pair uses primary + primary-on, not the neutral foreground", () => {
  const m = HEADER.match(/const ctaSafePairClass = ctaNeedsSafePair\s*\?\s*"([^"]*)"/);
  assert.ok(m, "ctaSafePairClass must be defined");
  const cls = m![1]!;
  assert.match(cls, /bg-\[var\(--token-color-primary,/);
  assert.match(cls, /text-\[var\(--token-color-primary-on,/);
  assert.doesNotMatch(cls, /bg-foreground/, "bg-foreground maps to neutral #737373");
});
