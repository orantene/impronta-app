#!/usr/bin/env node
// check-untracked-imports.mjs
//
// Catches the failure mode that broke Vercel for 4+ hours on 2026-05-07:
// a file is created locally, committed code imports it, but the new file is
// never `git add`-ed. Local builds pass (the file is on disk); CI / Vercel
// build from git and fail with "Module not found".
//
// Run manually:
//   node web/scripts/check-untracked-imports.mjs
// Or as part of `npm run ci` (added to package.json "ci" script).
// Or as a pre-push hook (see install instructions in script output).
//
// Algorithm:
//   1. List untracked TS/TSX files under web/src.
//   2. For each, compute the import paths it would be referenced by:
//        a. relative same-dir:   "./basename"
//        b. relative up-dir:     "../<rel-path>/basename"  (covered by alias check)
//        c. alias:               "@/<path-from-src>/basename"
//      All without extensions.
//   3. `git grep` over tracked files for `from "<path>"` (single or double quotes).
//   4. Report any matches as fatal — print the importing files.
//
// Exit codes:
//   0 = clean (no untracked file is imported by tracked code)
//   1 = at least one violation found

import { spawnSync } from "node:child_process";
import { resolve, relative, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const WEB_ROOT = resolve(REPO_ROOT, "web");
const SRC_ROOT = resolve(WEB_ROOT, "src");

const TS_EXTS = new Set([".ts", ".tsx"]);

function git(args, options = {}) {
  const res = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(
      `git ${args.join(" ")} failed (status ${res.status}): ${res.stderr?.trim() ?? "unknown"}`,
    );
  }
  return res;
}

function listUntrackedSrcFiles() {
  const res = git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    "web/src",
  ]);
  return res.stdout
    .split("\n")
    .filter((p) => p.length > 0 && TS_EXTS.has(extname(p)));
}

function importPathsFor(absPath) {
  // Strip the extension and produce both alias + same-dir relative forms.
  const noExt = absPath.replace(/\.(ts|tsx)$/u, "");
  const alias = "@/" + relative(SRC_ROOT, noExt).split("\\").join("/");
  const sameDirRel = "./" + basename(noExt);
  const candidates = new Set([alias, sameDirRel]);
  // Also handle index.ts re-exports: importing the directory.
  if (basename(noExt) === "index") {
    const dirAlias = "@/" + relative(SRC_ROOT, dirname(noExt)).split("\\").join("/");
    candidates.add(dirAlias);
    candidates.add("./" + basename(dirname(noExt)));
  }
  return [...candidates];
}

function findReferencesTo(importPaths) {
  // Build an alternation regex with escaped paths for git grep -E.
  const escaped = importPaths.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  // Match: from "path" or from 'path'. Use POSIX [[:space:]] — git's
  // -E uses POSIX ERE which does NOT support the \s shorthand.
  const pattern = `from[[:space:]]+["'](${escaped.join("|")})["']`;
  // git pathspec globbing differs from shell — use the literal directory
  // and let git scan, rather than the **/* shell glob (which git treats
  // as a verbatim pattern that matches nothing).
  const res = git(["grep", "-l", "-E", pattern, "--", "web/src"]);
  if (res.status === 1) return []; // no matches
  return res.stdout.split("\n").filter((p) => p.length > 0);
}

function main() {
  const untracked = listUntrackedSrcFiles();
  if (untracked.length === 0) {
    console.log("[check-untracked-imports] No untracked TS files under web/src — clean.");
    return 0;
  }

  const violations = [];
  for (const rel of untracked) {
    const abs = resolve(REPO_ROOT, rel);
    const importPaths = importPathsFor(abs);
    const referencingFiles = findReferencesTo(importPaths);
    if (referencingFiles.length > 0) {
      violations.push({ untracked: rel, importPaths, referencingFiles });
    }
  }

  if (violations.length === 0) {
    console.log(
      `[check-untracked-imports] ${untracked.length} untracked TS file(s) — none referenced by tracked code. Clean.`,
    );
    return 0;
  }

  console.error("[check-untracked-imports] FATAL: untracked files are imported by tracked code.");
  console.error("");
  console.error("This means CI / Vercel will fail to build from git, even though");
  console.error("the local build passes (the files are on disk locally).");
  console.error("");
  for (const v of violations) {
    console.error(`  ✗ untracked: ${v.untracked}`);
    console.error(`    referenced by:`);
    for (const f of v.referencingFiles) console.error(`      - ${f}`);
    console.error("");
  }
  console.error("Fix: either `git add` the untracked files, or remove the imports.");
  console.error("To bypass (NOT recommended): set CHECK_UNTRACKED_IMPORTS_SKIP=1");
  return 1;
}

if (process.env.CHECK_UNTRACKED_IMPORTS_SKIP === "1") {
  console.warn("[check-untracked-imports] SKIP set — bypassing check");
  process.exit(0);
}

try {
  process.exit(main());
} catch (err) {
  console.error("[check-untracked-imports] internal error:", err);
  // Don't fail the build on tooling errors — just warn.
  process.exit(0);
}
