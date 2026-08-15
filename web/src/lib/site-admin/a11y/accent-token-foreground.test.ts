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
 * The directory header's favorites / inquiry count badge originally read it as
 * a FOREGROUND: `text-[var(--accent)]` + `border-[var(--accent)]` on a
 * `bg-black` pill. Measured live on a seeded storefront, the digit painted
 * `oklab(0.684673 -0.0798082 -0.12445 / 0.14)` — a 14%-alpha color on solid
 * black, i.e. an invisible number inside a 20x30px black blob.
 *
 * PR #1043 introduced `--accent-solid` (the opaque sibling) and moved the
 * badge's text/border onto it, but left the pill itself hardcoded `bg-black`.
 * `--accent-solid` is an ARBITRARY per-tenant hue (`.site-theme-tenant-override`
 * maps it straight to the operator's chosen `--token-color-accent`, with no
 * coordination to any background), so a hardcoded black pill still fails AA
 * for plenty of real tenant colors — measured against a real reported case
 * (sky blue `rgb(14,165,233)`, the "dark blob" tenant), it actually verifies
 * a bright badge digit yet still reads as a jarring, theme-mismatched blob
 * because the fill never adapts to the tenant's canvas. There is also no
 * token in this codebase that computes a guaranteed-contrast foreground for
 * an arbitrary tenant hex, so "solid tenant-accent pill + fixed digit color"
 * is unsafe in EITHER direction (accent-as-text needs a fixed-contrast bg,
 * accent-as-bg needs a fixed-contrast text, and neither exists for an
 * unbounded hue).
 *
 * The follow-up fix (`CountBadge`, `src/components/ui/count-badge.tsx`) stops
 * using the tenant accent for the pill's fill or text entirely. It uses
 * `bg-background` + `text-foreground` — the same pair every other piece of
 * body copy on the page already depends on for AA contrast in every theme
 * scope — and confines `--accent-solid` to the border ring only, which is
 * decorative brand identity, not a legibility-critical AA target.
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
const SAVED_ENTRY_BUTTON = "src/components/directory/saved-entry-button.tsx";
const COUNT_BADGE = "src/components/ui/count-badge.tsx";

/**
 * AA floor for the badge digit (10px semibold — not "large text" by the
 * WCAG size exemption, so the small-text 4.5:1 threshold applies).
 */
const BADGE_AA_FLOOR = 4.5;

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

// ── 2. --accent-solid is SOLID. Still the root-cause pin for the tint bug. ───

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
    `--accent-solid must be opaque; consumers (e.g. a badge border) still expect a solid ring, not a wash. Translucent values reintroduce that failure mode:\n  ${translucent.join("\n  ")}`,
  );
});

// ── 3. The pair CountBadge actually relies on clears real AA everywhere ──────

test("every --background / --foreground scope pair clears AA (4.5:1)", () => {
  const backgrounds = blocksDeclaring("--background");
  const foregrounds = new Map(
    blocksDeclaring("--foreground").map((d) => [`${d.file}::${d.selector}`, d]),
  );

  const literalBackgrounds = backgrounds.filter((d) => /^#[0-9a-f]{3,8}$/i.test(d.value.trim()));
  assert.ok(
    literalBackgrounds.length >= 3,
    `expected several literal --background scopes to measure, found ${literalBackgrounds.length}`,
  );

  const failures: string[] = [];
  for (const bg of literalBackgrounds) {
    const fg = foregrounds.get(`${bg.file}::${bg.selector}`);
    if (!fg || !/^#[0-9a-f]{3,8}$/i.test(fg.value.trim())) continue; // var()-chained, skip: not a literal pair to score here
    const ratio = contrastRatio(fg.value.trim(), bg.value.trim());
    if (ratio === null || ratio < BADGE_AA_FLOOR) {
      failures.push(
        `${bg.file} { ${bg.selector} } --foreground: ${fg.value} on --background: ${bg.value} scores ${ratio?.toFixed(2) ?? "?"}:1, below the ${BADGE_AA_FLOOR}:1 AA floor`,
      );
    }
  }

  assert.deepStrictEqual(
    failures,
    [],
    `CountBadge (src/components/ui/count-badge.tsx) paints its digit with bg-background + text-foreground specifically because this pair is guaranteed AA in every scope. A failure here means that guarantee broke:\n  ${failures.join("\n  ")}`,
  );
});

// ── 4. Nothing in the count-badge chain reads the accent TINT as a foreground

test("the count-badge chain never reads the accent tint as a foreground", () => {
  for (const file of [HEADER_ACTIONS, SAVED_ENTRY_BUTTON, COUNT_BADGE]) {
    const source = readFileSync(path.join(WEB_ROOT, file), "utf8");
    for (const pattern of [
      "text-[var(--accent)]",
      "border-[var(--accent)]",
      "fill-[var(--accent)]",
      "ring-[var(--accent)]",
      "bg-[var(--accent)]",
    ]) {
      assert.ok(
        !source.includes(pattern),
        `${file} uses ${pattern}. --accent is a ~6-14% alpha surface tint; use var(--accent-solid) for foregrounds/borders.`,
      );
    }
  }
});

// ── 5. The call site that shipped the bug cannot regress ────────────────────

test("the count badge never paints a hardcoded black pill", () => {
  for (const file of [HEADER_ACTIONS, SAVED_ENTRY_BUTTON, COUNT_BADGE]) {
    const source = readFileSync(path.join(WEB_ROOT, file), "utf8");
    assert.ok(
      !source.includes("bg-black"),
      `${file} uses bg-black on the count badge. A hardcoded black pill ignores the tenant's theme and has no guaranteed contrast against an arbitrary --accent-solid hue (measured: sky blue rgb(14,165,233) is only 2.77:1 against white but 7.58:1 against black — no single fixed fill is safe for every tenant). Use the CountBadge primitive's bg-background instead.`,
    );
  }
});

test("the header/saved-entry badges route through the shared CountBadge primitive", () => {
  for (const file of [HEADER_ACTIONS, SAVED_ENTRY_BUTTON]) {
    const source = readFileSync(path.join(WEB_ROOT, file), "utf8");
    assert.ok(
      source.includes("<CountBadge"),
      `${file} no longer renders <CountBadge>. This class of bug (per-site bespoke badge styling) is meant to be fixed once in src/components/ui/count-badge.tsx and reused, not patched inline per call site.`,
    );
  }
});

test("CountBadge paints its fill and digit with the guaranteed-contrast background/foreground pair, accent stays on the border", () => {
  const source = readFileSync(path.join(WEB_ROOT, COUNT_BADGE), "utf8");
  assert.ok(source.includes("bg-background"), `${COUNT_BADGE} must fill with bg-background.`);
  assert.ok(source.includes("text-foreground"), `${COUNT_BADGE} must paint its digit with text-foreground.`);
  assert.ok(
    source.includes("border-[var(--accent-solid)]"),
    `${COUNT_BADGE} must default the border ring to the tenant accent (border-[var(--accent-solid)]) for brand identity — only the border, never the fill or text.`,
  );
  // The accent must not show up as a fill or text color anywhere in this file.
  assert.ok(
    !/\btext-\[var\(--accent-solid\)\]/.test(source),
    `${COUNT_BADGE} must not paint the digit with the tenant accent (unbounded-hue AA risk) — text-foreground instead.`,
  );
  assert.ok(
    !/\bbg-\[var\(--accent-solid\)\]/.test(source),
    `${COUNT_BADGE} must not fill the pill with the tenant accent (unbounded-hue AA risk) — bg-background instead.`,
  );
});

// ── 6. Shape regression guard — the oval-badge bug ───────────────────────────

test("CountBadge sets a fixed height matching its min-width so a single digit renders a circle", () => {
  const source = readFileSync(path.join(WEB_ROOT, COUNT_BADGE), "utf8");
  assert.ok(
    /\bh-5\b/.test(source) && /\bmin-w-5\b/.test(source),
    `${COUNT_BADGE} must pair a fixed height (h-5) with min-w-5 — min-width alone (the original bug) lets vertical padding + the app's line-height inflate the box into an oval instead of a circle.`,
  );
  assert.ok(
    /\bleading-none\b/.test(source),
    `${COUNT_BADGE} must reset line-height (leading-none) — the app's global body line-height (1.65) otherwise inflates a fixed-height box's content past its bounds.`,
  );
});
