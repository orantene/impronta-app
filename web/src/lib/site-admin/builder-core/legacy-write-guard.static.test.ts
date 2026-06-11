/**
 * legacy-write-guard.static.test.ts — §F.2 CI guard (Architecture §F.2).
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * Reads the SOURCE TEXT of every non-homepage builder adapter + every
 * component under `components/builder-lab/` + the reusable mount component,
 * and FAILS if any file contains any of these forbidden strings:
 *
 *   • cms_page_sections
 *   • .from("cms_page_sections")     ← already covered by the above
 *   • composition[                    ← legacy slot-array write pattern
 *
 * The homepage adapter (homepage-adapter.ts + homepage-adapter-core.ts) is
 * the ONE allowed legacy writer — those files are explicitly excluded.
 *
 * WHY FILE-TEXT SCAN (not imports)?
 * ──────────────────────────────────
 * Importing the adapter modules under node:test would pull in server-action /
 * React / CSS import graphs that can't run outside Next.js. Reading the files
 * as plain UTF-8 text is zero-overhead and catches the exact violation we care
 * about: a developer accidentally wiring an adapter to the legacy table.
 *
 * SELF-CHECK (the matcher MUST work)
 * ───────────────────────────────────
 * Before scanning real files, this test plants a synthetic violation in an
 * in-memory string and asserts the matcher catches it. If the matcher is broken
 * the self-check fails first, making the test itself trustworthy.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-core/legacy-write-guard.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// ── Forbidden patterns ────────────────────────────────────────────────────────

/**
 * Patterns that must NEVER appear in non-homepage adapter / builder-lab SOURCE
 * CODE (comments and JSDoc are stripped before matching — adapters that
 * document what they *don't* do in comments are fine).
 *
 * What these catch:
 *   cms_page_sections   — any identifier reference to the legacy table name
 *   .from("cms_page_sections")  — Supabase query targeting the legacy table
 *   composition[        — the legacy slot-array write pattern (e.g. `composition[]`)
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /cms_page_sections/,
  /\.from\("cms_page_sections"\)/,
  /composition\[/,
];

/** Human-readable names for the patterns (for failure messages). */
const FORBIDDEN_PATTERN_LABELS: string[] = [
  "cms_page_sections",
  '.from("cms_page_sections")',
  "composition[",
];

/**
 * Strip single-line comments (// ...) and block comments (/* ... *\/)
 * from TypeScript source before pattern-matching.
 *
 * This allows adapter files to document in JSDoc/comments what tables they
 * *don't* write (e.g. "NEVER writes \`cms_page_sections\`") without triggering
 * the guard. The guard is designed to catch *code* references, not prose.
 *
 * Caveats:
 *  - Does not handle comments inside string literals (rare in adapter code).
 *  - Block-comment regex is non-greedy to avoid consuming multiple comments.
 */
function stripComments(source: string): string {
  // Strip block comments first (/** ... */ and /* ... */)
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip single-line comments (// ...), including JSDoc-style inline refs
  stripped = stripped.replace(/\/\/.*/g, "");
  return stripped;
}

// ── File discovery ────────────────────────────────────────────────────────────

// This file lives at: web/src/lib/site-admin/builder-core/
// web/src is 3 levels up: ../../..
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(THIS_DIR, "../../..");

/**
 * Recursively collect all .ts / .tsx files under a directory, optionally
 * excluding files whose basename matches a predicate.
 */
function collectSourceFiles(
  dir: string,
  exclude?: (filename: string) => boolean,
): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        results.push(...collectSourceFiles(full, exclude));
      } else if (st.isFile()) {
        const ext = extname(entry);
        if ((ext === ".ts" || ext === ".tsx") && !(exclude?.(entry) ?? false)) {
          results.push(full);
        }
      }
    }
  } catch {
    // Directory may not exist in all environments — skip silently.
  }
  return results;
}

/**
 * The non-homepage adapter files we must scan.
 * Excludes: homepage-adapter.ts, homepage-adapter-core.ts (the ONE allowed legacy writers).
 * Excludes: *.test.ts / *.test.tsx (tests mention the strings in comments / assertions).
 */
const ADAPTER_DIR = join(WEB_SRC, "lib/site-admin/builder-core/adapters");
const MOUNT_DIR = join(WEB_SRC, "lib/site-admin/builder-core/mount");
const BUILDER_LAB_DIR = join(WEB_SRC, "components/builder-lab");

function isHomepageAdapterFile(filename: string): boolean {
  return (
    filename === "homepage-adapter.ts" ||
    filename === "homepage-adapter-core.ts"
  );
}

function isTestFile(filename: string): boolean {
  return filename.includes(".test.");
}

const SCANNED_FILES: string[] = [
  // Non-homepage adapters
  ...collectSourceFiles(ADAPTER_DIR, (f) => isHomepageAdapterFile(f) || isTestFile(f)),
  // Reusable mount (BuilderEditorMount.tsx)
  ...collectSourceFiles(MOUNT_DIR, isTestFile),
  // Builder Lab components
  ...collectSourceFiles(BUILDER_LAB_DIR, isTestFile),
];

// ── §F.2 — Self-check: the matcher must catch a planted violation ─────────────

test("§F.2 self-check: FORBIDDEN_PATTERNS catch a planted cms_page_sections violation (code, not comment)", () => {
  // Plant a code-level violation (NOT in a comment) and strip comments before matching.
  const plantedViolation = stripComments(`
    // NEVER writes \`cms_page_sections\` — this comment should be stripped.
    const q = supabase.from("cms_page_sections").insert({ ... });
  `);

  const hit = FORBIDDEN_PATTERNS.some((re) => re.test(plantedViolation));
  assert.equal(
    hit,
    true,
    "Self-check FAILED: FORBIDDEN_PATTERNS did not catch 'cms_page_sections' in code. " +
      "The static guard test itself is broken — fix the regex before trusting it.",
  );
});

test("§F.2 self-check: comment-only cms_page_sections mention is NOT flagged after stripping", () => {
  // A JSDoc comment that mentions the table name is fine — the adapter explains what it doesn't do.
  const commentOnly = stripComments(`
    /**
     * NEVER writes \`cms_page_sections\` — enforced by the runtime guard.
     * The literal "cms_page_sections" appears here only in documentation.
     */
    // Also: composition[] is not used here.
    const x = 42;
  `);

  const hit = FORBIDDEN_PATTERNS.some((re) => re.test(commentOnly));
  assert.equal(
    hit,
    false,
    "Comment-only mentions should NOT trigger the guard after comment stripping. " +
      "Check the stripComments() function.",
  );
});

test("§F.2 self-check: FORBIDDEN_PATTERNS catch a planted composition[ violation", () => {
  // Plant a code-level violation (outside a comment).
  const plantedViolation = stripComments(`
    // Another synthetic violation — proves composition[ matching works.
    const result = composition[0];
    body: composition[],
  `);

  const hit = FORBIDDEN_PATTERNS.some((re) => re.test(plantedViolation));
  assert.equal(
    hit,
    true,
    "Self-check FAILED: FORBIDDEN_PATTERNS did not catch 'composition[' in code. " +
      "The static guard test itself is broken — fix the regex before trusting it.",
  );
});

test("§F.2 self-check: homepage adapter files are EXCLUDED from the scan set", () => {
  const homepageFiles = SCANNED_FILES.filter(
    (f) => basename(f) === "homepage-adapter.ts" || basename(f) === "homepage-adapter-core.ts",
  );
  assert.equal(
    homepageFiles.length,
    0,
    `Homepage adapter files must be excluded from the scan set but found: ${homepageFiles.join(", ")}`,
  );
});

test("§F.2 self-check: at least 3 non-homepage adapter files are being scanned", () => {
  // Ensures the scanner found real files and isn't vacuously passing on an empty set.
  const adapterFiles = SCANNED_FILES.filter((f) =>
    f.startsWith(ADAPTER_DIR),
  );
  assert.ok(
    adapterFiles.length >= 3,
    `Expected at least 3 non-homepage adapter files; found ${adapterFiles.length}. ` +
      `Scanned: ${adapterFiles.join(", ")}`,
  );
});

test("§F.2 self-check: builder-lab component files are being scanned", () => {
  const labFiles = SCANNED_FILES.filter((f) => f.startsWith(BUILDER_LAB_DIR));
  assert.ok(
    labFiles.length >= 1,
    `Expected at least 1 builder-lab file in the scan set; found ${labFiles.length}.`,
  );
});

// ── §F.2 — The real scan ─────────────────────────────────────────────────────

test(
  "§F.2 static guard: no non-homepage adapter / builder-lab file contains legacy write patterns",
  () => {
    const violations: string[] = [];

    for (const filePath of SCANNED_FILES) {
      let rawSource: string;
      try {
        rawSource = readFileSync(filePath, "utf-8");
      } catch (err) {
        // If the file can't be read, treat it as a scan error (fail loudly).
        violations.push(
          `[READ ERROR] ${filePath}: ${String(err)}`,
        );
        continue;
      }

      // Strip comments so adapters may document what they don't do in JSDoc/prose
      // without triggering the guard. The guard catches CODE references only.
      const source = stripComments(rawSource);

      for (let pi = 0; pi < FORBIDDEN_PATTERNS.length; pi++) {
        const re = FORBIDDEN_PATTERNS[pi]!;
        const label = FORBIDDEN_PATTERN_LABELS[pi]!;

        if (re.test(source)) {
          // Find the line number(s) for a helpful message (use stripped source).
          const lines = source.split("\n");
          const hitLines = lines
            .map((line, idx) => (re.test(line) ? idx + 1 : null))
            .filter((n): n is number => n !== null);

          violations.push(
            `[VIOLATION] ${filePath}\n` +
              `  Pattern:  "${label}"\n` +
              `  Line(s):  ${hitLines.join(", ")}`,
          );
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      "§F.2 STATIC GUARD FAILED — legacy write patterns found in non-homepage adapter/builder-lab source:\n\n" +
        violations.join("\n\n") +
        "\n\nOnly homepage-adapter.ts / homepage-adapter-core.ts may write cms_page_sections or composition[].\n" +
        "All other adapters MUST persist only to freeform tables (workspace_pages, talent_pages, builder_templates).",
    );
  },
);

// ── §F.2 — Each scanned file is listed (informational) ───────────────────────

test("§F.2 coverage: list all scanned files (informational — always passes)", () => {
  // This test never fails; it exists so the runner output shows which files
  // were checked, making it easy to verify coverage in CI logs.
  assert.ok(
    SCANNED_FILES.length > 0,
    "Expected at least 1 file in the scan set.",
  );
  // Log the list for visibility in CI output.
  for (const f of SCANNED_FILES) {
    // Use a relative path in the output for readability.
    const rel = f.replace(WEB_SRC + "/", "");
    // node:test captures stdout per-test; this appears in the test's output.
    process.stdout.write(`  scanned: ${rel}\n`);
  }
});
