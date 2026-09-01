/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS check script. */
/**
 * check:builder-2027-gate — assert the Builder 2027 ship gate is well-formed.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `qa:builder-2027-ship` is the pre-merge gate for the Builder 2027 program. It
 * cannot run inside GitHub Actions: it chains Playwright `qa:impronta-*` lanes
 * that need a dev server, seeded tenant data and live Supabase credentials the
 * workflow does not carry. So it is a LOCAL gate, run before every phase merge.
 *
 * A local-only gate rots silently. This repo has the scar: `check:field-catalog-
 * frozen` sat in the `ci` aggregate for months while the workflow never invoked
 * it, and `check:ci-lane-parity` was written to catch exactly that. But parity
 * only matches `test|check|verify|eval:*` — a `qa:*` meta-script is invisible to
 * it. This guard covers that blind spot from the other direction: CI cannot run
 * the gate, but it CAN prove the gate still references everything it claims to.
 *
 * THREE INVARIANTS
 * ────────────────
 *   1. `qa:builder-2027-ship` exists.
 *   2. Every `npm run <script>` it references is a real script in package.json.
 *      Catches a rename or a typo turning a lane into a silent no-op.
 *   3. REQUIRED ⊆ referenced, and every SELF_TIGHTENING lane that EXISTS in
 *      package.json is chained. (3) is the important one: as each phase lands a
 *      new verification (`verify:no-embed-bridges` in 8B, `check:no-legacy-pages`
 *      in 8-1b, the anchor smoke in 11), merely creating the script is not
 *      enough — forgetting to wire it into the ship gate turns CI red the same
 *      day, instead of being discovered at Phase 12 when the gate proves less
 *      than it appears to.
 *
 * `--selftest` exercises the matcher against synthetic inputs so the guard
 * itself cannot rot into a no-op. Run in CI alongside the real check.
 */
const fs = require("node:fs");
const path = require("node:path");

const GATE_SCRIPT = "qa:builder-2027-ship";

/**
 * The standing per-commit gate every Builder 2027 phase must pass. These all
 * exist today; the guard fails loudly if one is dropped from the chain.
 */
const REQUIRED_LANES = [
  "typecheck",
  "lint",
  "verify:server-actions",
  "test:builder",
  "test:builder-chrome",
  "test:builder-capabilities",
  "test:publish-preflight",
  "verify:builder-ownership",
  "test:size-ratchet",
  "check:builder-test-lane-coverage",
];

/**
 * Lanes each later phase introduces. The rule is conditional on purpose: absent
 * is fine (the phase has not landed), present-but-unchained is a failure. That
 * makes the gate tighten itself as the program progresses rather than relying
 * on someone remembering to come back and wire it.
 */
const SELF_TIGHTENING_LANES = [
  "verify:no-embed-bridges", // Phase 8B
  "check:no-legacy-pages", // Phase 8-1b
  "test:e2e:builder-2027-anchor-smoke", // Phase 11
];

/** Every `npm run <script>` token referenced by a script body, de-duped + sorted. */
function referencedScripts(scriptBody) {
  return [
    ...new Set(
      (scriptBody.match(/npm run ([a-z0-9:._-]+)/g) ?? []).map((m) =>
        m.replace(/^npm run /, ""),
      ),
    ),
  ].sort();
}

/** Referenced names that are not real scripts — a rename or typo. */
function danglingScripts(referenced, scripts) {
  return referenced.filter((name) => !(name in scripts));
}

/** REQUIRED lanes the gate does not reference. */
function missingRequired(referenced) {
  return REQUIRED_LANES.filter((lane) => !referenced.includes(lane));
}

/** Lanes that exist in package.json but are not chained into the gate. */
function unchainedExistingLanes(referenced, scripts) {
  return SELF_TIGHTENING_LANES.filter(
    (lane) => lane in scripts && !referenced.includes(lane),
  );
}

function selftest() {
  const assert = require("node:assert/strict");

  assert.deepEqual(
    referencedScripts("npm run lint && npm run test:builder && npm run lint"),
    ["lint", "test:builder"],
    "de-dupes and sorts referenced scripts",
  );
  assert.deepEqual(
    referencedScripts("echo hi"),
    [],
    "a chain that runs nothing references nothing",
  );
  assert.deepEqual(
    referencedScripts("npm run test:e2e:builder-2027-anchor-smoke"),
    ["test:e2e:builder-2027-anchor-smoke"],
    "matches colons, digits and dashes in a lane name",
  );

  assert.deepEqual(
    danglingScripts(["lint", "ghost:lane"], { lint: "x" }),
    ["ghost:lane"],
    "flags a referenced script that does not exist",
  );

  assert.ok(
    missingRequired(["lint"]).includes("test:builder"),
    "flags a dropped REQUIRED lane",
  );
  assert.deepEqual(
    missingRequired(REQUIRED_LANES),
    [],
    "passes when every REQUIRED lane is present",
  );

  assert.deepEqual(
    unchainedExistingLanes([], { "verify:no-embed-bridges": "x" }),
    ["verify:no-embed-bridges"],
    "a phase lane that exists but is not chained is a failure",
  );
  assert.deepEqual(
    unchainedExistingLanes([], {}),
    [],
    "a phase lane that does not exist yet is not a failure",
  );
  assert.deepEqual(
    unchainedExistingLanes(["verify:no-embed-bridges"], {
      "verify:no-embed-bridges": "x",
    }),
    [],
    "chained and existing passes",
  );

  console.log("[check:builder-2027-gate] selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const pkgPath = path.join(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = pkg.scripts ?? {};

  const gate = scripts[GATE_SCRIPT];
  if (!gate) {
    console.error(
      `[check:builder-2027-gate] FAIL — \`${GATE_SCRIPT}\` is missing from package.json.\n` +
        "  The Builder 2027 program's pre-merge gate must exist. See web/docs/builder-2027-ship-gate.md.",
    );
    process.exit(1);
  }

  const referenced = referencedScripts(gate);
  const problems = [];

  const dangling = danglingScripts(referenced, scripts);
  if (dangling.length) {
    problems.push(
      `references ${dangling.length} script(s) that do not exist: ${dangling.join(", ")}\n` +
        "    A renamed or mistyped lane runs nothing and reports success.",
    );
  }

  const missing = missingRequired(referenced);
  if (missing.length) {
    problems.push(
      `is missing ${missing.length} required lane(s): ${missing.join(", ")}\n` +
        "    These are the standing per-commit gate; the ship gate must include them.",
    );
  }

  const unchained = unchainedExistingLanes(referenced, scripts);
  if (unchained.length) {
    problems.push(
      `does not chain ${unchained.length} lane(s) that now exist: ${unchained.join(", ")}\n` +
        "    The phase that added them must wire them into the ship gate, or the\n" +
        "    gate proves less than it appears to.",
    );
  }

  if (problems.length) {
    console.error(`[check:builder-2027-gate] FAIL — \`${GATE_SCRIPT}\`:`);
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }

  console.log(
    `[check:builder-2027-gate] OK — \`${GATE_SCRIPT}\` chains ${referenced.length} lane(s), ` +
      `all resolvable; ${REQUIRED_LANES.length} required present; ` +
      `${SELF_TIGHTENING_LANES.filter((l) => l in scripts).length}/${SELF_TIGHTENING_LANES.length} phase lane(s) landed and chained.`,
  );
}

main();
