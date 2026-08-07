import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Guard for the `--token-color-background` → `--background` chain.
 *
 * THE BUG THIS PINS
 * ─────────────────
 * `globals.css` `.site-theme-tenant-override` used to declare
 *
 *     --impronta-black: var(--token-color-background, var(--impronta-black));
 *
 * The fallback references the property being declared. That is a cycle, and a
 * custom property in a cycle is invalid at computed-value time: it resolves to
 * the guaranteed-invalid value, i.e. EMPTY. `color.background` ships an EMPTY
 * default on purpose (see the spec on `color.background` in registry.ts), so on
 * every tenant that never customized its design the first arm was unset, the
 * cycle fired, and `--background: var(--impronta-black)` computed to "".
 *
 * Everything substituting those vars then fell back to its property's initial
 * value with no error anywhere. Measured on a starter tenant: the hero overlay
 * flavors `gradient-scrim` and `soft-vignette` both computed
 * `background-image: none` — the overlay element rendered and painted nothing,
 * which is how a storefront shipped with copy sitting unreadable on a photo.
 * `.site-hero__search` and `--site-ambient-base` were on the same chain.
 *
 * The fix is a literal fallback instead of a self-reference, kept equal to the
 * one `[data-theme-canvas-root]` paints so `--background` always names the
 * color the page canvas actually shows.
 */

const APP_DIR = path.join(process.cwd(), "src", "app");
const GLOBALS = fs.readFileSync(path.join(APP_DIR, "globals.css"), "utf8");
const TOKEN_PRESETS = fs.readFileSync(path.join(APP_DIR, "token-presets.css"), "utf8");

/** Strip `/* … *\/` comments so prose about the bug never satisfies a check. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Body of the first `.site-theme-tenant-override {…}` rule, comments removed. */
function tenantOverrideBlock(): string {
  const css = stripComments(GLOBALS);
  const start = css.indexOf(".site-theme-tenant-override {");
  assert.notEqual(start, -1, "globals.css must declare a `.site-theme-tenant-override` rule");
  const open = css.indexOf("{", start);
  const end = css.indexOf("}", open);
  assert.notEqual(end, -1, "`.site-theme-tenant-override` rule must be closed");
  return css.slice(open + 1, end);
}

/** Every `--prop: value;` declaration in a rule body. */
function declarations(block: string): Array<{ prop: string; value: string }> {
  const out: Array<{ prop: string; value: string }> = [];
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.push({ prop: m[1]!, value: m[2]!.replace(/\s+/g, " ").trim() });
  }
  return out;
}

/**
 * Self-references that exist today and are INERT only because their token has a
 * non-empty default in the `html {}` block of token-presets.css, so the fallback
 * arm is never taken. They are still latent cycles and should be converted to
 * literal fallbacks; they are listed here so this guard fails on anything NEW
 * rather than on pre-existing debt.
 */
const KNOWN_INERT_SELF_REFERENCES = new Set([
  "--impronta-gold",
  "--impronta-gold-bright",
  "--impronta-gold-dim",
  "--impronta-foreground",
  "--impronta-muted",
]);

/** The properties whose emptiness broke the storefront. */
const BACKGROUND_CHAIN_PROPS = ["--impronta-black", "--impronta-surface", "--site-ambient-base"];

test("`.site-theme-tenant-override` declares no NEW self-referential custom property", () => {
  const offenders = declarations(tenantOverrideBlock())
    .filter(({ prop, value }) => new RegExp(`var\\(\\s*${prop}\\b`).test(value))
    .map(({ prop }) => prop)
    .filter((prop) => !KNOWN_INERT_SELF_REFERENCES.has(prop));

  assert.deepEqual(
    offenders,
    [],
    `Self-referential custom property in .site-theme-tenant-override: ${offenders.join(", ")}. ` +
      "A var() fallback that names the property being declared is a cycle, so the declaration " +
      "resolves EMPTY whenever the first arm is unset. Use a literal fallback instead.",
  );
});

test("the background chain never self-references and always ends in a literal", () => {
  const decls = declarations(tenantOverrideBlock());

  for (const prop of BACKGROUND_CHAIN_PROPS) {
    const decl = decls.find((d) => d.prop === prop);
    assert.ok(decl, `.site-theme-tenant-override must declare ${prop}`);

    assert.ok(
      !new RegExp(`var\\(\\s*${prop}\\b`).test(decl.value),
      `${prop} must not reference itself in its own fallback (that is a cycle, and a cycle is EMPTY)`,
    );

    const match = /^var\(\s*--token-color-background\s*,\s*(#[0-9a-f]{3,8})\s*\)$/i.exec(decl.value);
    assert.ok(
      match,
      `${prop} must read var(--token-color-background, <literal hex>) so the chain resolves even ` +
        `when the tenant never set color.background. Found: ${decl.value}`,
    );
  }
});

test("the tenant-override fallback matches the color `[data-theme-canvas-root]` actually paints", () => {
  const decls = declarations(tenantOverrideBlock());
  const black = decls.find((d) => d.prop === "--impronta-black")!;
  const overrideFallback = /var\(\s*--token-color-background\s*,\s*(#[0-9a-f]{3,8})\s*\)/i
    .exec(black.value)![1]!
    .toLowerCase();

  const presets = stripComments(TOKEN_PRESETS);
  const canvasRule = /\[data-theme-canvas-root\]\s*\{([^}]*)\}/.exec(presets);
  assert.ok(canvasRule, "token-presets.css must keep the `[data-theme-canvas-root]` paint rule");
  const canvasFallback = /background-color:\s*var\(\s*--token-color-background\s*,\s*(#[0-9a-f]{3,8})\s*\)/i
    .exec(canvasRule[1]!)![1]!
    .toLowerCase();

  assert.equal(
    overrideFallback,
    canvasFallback,
    "`--background` on a tenant storefront must resolve to the same color the page canvas paints. " +
      "If these drift, --background names a color that is nowhere on screen and every color-mix " +
      "built on it (hero overlays, hero search) is wrong.",
  );
});

test("`--token-color-background` stays UNSET in the html defaults block", () => {
  // Unset is a load-bearing sentinel meaning "follow the active background mode":
  // the noir composition presets fall back to #100e13, the freeform mobile panel
  // to #0b0a0d, the anchor nav to transparent. Defaulting it here would flip all
  // of them. Consumers that need a concrete color supply their own literal.
  const presets = stripComments(TOKEN_PRESETS);
  const htmlBlock = /(^|\n)html\s*\{([^}]*)\}/.exec(presets);
  assert.ok(htmlBlock, "token-presets.css must keep its `html {}` token-defaults block");
  assert.ok(
    !/--token-color-background\s*:/.test(htmlBlock[2]!),
    "Do not default --token-color-background in the html block. Fix an empty --background by " +
      "giving the CONSUMER a literal fallback, not by defaulting the sentinel.",
  );
});
