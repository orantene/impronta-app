/**
 * no-gold-rust-chrome.static.test.ts — admin-chrome color guard (W2-C1).
 *
 * OWNER RULE (binding): the editor chrome (Tulala's own product UI) must never
 * use gold / rust / amber accents. The most-seen offender was the rust-gold
 * "Unpublished changes" dirty-state pill (`CHROME.amber = #b45309` + its glow
 * `rgba(180,83,9,...)`), plus a few hardcoded siblings. W2-C1 retoned the amber
 * token to the cool BLUE "attention / pending" role and purged the hardcoded
 * rust-gold literals from chrome.
 *
 * This guard reads the SOURCE TEXT of edit-chrome and FAILS if the rust-gold
 * amber family reappears, so a future edit can't silently reintroduce it.
 *
 * 2026-08-04 (FIX #7): the matcher used to be ONE hex (`#b45309`) plus its rgb
 * triple, so every Tailwind `amber-* / orange-* / yellow-*` utility class sailed
 * straight through it — 41 live violations had accumulated in chrome, including
 * the entire publish-path warning treatment and the dirty-state chip the rule was
 * originally written about (reborn as Tailwind classes). The matcher now covers
 * the whole gold/rust/amber hue family AND the Tailwind class names, and the walk
 * roots were widened to the two directories that were silently outside it:
 * `components/builder-lab/**` and the per-section admin Editor panels under
 * `lib/site-admin/sections/**`.
 *
 * Scope: the ADMIN CHROME — `src/components/edit-chrome/**`,
 * `src/components/builder-lab/**`, `src/lib/site-admin/sections/**`. This does
 * NOT scan the per-tenant theme system (`lib/site-admin/tokens/**`) or tenant
 * CONTENT color pickers — tenants may legitimately choose any brand color,
 * including golds (see {@link CONTENT_COLOR_ALLOWLIST}).
 *
 * WHY FILE-TEXT SCAN: importing chrome pulls the React / Next graph; a plain
 * UTF-8 text scan is zero-overhead and catches exactly the literal we forbid.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/no-gold-rust-chrome.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME_ROOT = resolve(HERE); // src/components/edit-chrome
const SRC_ROOT = resolve(HERE, "../.."); // src

/**
 * Every directory that counts as ADMIN CHROME for the gold/rust ban. Keyed by a
 * short label so failure output stays readable, valued by absolute path.
 *
 * `edit-chrome` is the canvas builder chrome. `builder-lab` is the platform-admin
 * catalog/template lab (same operators, same chrome rules) — it was outside the
 * walk root entirely until FIX #7, a latent gap. `sections/**` holds the
 * per-section admin Editor panels, which render INSIDE the inspector and are
 * therefore chrome too, not tenant content.
 */
const CHROME_ROOTS: ReadonlyArray<{ label: string; dir: string }> = [
  { label: "edit-chrome", dir: CHROME_ROOT },
  { label: "builder-lab", dir: join(SRC_ROOT, "components", "builder-lab") },
  { label: "site-admin/sections", dir: join(SRC_ROOT, "lib", "site-admin", "sections") },
];

/**
 * The banned rust-gold / amber / orange / yellow family.
 *
 * Three shapes, because the treatment shows up in all three:
 *   1. HEX — `#b45309` is the exact rust-gold that shipped; the rest are the
 *      Tailwind amber/orange/yellow ramp values that get hand-inlined
 *      (`#c2410c` orange-700 and `#d97706` amber-600 were both live).
 *   2. RGB TRIPLE — `180, 83, 9` / `180,83,9`, the same hue in an rgb(a) glow.
 *      Plus the amber/orange ramp as triples: the data-panel plan warning was
 *      styled `rgba(217,119,6,.35)` on `rgba(251,191,36,.12)`, which is amber-600
 *      on amber-400 written so that neither a hex nor a class matcher sees it.
 *   3. TAILWIND CLASS — `amber-500`, `orange-700`, `yellow-300`, …, which is how
 *      almost every violation actually got written. The original guard matched
 *      NONE of these, which is how 41 of them accumulated unnoticed.
 *
 * If a future warning needs a caution color, use the cool BLUE "attention" role
 * (CHROME.amber, now #2c5fdb, i.e. tailwind `blue-*`) or rose for errors, never
 * gold/rust.
 */
const RUST_GOLD_RE =
  /#(b45309|d97706|f59e0b|92400e|78350f|c2410c|ea580c|9a3412|ca8a04|eab308|a16207)\b|\b(?:180\s*,\s*83\s*,\s*9|217\s*,\s*119\s*,\s*6|251\s*,\s*191\s*,\s*36|245\s*,\s*158\s*,\s*11|194\s*,\s*65\s*,\s*12|234\s*,\s*179\s*,\s*8)\b|\b(?:amber|yellow|orange)-\d{2,3}\b/i;

/**
 * The stale accent-navy family that used to stand in for the editor accent
 * before the "one violet kit" consolidation (W2-C1): `#3d4f7c` (the base),
 * `#25304f` (deep active), `#4a5e94` (hover). Chrome-accent surfaces must now
 * use the single violet accent (`CHROME.accent` #7c3aed / tailwind `violet-*`),
 * never this navy. A hue as an rgb triple (`61, 79, 124`) is the same base.
 */
const STALE_NAVY_RE = /#3d4f7c\b|#25304f\b|#4a5e94\b|61\s*,\s*79\s*,\s*124\b/i;

/**
 * Files that are TENANT CONTENT color surfaces, not chrome accent: the
 * rich-editor color-picker swatch list + its defaults, its transformer fixture,
 * a tenant brand primaryColor default, and the multi-user presence cursor
 * palette. A tenant may legitimately pick gold, rust, or navy for their own
 * site, so a picker that OFFERS those hues is correct — stripping the swatches
 * would delete a feature, not fix a chrome violation.
 *
 * ONE allowlist serves BOTH guards (gold/rust and stale-navy): the content-vs-
 * chrome boundary is the same question in both cases. This is the pre-existing
 * exemption set, not a new one — FIX #7 only renamed it from
 * `NAVY_CONTENT_ALLOWLIST` and pointed the widened gold guard at it as well.
 *
 * Paths are relative to CHROME_ROOT and only apply to the edit-chrome root.
 */
const CONTENT_COLOR_ALLOWLIST = new Set([
  "brand-quick-panel.tsx",
  "presence-provider.tsx",
  "rich-editor/nodes/ColorNode.ts",
  "rich-editor/plugins/ToolbarPlugin.tsx",
  "rich-editor/transformers/fixtures.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !name.includes(".test.") &&
      !name.includes(".static.")
    ) {
      out.push(full);
    }
  }
  return out;
}

/** `dir/file.tsx`, forward-slashed so allowlist lookups match on any OS. */
function relFrom(root: string, file: string): string {
  return file.slice(root.length + 1).split("\\").join("/");
}

test("self-check: the rust-gold matcher actually catches the banned family", () => {
  assert.equal(RUST_GOLD_RE.test('background: "#b45309"'), true);
  assert.equal(RUST_GOLD_RE.test("rgba(180, 83, 9, 0.6)"), true);
  assert.equal(RUST_GOLD_RE.test("rgba(180,83,9,0.1)"), true);
  // Hand-inlined ramp hexes that were live in chrome before FIX #7.
  assert.equal(RUST_GOLD_RE.test('tap_target: "#c2410c"'), true);
  assert.equal(RUST_GOLD_RE.test('{ hex: "#d97706" }'), true);
  // Ramp hues written as rgb triples, which dodge both hex and class matchers.
  assert.equal(RUST_GOLD_RE.test('borderColor: "rgba(217, 119, 6, 0.35)"'), true);
  assert.equal(RUST_GOLD_RE.test('background: "rgba(251, 191, 36, 0.12)"'), true);
  // Tailwind utility classes — the shape the ORIGINAL matcher missed entirely,
  // which is how 41 violations accumulated while the guard stayed green.
  assert.equal(RUST_GOLD_RE.test('className="bg-amber-50 text-amber-700"'), true);
  assert.equal(RUST_GOLD_RE.test('"border-amber-500/40"'), true);
  assert.equal(RUST_GOLD_RE.test('"dark:text-amber-300"'), true);
  assert.equal(RUST_GOLD_RE.test('"fill-amber-500"'), true);
  assert.equal(RUST_GOLD_RE.test('"text-orange-700"'), true);
  assert.equal(RUST_GOLD_RE.test('"bg-yellow-200"'), true);
  // The cool retone targets must NOT trip the matcher.
  assert.equal(RUST_GOLD_RE.test("rgba(58, 123, 255, 0.1)"), false);
  assert.equal(RUST_GOLD_RE.test('"#2c5fdb"'), false);
  assert.equal(RUST_GOLD_RE.test('className="bg-blue-50 text-blue-700"'), false);
  assert.equal(RUST_GOLD_RE.test('"bg-violet-500"'), false);
  // The token NAME `CHROME.amber` stays legal — it resolves to the cool blue
  // attention role, and renaming it would churn every consumer.
  assert.equal(RUST_GOLD_RE.test("style={{ color: CHROME.amber }}"), false);
});

test("self-check: the stale-navy matcher catches the old accent family", () => {
  assert.equal(STALE_NAVY_RE.test('bg-[#3d4f7c]'), true);
  assert.equal(STALE_NAVY_RE.test('color: "#25304f"'), true);
  assert.equal(STALE_NAVY_RE.test("hover:bg-[#4a5e94]"), true);
  assert.equal(STALE_NAVY_RE.test("rgba(61, 79, 124, 0.45)"), true);
  // The one violet accent must NOT trip the matcher.
  assert.equal(STALE_NAVY_RE.test('"#7c3aed"'), false);
  assert.equal(STALE_NAVY_RE.test("bg-violet-600"), false);
});

test("no rust-gold / amber / orange / yellow accents anywhere in admin chrome", () => {
  const offenders: string[] = [];
  for (const { label, dir } of CHROME_ROOTS) {
    for (const file of walk(dir)) {
      const rel = relFrom(dir, file);
      // Tenant CONTENT color surfaces (pickers / fixtures) may offer any hue.
      if (dir === CHROME_ROOT && CONTENT_COLOR_ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        if (RUST_GOLD_RE.test(line)) {
          offenders.push(`${label}/${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Gold/rust/amber/orange/yellow is banned in admin chrome (owner rule). Use ` +
      `the cool "attention" role for warnings and advisories (CHROME.amber = ` +
      `#2c5fdb, i.e. tailwind blue-*), rose for errors, emerald for success, or ` +
      `the violet accent for decorative marks. Offenders:\n` +
      offenders.join("\n"),
  );
});

test("no stale accent-navy in chrome-accent source (tenant-content files exempt)", () => {
  const offenders: string[] = [];
  for (const file of walk(CHROME_ROOT)) {
    const rel = relFrom(CHROME_ROOT, file);
    if (CONTENT_COLOR_ALLOWLIST.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      if (STALE_NAVY_RE.test(line)) {
        offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  assert.equal(
    offenders.length,
    0,
    `Stale accent-navy (#3d4f7c / #25304f / #4a5e94) is banned on chrome-accent ` +
      `surfaces after the one-violet-kit consolidation. Use CHROME.accent ` +
      `(#7c3aed) or tailwind violet-*. If this is a tenant CONTENT/brand color ` +
      `(not chrome accent), add the file to CONTENT_COLOR_ALLOWLIST. Offenders:\n` +
      offenders.join("\n"),
  );
});
