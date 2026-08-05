/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS helper script. */
/**
 * list-test-files.cjs — the ONE expansion of "which test files does this lane
 * run", shared by the npm test lanes and by `check:builder-test-lane-coverage`.
 *
 * WHY THIS EXISTS (fix #6 / B1)
 * ────────────────────────────
 * The builder lanes in package.json used shell globs like
 *   `ls src/components/edit-chrome/*.test.ts src/components/edit-chrome/kit/*.test.ts`
 * A shell `*` never descends, so every test file that lived one directory
 * deeper than someone happened to enumerate silently ran in NO lane — 13 of
 * them by the 2026-08-04 audit (edit-chrome/add-gallery, rich-editor/
 * transformers, site-admin/collections, links, sections/directory,
 * sections/shared/section-primitives, site-header, tokens, a11y corpus).
 * `**` is not a portable fix: npm runs scripts through `sh`, and neither dash
 * nor bash-as-sh expands `**` recursively without `shopt -s globstar`, so a
 * `**` glob would quietly degrade back to one level on CI.
 *
 * A tiny Node walker is portable, recursive, and — crucially — reusable: the
 * coverage guard calls the SAME function the lanes call, so "what CI runs"
 * cannot drift from "what the guard believes CI runs".
 *
 * USAGE (from web/)
 *   node scripts/list-test-files.cjs src/components/edit-chrome
 *   node scripts/list-test-files.cjs --depth=1 src/lib/site-admin
 *
 * Prints newline-separated paths (relative to web/), sorted, de-duped, with the
 * `scripts/test-quarantine.txt` entries removed — the same quarantine contract
 * the old `grep -vFf scripts/test-quarantine.txt` pipe enforced.
 *
 * --depth=1 restricts to files directly in the given directory (no descent),
 * for lanes that deliberately split a tree across several lanes.
 */
const fs = require("node:fs");
const path = require("node:path");

const WEB_ROOT = path.join(__dirname, "..");
const QUARANTINE_FILE = path.join(__dirname, "test-quarantine.txt");

const TEST_FILE_RE = /\.test\.tsx?$/;

/** Quarantined paths (relative to web/), comments and blanks stripped. */
function readQuarantine() {
  let raw;
  try {
    raw = fs.readFileSync(QUARANTINE_FILE, "utf8");
  } catch {
    return new Set();
  }
  return new Set(
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

/**
 * Every `*.test.ts`/`*.test.tsx` under `dir` (relative to web/).
 * `depth === 1` lists only the directory's own files.
 */
function collectTestFiles(dir, { depth = Infinity } = {}) {
  const abs = path.isAbsolute(dir) ? dir : path.join(WEB_ROOT, dir);
  const out = [];
  walk(abs, depth);
  return out.sort();

  function walk(current, remaining) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (remaining > 1) walk(full, remaining - 1);
      } else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
        out.push(path.relative(WEB_ROOT, full).split(path.sep).join("/"));
      }
    }
  }
}

/** The lane-facing expansion: collect, de-dupe, drop quarantined entries. */
function listTestFiles(dirs, { depth = Infinity } = {}) {
  const quarantined = readQuarantine();
  const found = new Set();
  for (const dir of dirs) {
    for (const file of collectTestFiles(dir, { depth })) {
      if (!quarantined.has(file)) found.add(file);
    }
  }
  return [...found].sort();
}

function main() {
  const args = process.argv.slice(2);
  let depth = Infinity;
  const dirs = [];
  for (const arg of args) {
    const m = /^--depth=(\d+)$/.exec(arg);
    if (m) {
      depth = Number(m[1]);
      continue;
    }
    dirs.push(arg);
  }
  if (dirs.length === 0) {
    console.error("usage: node scripts/list-test-files.cjs [--depth=N] <dir>...");
    process.exit(2);
  }
  const files = listTestFiles(dirs, { depth });
  if (files.length > 0) process.stdout.write(`${files.join("\n")}\n`);
}

module.exports = { collectTestFiles, listTestFiles, readQuarantine, WEB_ROOT };

if (require.main === module) main();
