/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS check script. */
/**
 * check:builder-test-lane-coverage — assert every builder test file ON DISK is
 * actually run by some lane that CI executes.
 *
 * WHY (fix #6 / B1)
 * ─────────────────
 * `check:ci-lane-parity` proves ci.yml runs every lane the `ci` aggregate runs.
 * It says nothing about whether those lanes run every TEST. They did not: the
 * lanes enumerated directories one level at a time with shell globs
 * (`src/components/edit-chrome/*.test.ts`, `…/kit/*.test.ts`, …), so a test file
 * one directory deeper than someone happened to list ran in NO lane at all. The
 * 2026-08-04 audit found 13 such files — add-gallery panels, rich-editor
 * transformers, collections, links, sections/directory, section-primitives,
 * site-header, tokens, plus the a11y builder-contrast corpus (only reachable via
 * `test:a11y`, which was in neither ci.yml nor the `ci` aggregate). They had
 * been written, reviewed, merged, and were silently dead.
 *
 * A recursive glob alone does not stop this recurring: the next lane someone
 * adds can be one-level again, or a whole new directory can land outside every
 * lane. This guard closes the loop by comparing the two sets directly:
 *
 *     { *.test.ts(x) on disk under the builder roots }  ⊆
 *     { files the CI-reachable lanes expand to }  ∪  { quarantine }
 *
 * Anything in the difference fails the build, naming the orphan file.
 *
 * HOW LANE EXPANSION IS COMPUTED
 * ──────────────────────────────
 * Start from `pkg.scripts.ci` (which `check:ci-lane-parity` already proves is a
 * subset of ci.yml), follow every `npm run <script>` transitively, and from each
 * resolved script body collect:
 *   • `$(node scripts/list-test-files.cjs [--depth=N] <dirs…>)` — expanded by
 *     calling THE SAME module the lane calls, so the guard's idea of a lane can
 *     never drift from the lane itself; and
 *   • bare `src/…` arguments, literal paths or one-level `*` globs.
 *
 * --selftest exercises the matcher against synthetic inputs so the guard cannot
 * rot into a no-op.
 */
const fs = require("node:fs");
const path = require("node:path");

const { collectTestFiles, listTestFiles, readQuarantine, WEB_ROOT } = require("./list-test-files.cjs");

/**
 * The trees this guard polices. Every `*.test.ts(x)` under these must be in a
 * lane. Scoped to the builder surface deliberately: this is the area the
 * page-builder remediation program owns, and a repo-wide version would fail on
 * unrelated lanes that are gated differently.
 */
const BUILDER_ROOTS = [
  "src/components/edit-chrome",
  "src/components/builder-lab",
  "src/lib/site-admin",
];

/** `$(node scripts/list-test-files.cjs …)` inside a lane script. */
const LIST_HELPER_RE = /\$\(\s*node\s+scripts\/list-test-files\.cjs([^)]*)\)/g;
/** A bare `src/…` argument (literal path or one-level glob). */
const SRC_TOKEN_RE = /(?:^|\s)(src\/[^\s'"()|]+)/g;
/** An `npm run <script>` reference inside a script body. */
const NPM_RUN_RE = /npm\s+run\s+([A-Za-z0-9:_-]+)/g;

/** Resolve `ciScript` plus every script it transitively invokes, as one array of bodies. */
function reachableScriptBodies(scripts, entryScriptName) {
  const seen = new Set();
  const bodies = [];
  const queue = [entryScriptName];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const body = scripts[name];
    if (typeof body !== "string") continue;
    bodies.push(body);
    for (const m of body.matchAll(NPM_RUN_RE)) queue.push(m[1]);
  }
  return bodies;
}

/** Expand a bare `src/…` token: a literal path, or a one-level `*` glob. */
function expandSrcToken(token, exists = (p) => fs.existsSync(path.join(WEB_ROOT, p))) {
  if (!token.includes("*")) return exists(token) ? [token] : [];
  const dir = path.posix.dirname(token);
  const pattern = path.posix.basename(token);
  const re = new RegExp(
    `^${pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`,
  );
  let entries;
  try {
    entries = fs.readdirSync(path.join(WEB_ROOT, dir));
  } catch {
    return [];
  }
  return entries.filter((name) => re.test(name)).map((name) => `${dir}/${name}`);
}

/** Every test file the reachable lanes actually run. */
function coveredFiles(scripts, entryScriptName) {
  const covered = new Set();
  for (const body of reachableScriptBodies(scripts, entryScriptName)) {
    // 1. list-test-files.cjs invocations — expanded by the shared module.
    let stripped = body;
    for (const m of body.matchAll(LIST_HELPER_RE)) {
      stripped = stripped.replace(m[0], " ");
      const args = m[1].trim().split(/\s+/).filter(Boolean);
      let depth = Infinity;
      const dirs = [];
      for (const arg of args) {
        const d = /^--depth=(\d+)$/.exec(arg);
        if (d) depth = Number(d[1]);
        else dirs.push(arg);
      }
      if (dirs.length > 0) for (const f of listTestFiles(dirs, { depth })) covered.add(f);
    }
    // 2. bare src/… arguments (literal or one-level glob).
    for (const m of stripped.matchAll(SRC_TOKEN_RE)) {
      for (const f of expandSrcToken(m[1])) covered.add(f);
    }
  }
  return covered;
}

/** Every builder test file on disk, quarantine excluded. */
function builderTestFilesOnDisk() {
  const quarantined = readQuarantine();
  const found = new Set();
  for (const root of BUILDER_ROOTS) {
    for (const file of collectTestFiles(root)) {
      if (!quarantined.has(file)) found.add(file);
    }
  }
  return found;
}

function selftest() {
  const assert = require("node:assert");

  // Transitive `npm run` resolution reaches nested lanes.
  assert.deepEqual(
    reachableScriptBodies(
      { ci: "npm run a && npm run b", a: "npm run c", b: "tsx --test src/b.test.ts", c: "tsx --test src/c.test.ts" },
      "ci",
    ),
    ["npm run a && npm run b", "npm run c", "tsx --test src/b.test.ts", "tsx --test src/c.test.ts"],
  );
  // A missing script name is skipped, not thrown on.
  assert.deepEqual(reachableScriptBodies({ ci: "npm run nope" }, "ci"), ["npm run nope"]);

  // One-level glob expansion, with a stubbed existence check for literals.
  const literal = expandSrcToken("src/x/y.test.ts", () => true);
  assert.deepEqual(literal, ["src/x/y.test.ts"]);
  assert.deepEqual(expandSrcToken("src/x/y.test.ts", () => false), []);

  // The real thing: the guard must SEE the files the lanes list, i.e. the
  // covered set is non-trivial and includes a known lane member.
  const pkg = require("../package.json");
  const covered = coveredFiles(pkg.scripts ?? {}, "ci");
  assert.ok(covered.size > 100, `expected the ci lanes to cover >100 test files, got ${covered.size}`);
  assert.ok(
    covered.has("src/lib/site-admin/builder-node/render-output.test.ts"),
    "expansion lost a known test:builder member — the matcher is broken",
  );

  // …and it must actually be able to FAIL: a file on disk that no lane lists.
  const orphan = "src/lib/site-admin/__not-a-real-lane-member__.test.ts";
  assert.ok(!covered.has(orphan), "self-check fixture unexpectedly covered");

  console.log("[check:builder-test-lane-coverage] selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const pkg = require("../package.json");
  const covered = coveredFiles(pkg.scripts ?? {}, "ci");
  const onDisk = builderTestFilesOnDisk();

  const orphans = [...onDisk].filter((f) => !covered.has(f)).sort();

  if (orphans.length > 0) {
    console.error(
      `[check:builder-test-lane-coverage] FAIL — ${orphans.length} builder test file(s) on disk run in NO CI lane:`,
    );
    for (const o of orphans) console.error(`  - ${o}`);
    console.error(
      "\nA test that runs in no lane is dead code that looks like coverage. Fix by either:\n" +
        "  • adding the file's directory to a lane in package.json (prefer\n" +
        "    `$(node scripts/list-test-files.cjs <dir>)`, which is recursive), or\n" +
        "  • quarantining it in scripts/test-quarantine.txt WITH a reason and a\n" +
        "    follow-up — never for a test that found a real bug.",
    );
    process.exit(1);
  }

  console.log(
    `[check:builder-test-lane-coverage] OK — all ${onDisk.size} builder test file(s) are in a CI lane ` +
      `(${covered.size} files covered overall).`,
  );
}

main();
