/**
 * ci-gate-split.static.test.ts - pins TUL-1770 part 2: the structural gate is
 * several parallel jobs plus ONE aggregator that keeps the required check name.
 *
 * WHY: one job running tsc + lint + ~90 test lanes + `next build` hit its
 * timeout under runner load, and a timeout reports `cancelled`, which blocks
 * promote-production. The work is split so each job finishes well under its
 * cap. The names `CI — structural quality gate` (workflow) and
 * `Structural quality gate` (job) are consumed by the required status check,
 * promote-production.yml, main-red-alert.yml, alias-guard.mjs and
 * ci-full-ci-rerun.yml, so the aggregator must keep them and must fail when
 * any worker job fails, is cancelled (timeout) or is skipped.
 *
 * HOW TO REACT WHEN THIS FAILS: a new gate step goes in exactly ONE worker job
 * (`build`, `static`, `tests_a`, `tests_b`); a new worker job must be added to
 * the aggregator's `needs`. Never rename the aggregator.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const ci = readFileSync(path.join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");

type Job = { id: string; text: string; name: string; steps: string[] };

/** Top-level jobs, parsed from text (js-yaml is not a web dependency). */
function jobs(): Job[] {
  const body = ci.split(/^jobs:\n/m)[1];
  assert.ok(body, "ci.yml has a jobs: block");
  const parts = body.split(/^ {2}([a-z_][a-z0-9_-]*):\n/m);
  const out: Job[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1];
    const name = text.match(/^ {4}name: (.+)$/m)?.[1].trim() ?? "";
    const stepsBlock = text.split(/^ {4}steps:\n/m)[1] ?? "";
    const steps = [...stepsBlock.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1].trim());
    out.push({ id: parts[i], text, name, steps });
  }
  return out;
}

const J = jobs();
const byId = (id: string) => {
  const j = J.find((x) => x.id === id);
  assert.ok(j, `job ${id} exists`);
  return j;
};
const WORKERS = ["build", "static", "tests_a", "tests_b"];

test("workflow name is unchanged", () => {
  assert.match(ci, /^name: CI — structural quality gate$/m);
});

test("the aggregator is named exactly 'Structural quality gate', waits on every other gate job and always runs", () => {
  const gate = byId("gate");
  assert.equal(gate.name, "Structural quality gate");
  assert.equal(J.filter((j) => j.name === "Structural quality gate").length, 1);
  const needs = gate.text.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((s) => s.trim());
  assert.ok(needs, "aggregator declares needs: [...]");
  const gateJobs = J.filter((j) => j.id !== "gate" && j.id !== "typecheck").map((j) => j.id);
  assert.deepEqual([...needs].sort(), [...gateJobs].sort());
  assert.ok(WORKERS.every((w) => needs.includes(w)) && needs.includes("policy"));
  assert.match(gate.text, /^ {4}if: \$\{\{ always\(\) && \(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false\) \}\}$/m);
  // Fails unless every needed job succeeded (cancelled, timed out and skipped all count as not ok).
  assert.match(gate.text, /v\.result !== "success"/);
  assert.match(gate.text, /process\.exit\(1\)/);
  // ci-full-ci-rerun.yml looks for a "Gate policy" step on this job.
  assert.ok(gate.steps.some((s) => s.startsWith("Gate policy")));
});

test("worker jobs depend on policy and the policy job decides, not the workers", () => {
  for (const id of WORKERS) {
    assert.match(byId(id).text, /^ {4}needs: policy$/m, `${id} needs policy`);
    assert.match(byId(id).text, /needs\.policy\.outputs\.run == 'true'/);
    assert.doesNotMatch(byId(id).text, /steps\.policy\.outputs/);
  }
  assert.match(byId("policy").text, /^ {4}outputs:\n {6}run: \$\{\{ steps\.policy\.outputs\.run \}\}$/m);
});

test("every job has a timeout; workers are capped at 45 minutes", () => {
  for (const j of J) {
    const m = j.text.match(/^ {4}timeout-minutes: (\d+)$/m);
    assert.ok(m, `job ${j.id} has timeout-minutes`);
    if (WORKERS.includes(j.id)) assert.ok(Number(m[1]) <= 45, `${j.id} timeout ${m[1]} <= 45`);
  }
});

test("workers each check out, set up Node 22 and npm ci", () => {
  for (const id of WORKERS) {
    const t = byId(id).text;
    assert.match(t, /uses: actions\/checkout@v4/);
    assert.match(t, /uses: actions\/setup-node@v4/);
    assert.match(t, /node-version: '22'/);
    assert.match(t, /run: npm ci/);
    assert.match(t, /working-directory: web/);
  }
});

test("each pre-split gate step lives in exactly one worker job", () => {
  // The old single `gate` job's steps (minus checkout/setup/install, which every
  // worker repeats, and the policy step, which moved to its own job).
  const placed = new Map<string, string[]>();
  for (const id of WORKERS) {
    for (const s of byId(id).steps) placed.set(s, [...(placed.get(s) ?? []), id]);
  }
  for (const [s, where] of placed) {
    if (/^(Checkout|Setup Node|Install dependencies)/.test(s)) continue;
    assert.equal(where.length, 1, `step "${s}" appears in ${where.join(",")}`);
  }
  const must: Record<string, string> = {
    "build — next production build (bundle gate)": "build",
    "build — no phantom client chunks": "build",
    "perf — admin and POS bundle budget": "build",
    "tsc — error count ≤ BASE": "static",
    "lint — no new errors past the baseline": "static",
    "suppressions — eslint-suppressions.json total ≤ BASE": "static",
    "Builder perf budget": "static",
    "field catalog frozen (no new fields without a migration)": "static",
    "verify — ci.yml gates every `npm run ci` test lane": "static",
    "verify — Builder 2027 ship gate is well-formed": "static",
    "tests — access control": "tests_a",
    "tests — builder": "tests_a",
    "tests — a11y": "tests_a",
    "tests — size ratchet": "tests_b",
    "tests — money": "tests_b",
    "tests — components (vitest smoke)": "tests_b",
  };
  for (const [step, id] of Object.entries(must)) {
    assert.deepEqual(placed.get(step), [id], `"${step}" belongs in ${id}`);
  }
  assert.equal(placed.size >= 85, true, `only ${placed.size} worker steps found`);
});

test("TSC and suppression bases stay with the job that uses them", () => {
  assert.match(byId("static").text, /^ {6}TSC_BASE: 0 /m);
  assert.match(byId("static").text, /^ {6}SUPPRESSIONS_BASE: \d+ /m);
  for (const id of ["build", "tests_a", "tests_b"]) {
    assert.doesNotMatch(byId(id).text, /TSC_BASE|SUPPRESSIONS_BASE/);
  }
});

test("the build job keeps the placeholder env and heap for next build", () => {
  const t = byId("build").text;
  assert.match(t, /NEXT_PUBLIC_SUPABASE_URL: https:\/\/placeholder\.supabase\.co/);
  assert.match(t, /NODE_OPTIONS: --max-old-space-size=11264/);
  assert.match(t, /run: npx next build/);
});

test("the top-level concurrency block is unchanged", () => {
  assert.match(
    ci,
    /^concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref == 'refs\/heads\/main' && github\.sha \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m,
  );
});

test("the non-required PR typecheck job is untouched in shape", () => {
  const t = byId("typecheck");
  assert.equal(t.name, "Typecheck (tsc only)");
  assert.doesNotMatch(t.text, /needs:/);
});

test("consumers of the check name still match", () => {
  const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
  assert.match(read(".github/workflows/promote-production.yml"), /GATE_WORKFLOW: "CI — structural quality gate"/);
  assert.match(read(".github/workflows/main-red-alert.yml"), /"CI — structural quality gate"/);
  assert.match(read("web/scripts/lib/alias-guard.mjs"), /MAIN_GATE_WORKFLOW = "CI — structural quality gate"/);
  const rerun = read(".github/workflows/ci-full-ci-rerun.yml");
  assert.match(rerun, /select\(\.name == "Structural quality gate"\)/);
  assert.match(rerun, /startswith\("Gate policy"\)/);
});
