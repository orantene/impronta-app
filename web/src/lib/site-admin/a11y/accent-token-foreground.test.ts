/**
 * A11Y — accent token foreground gate.
 *
 * THE BUG THIS PINS
 * ─────────────────
 * `--accent` is a translucent SURFACE tint in every scope that defines it
 * (~4% to 14% alpha: `rgba(23, 23, 23, 0.06)` at `:root`, and on a storefront
 * `color-mix(in oklab, var(--token-color-accent) 14%, transparent)`). It exists
 * to back `bg-accent` washes and hover states.
 *
 * The directory header's favorites / inquiry count badge read it as a
 * FOREGROUND: `text-[var(--accent)]` + `border-[var(--accent)]` on a `bg-black`
 * pill. Measured live on a seeded storefront, the digit painted
 * `oklab(0.684673 -0.0798082 -0.12445 / 0.14)` — a 14%-alpha color on solid
 * black, i.e. an invisible number inside a 20x30px black blob. The owner
 * reported it as a design bug that "keeps occurring everywhere", because any
 * consumer reading the tint as a foreground disappears the same way.
 *
 * The fix is a named pair: `--accent` stays the tint, `--accent-solid` is its
 * fully opaque sibling for text / icons / borders / rings. These tests keep the
 * two halves from drifting back together.
 *
 * Pure static analysis over the CSS + component sources: no DOM, no React, no
 * Supabase, and no import of `edit-chrome` (this file lives under
 * `lib/site-admin/**`, where that import is a frozen-cycle violation).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { contrastRatio } from "./contrast";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const CSS_SOURCES = [
  "src/app/globals.css",
  "src/app/token-presets.css",
] as const;

const HEADER_ACTIONS = "src/components/directory/directory-discovery-header-actions.tsx";

/** The pill the count badge paints itself on (`bg-black`). */
const BADGE_BACKGROUND = "#000000";

/**
 * Contrast floor for the badge digit against its own pill. 3.0:1 is the WCAG
 * non-text / large-text floor; the digit is 10px bold mono, so this is a
 * legibility floor rather than a full AA text claim. The point of the number is
 * that 0.14-alpha-on-black scored ~1.1:1 and shipped.
 */
const BADGE_CONTRAST_FLOOR = 3;

/**
 * Scopes whose `--accent-solid` can actually paint the count badge: the public
 * storefront themes and background-mode presets. Admin / dashboard / platform
 * scopes are light-canvas surfaces that never render this header, so their
 * accent is correctly a dark ink and is not measured against a black pill.
 */
const STOREFRONT_SCOPE_HINTS = [
  "site-theme-dark",
  "site-theme-tenant-override",
  "editorial-noir",
  "noir-or",
  "espresso",
  "atelier-blanc",
];

type Declaration = { selector: string; property: string; value: string; file: string };

/**
 * Minimal CSS block scanner: walks braces tracking the nearest selector text and
 * emits every custom-property declaration with the block it came from. Good
 * enough for these two hand-written token files, and it cannot silently pass by
 * finding nothing (the tests assert non-empty result sets).
 */
function readDeclarations(file: string): Declaration[] {
  const source = readFileSync(path.join(WEB_ROOT, file), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const out: Declaration[] = [];
  const stack: string[] = [];
  let buffer = "";

  for (const char of source) {
    if (char === "{") {
      stack.push(buffer.trim().replace(/\s+/g, " "));
      buffer = "";
    } else if (char === "}") {
      stack.pop();
      buffer = "";
    } else if (char === ";") {
      const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buffer);
      if (match) {
        out.push({
          selector: stack[stack.length - 1] ?? "",
          property: match[1],
          value: match[2].trim().replace(/\s+/g, " "),
          file,
        });
      }
      buffer = "";
    } else {
      buffer += char;
    }
  }
  return out;
}

const declarations = CSS_SOURCES.flatMap(readDeclarations);

/** Group declarations by the exact block they were declared in. */
function blocksDeclaring(property: string): Declaration[] {
  return declarations.filter((d) => d.property === property);
}

// ── 1. The pair never drifts: a tint without its solid sibling is the bug ────

test("every scope that defines --accent also defines --accent-solid", () => {
  const tints = blocksDeclaring("--accent");
  assert.ok(
    tints.length >= 10,
    `expected the accent tint to be defined in many scopes, found ${tints.length} (scanner broken?)`,
  );

  const solidKeys = new Set(
    blocksDeclaring("--accent-solid").map((d) => `${d.file}::${d.selector}`),
  );

  const orphans = tints
    .filter((d) => !solidKeys.has(`${d.file}::${d.selector}`))
    .map((d) => `${d.file} { ${d.selector} }`);

  assert.deepStrictEqual(
    orphans,
    [],
    `These scopes re-pin the translucent --accent tint but not its opaque --accent-solid sibling, so any foreground reading the accent there falls back to a different scope's hue:\n  ${orphans.join("\n  ")}`,
  );
});

// ── 2. --accent-solid is SOLID. This is the root-cause pin. ──────────────────

test("every --accent-solid value is fully opaque", () => {
  const solids = blocksDeclaring("--accent-solid");
  assert.ok(solids.length >= 10, `expected --accent-solid in many scopes, found ${solids.length}`);

  const translucent = solids
    .filter((d) => {
      const value = d.value.toLowerCase();
      if (value.includes("transparent")) return true;
      // rgba()/hsla() with an alpha argument below 1.
      const alpha = /\b(?:rgba|hsla)\([^)]*?,\s*(0?\.\d+|0)\s*\)/.exec(value);
      if (alpha) return true;
      // #rrggbbaa / #rgba shorthand with a non-opaque alpha channel.
      if (/#[0-9a-f]{8}\b/.test(value) && !/#[0-9a-f]{6}ff\b/.test(value)) return true;
      if (/#[0-9a-f]{4}\b(?![0-9a-f])/.test(value) && !/#[0-9a-f]{3}f\b/.test(value)) return true;
      return false;
    })
    .map((d) => `${d.file} { ${d.selector} } --accent-solid: ${d.value}`);

  assert.deepStrictEqual(
    translucent,
    [],
    `--accent-solid must be opaque; it is the FOREGROUND half of the pair. Translucent values reintroduce the invisible-badge bug:\n  ${translucent.join("\n  ")}`,
  );
});

// ── 3. The badge digit is legible on its own pill ───────────────────────────

test("storefront --accent-solid values clear the badge contrast floor on black", () => {
  const measured = blocksDeclaring("--accent-solid").filter(
    (d) =>
      STOREFRONT_SCOPE_HINTS.some((hint) => d.selector.includes(hint)) &&
      d.value.startsWith("#"),
  );

  assert.ok(
    measured.length >= 4,
    `expected several literal storefront accent colors to measure, found ${measured.length}`,
  );

  for (const d of measured) {
    const ratio = contrastRatio(d.value, BADGE_BACKGROUND);
    assert.ok(ratio !== null, `could not parse ${d.value} in ${d.selector}`);
    assert.ok(
      ratio! >= BADGE_CONTRAST_FLOOR,
      `${d.file} { ${d.selector} } --accent-solid: ${d.value} scores ${ratio!.toFixed(2)}:1 on the black count-badge pill, below the ${BADGE_CONTRAST_FLOOR}:1 floor.`,
    );
  }
});

// ── 4. The call site that shipped the bug cannot regress ────────────────────

test("the directory header never reads the accent tint as a foreground", () => {
  const source = readFileSync(path.join(WEB_ROOT, HEADER_ACTIONS), "utf8");

  for (const pattern of [
    "text-[var(--accent)]",
    "border-[var(--accent)]",
    "fill-[var(--accent)]",
    "ring-[var(--accent)]",
  ]) {
    assert.ok(
      !source.includes(pattern),
      `${HEADER_ACTIONS} uses ${pattern}. --accent is a ~6-14% alpha surface tint; use var(--accent-solid) for foregrounds.`,
    );
  }
});

test("the count badge paints its digit and border with the opaque accent", () => {
  const source = readFileSync(path.join(WEB_ROOT, HEADER_ACTIONS), "utf8");

  // Both badges (favorites count and inquiry count) share one class string.
  const badges = source.match(/className="absolute -right-0\.5 -top-0\.5[^"]*"/g) ?? [];
  assert.strictEqual(
    badges.length,
    2,
    "expected the favorites and inquiry count badges; the class string moved, re-point this guard",
  );

  for (const badge of badges) {
    assert.ok(
      badge.includes("text-[var(--accent-solid)]"),
      `count badge digit must use the opaque accent, got: ${badge}`,
    );
    assert.ok(
      badge.includes("border-[var(--accent-solid)]"),
      `count badge border must use the opaque accent, got: ${badge}`,
    );
    assert.ok(
      badge.includes("bg-black"),
      `count badge is expected to sit on the black pill this guard measures against, got: ${badge}`,
    );
  }
});
