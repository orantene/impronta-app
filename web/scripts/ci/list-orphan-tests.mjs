#!/usr/bin/env node
/**
 * list-orphan-tests.mjs - READ-ONLY. Prints (relative to web/, one per line) every
 * test file that no lane runs.
 *
 * A file is "covered" when any of these names it:
 *   - an explicit path or a glob inside a package.json script or a
 *     .github/workflows/*.yml file,
 *   - a `scripts/list-test-files.cjs [--depth=N] <dir>...` expansion (the same
 *     function the lanes call, so quarantine handling is shared),
 *   - the vitest include (read from vitest.config.mts).
 *
 * Files in scripts/test-quarantine.txt are deliberately parked and are never
 * reported as orphans.
 *
 * Flags:
 *   --exclude-file=<path>   also treat the paths listed in <path> as covered
 *   --count                 print only the number
 *   --by-folder             print "<count> <folder>" instead of paths
 *
 * Used by the nightly workflow (.github/workflows/nightly-all-tests.yml) to
 * report orphans that are not yet in web/scripts/ci/nightly-orphans.txt.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = join(WEB, "..");
const TEST_RE = /\.test\.(?:tsx?|mjs|cjs|js)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", ".vercel"]);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out);
    } else if (e.isFile() && TEST_RE.test(e.name)) {
      out.push(relative(WEB, join(dir, e.name)).split(sep).join("/"));
    }
  }
  return out;
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function computeOrphans({ extraCovered = [] } = {}) {
  const all = walk(WEB).sort();
  const covered = new Set(extraCovered);

  const texts = [];
  const scripts = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")).scripts ?? {};
  texts.push(...Object.values(scripts));
  const wfDir = join(REPO, ".github", "workflows");
  if (existsSync(wfDir)) {
    for (const f of readdirSync(wfDir)) {
      // The nightly workflow itself must not "cover" anything: it runs the orphans.
      if (/\.ya?ml$/.test(f) && f !== "nightly-all-tests.yml") texts.push(readFileSync(join(wfDir, f), "utf8"));
    }
  }

  const globs = [];
  const dirExpansions = [];
  for (const text of texts) {
    // Explicit paths and globs (strip shell quoting/substitution punctuation).
    for (const raw of text.split(/[\s'"`$()]+/)) {
      const tok = raw.replace(/^\.\//, "").replace(/^web\//, "");
      if (!/\.test\.(?:tsx?|mjs|cjs|js)$/.test(tok)) continue;
      if (tok.includes("*")) globs.push(globToRegExp(tok));
      else covered.add(tok);
    }
    // list-test-files.cjs expansions: `[--depth=N] dir...`.
    for (const m of text.matchAll(/list-test-files\.cjs((?:\s+(?:--depth=\d+|[\w./@-]+))+)/g)) {
      let depth = Infinity;
      const dirs = [];
      for (const a of m[1].trim().split(/\s+/)) {
        const d = /^--depth=(\d+)$/.exec(a);
        if (d) depth = Number(d[1]);
        else dirs.push(a);
      }
      dirExpansions.push({ dirs, depth });
    }
  }

  const { listTestFiles, readQuarantine } = require(join(WEB, "scripts", "list-test-files.cjs"));
  for (const { dirs, depth } of dirExpansions) for (const f of listTestFiles(dirs, { depth })) covered.add(f);

  // vitest include (component tests).
  const vcfg = readFileSync(join(WEB, "vitest.config.mts"), "utf8");
  const inc = /include:\s*\[([^\]]*)\]/.exec(vcfg);
  for (const g of inc ? [...inc[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : []) globs.push(globToRegExp(g));

  const quarantined = readQuarantine();
  return all.filter((f) => !covered.has(f) && !quarantined.has(f) && !globs.some((re) => re.test(f)));
}

function main() {
  const args = process.argv.slice(2);
  const ex = args.find((a) => a.startsWith("--exclude-file="));
  const extraCovered = ex
    ? readFileSync(ex.slice("--exclude-file=".length), "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : [];
  const orphans = computeOrphans({ extraCovered });
  if (args.includes("--count")) console.log(orphans.length);
  else if (args.includes("--by-folder")) {
    const m = new Map();
    for (const f of orphans) m.set(dirname(f), (m.get(dirname(f)) ?? 0) + 1);
    for (const [d, n] of [...m].sort()) console.log(`${n}\t${d}`);
  } else for (const f of orphans) console.log(f);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
