/**
 * TUL-288: test lanes must never hand Node 22 a bracketed path.
 *
 * Node 22's `node --test` treats every argument as a glob. A literal
 * `src/app/t/[profileCode]/x.test.ts` is a character class that matches nothing
 * and is SILENTLY dropped when other arguments match (exit 0). 62 test files sat
 * in that hole. The shell also expands an unquoted `src/app/t/*` + `/_chat/x`
 * star-glob to the literal bracket path before Node sees it.
 *
 * The contract this file pins:
 *   1. no `test:*` lane token contains `[` or `]`;
 *   2. no UNQUOTED star-glob token expands (by the shell) to a bracketed path;
 *   3. every lane that names bracketed files runs through scripts/lane-test.cjs,
 *      which resolves each argument itself and FAILS on a zero-match argument;
 *   4. every test-file argument in a `test:*` lane resolves to at least one file;
 *   5. scripts/lane-quarantine.json is an explicit allow-list that cannot grow
 *      silently and cannot hold a stale entry.
 * Each guard has a synthetic self-test so it cannot pass vacuously.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { WEB_ROOT } from "./supabase-unchecked-read";

type LanePaths = {
  toNodeArg: (rel: string, major?: number) => string;
  resolveLaneArg: (arg: string, root?: string) => string[];
  resolveLaneArgs: (args: string[], root?: string) => { files: string[]; empty: string[] };
};
const lanePaths = createRequire(join(WEB_ROOT, "package.json"))("./scripts/lane-paths.cjs") as LanePaths;

const scripts = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")).scripts as Record<string, string>;

/** Shell-ish tokenizer: whitespace splits, quotes and `$( )` group. Returns raw tokens. */
export function tokenizeLane(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < cmd.length; i += 1) {
    const c = cmd[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (depth > 0) {
      cur += c;
      if (c === "(") depth += 1;
      if (c === ")") depth -= 1;
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === "$" && cmd[i + 1] === "(") {
      depth = 1;
      cur += "$(";
      i += 1;
    } else if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const isTestFileToken = (t: string) => /\.test\.(ts|tsx|mjs)'?$/.test(t);

/** Violations of rules 1-3 over a scripts map (pure; the self-tests feed it fakes). */
export function laneViolations(map: Record<string, string>, root: string): string[] {
  const bad: string[] = [];
  for (const [lane, cmd] of Object.entries(map)) {
    if (!lane.startsWith("test:")) continue;
    const tokens = tokenizeLane(cmd);
    let namesBracketFiles = false;
    for (const token of tokens) {
      if (/[[\]]/.test(token)) bad.push(`${lane}: token contains a bracket: ${token}`);
      const unquoted = !/^['"]/.test(token) && !token.startsWith("$(");
      if (isTestFileToken(token) && token.includes("*")) {
        const hits = lanePaths.resolveLaneArg(token.replace(/^'|'$/g, ""), root).filter((f) => /[[\]]/.test(f));
        if (hits.length > 0) {
          namesBracketFiles = true;
          if (unquoted) bad.push(`${lane}: unquoted star-glob expands to a bracketed path in the shell: ${token}`);
        }
      } else if (isTestFileToken(token) && token.includes("?")) {
        const hits = lanePaths.resolveLaneArg(token.replace(/^'|'$/g, ""), root).filter((f) => /[[\]]/.test(f));
        if (hits.length > 0) namesBracketFiles = true;
      }
    }
    if (namesBracketFiles && !cmd.includes("scripts/lane-test.cjs")) {
      bad.push(`${lane}: names bracketed test files but does not run through scripts/lane-test.cjs`);
    }
  }
  return bad;
}

/** Rule 4: test-file arguments that match no file. */
export function zeroMatchArgs(map: Record<string, string>, root: string): string[] {
  const bad: string[] = [];
  for (const [lane, cmd] of Object.entries(map)) {
    if (!lane.startsWith("test:")) continue;
    for (const token of tokenizeLane(cmd)) {
      if (!isTestFileToken(token) || token.startsWith("$(")) continue;
      const arg = token.replace(/^'|'$/g, "");
      if (lanePaths.resolveLaneArg(arg, root).length === 0) bad.push(`${lane}: ${arg}`);
    }
  }
  return bad;
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lane-bracket-"));
  mkdirSync(join(root, "src", "app", "t", "[code]", "_chat"), { recursive: true });
  mkdirSync(join(root, "src", "app", "(ws)", "[slug]"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  writeFileSync(join(root, "src", "app", "t", "[code]", "_chat", "a.test.ts"), "");
  writeFileSync(join(root, "src", "app", "(ws)", "[slug]", "b.test.ts"), "");
  writeFileSync(join(root, "src", "lib", "c.test.ts"), "");
  return root;
}

test("no test lane token contains a bracket, expands unquoted to one, or skips lane-test.cjs", () => {
  assert.deepEqual(laneViolations(scripts, WEB_ROOT), []);
});

test("every test-file argument in a test lane resolves to at least one file", () => {
  assert.deepEqual(zeroMatchArgs(scripts, WEB_ROOT), []);
});

test("GUARD BITES: laneViolations flags a bracket token, an unquoted star-glob and a missing wrapper", () => {
  const root = fixtureRoot();
  const fake = {
    "test:a": "tsx --test 'src/app/t/[code]/_chat/a.test.ts'",
    "test:b": "tsx --test src/app/t/*/_chat/a.test.ts",
    "test:c": "tsx --test 'src/app/t/?code?/_chat/a.test.ts'",
    "test:ok": "node scripts/lane-test.cjs 'src/app/t/*/_chat/a.test.ts' src/lib/c.test.ts",
    "check:ignored": "x '[bracket]'",
  };
  const found = laneViolations(fake, root);
  assert.ok(found.some((v) => v.startsWith("test:a:") && v.includes("bracket")));
  assert.ok(found.some((v) => v.startsWith("test:b:") && v.includes("unquoted star-glob")));
  assert.ok(found.some((v) => v.startsWith("test:b:") && v.includes("lane-test.cjs")));
  assert.ok(found.some((v) => v.startsWith("test:c:") && v.includes("lane-test.cjs")));
  assert.ok(!found.some((v) => v.startsWith("test:ok:")));
  assert.ok(!found.some((v) => v.startsWith("check:")));
});

test("GUARD BITES: zeroMatchArgs flags an argument that names nothing", () => {
  const root = fixtureRoot();
  const fake = {
    "test:gone": "tsx --test src/lib/c.test.ts src/lib/missing.test.ts 'src/nope/*/x.test.ts'",
  };
  const found = zeroMatchArgs(fake, root);
  assert.deepEqual(found, ["test:gone: src/lib/missing.test.ts", "test:gone: src/nope/*/x.test.ts"]);
});

test("lane-paths: resolves stars and ? to real bracketed files, and reports empty arguments", () => {
  const root = fixtureRoot();
  const r = lanePaths.resolveLaneArgs(
    ["src/app/t/*/_chat/a.test.ts", "src/app/(ws)/?slug?/b.test.ts", "src/app/t/[code]/_chat/a.test.ts", "src/lib/none.test.ts"],
    root,
  );
  assert.deepEqual(r.files, ["src/app/t/[code]/_chat/a.test.ts", "src/app/(ws)/[slug]/b.test.ts"]);
  assert.deepEqual(r.empty, ["src/lib/none.test.ts"]);
});

test("lane-paths: the Node-version form (22 gets ?, 20 keeps the literal path)", () => {
  assert.equal(lanePaths.toNodeArg("src/app/t/[profileCode]/x.test.ts", 22), "src/app/t/?profileCode?/x.test.ts");
  assert.equal(lanePaths.toNodeArg("src/app/(w)/[a]/[b]/x.test.ts", 24), "src/app/(w)/?a?/?b?/x.test.ts");
  assert.equal(lanePaths.toNodeArg("src/app/t/[profileCode]/x.test.ts", 20), "src/app/t/[profileCode]/x.test.ts");
});

test("RUNTIME: on this Node, the lane form of a bracketed folder runs next to a plain file", () => {
  const root = mkdtempSync(join(tmpdir(), "lane-node-"));
  mkdirSync(join(root, "(w)", "[x]"), { recursive: true });
  mkdirSync(join(root, "y"), { recursive: true });
  const body = "import { test } from 'node:test'; test('t', () => {});\n";
  writeFileSync(join(root, "(w)", "[x]", "a.test.mjs"), body);
  writeFileSync(join(root, "y", "b.test.mjs"), body);
  const args = ["(w)/[x]/a.test.mjs", "y/b.test.mjs"].map((p) => lanePaths.toNodeArg(p));
  // NODE_TEST_CONTEXT marks "already inside a test run"; a child inheriting it refuses to run files.
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "" };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ["--test", ...args], { cwd: root, encoding: "utf8", env });
  const out = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 0, out);
  assert.match(out, /# tests 2\b|ℹ tests 2\b/, `both files must run, got: ${out.slice(0, 400)}`);
});

// ── scripts/lane-quarantine.json: an explicit allow-list that cannot grow ────────────────────
// A quarantined file is removed from its lane by scripts/lane-test.cjs. The list is pinned HERE:
// adding an entry without editing PINNED in the same PR fails; an entry whose file is gone fails
// (stale entries must be deleted, and a fixed test must be removed from the list).
const PINNED_QUARANTINE: readonly string[] = [];

type QuarantineEntry = { file: string; lane: string; reason: string; owner: string; card: string };
const quarantine = JSON.parse(readFileSync(join(WEB_ROOT, "scripts", "lane-quarantine.json"), "utf8")) as {
  entries: QuarantineEntry[];
};

test("lane-quarantine.json equals the pinned list and every entry is complete and live", () => {
  assert.deepEqual(
    quarantine.entries.map((e) => e.file).sort(),
    [...PINNED_QUARANTINE].sort(),
    "the quarantine list changed: update PINNED_QUARANTINE in the same PR (and file a card per entry)",
  );
  for (const e of quarantine.entries) {
    assert.ok(existsSync(join(WEB_ROOT, e.file)), `stale quarantine entry (file gone): ${e.file}`);
    assert.ok(e.lane && e.reason && e.owner && e.card, `incomplete quarantine entry: ${e.file}`);
  }
});

test("GUARD BITES: a quarantine list that differs from the pin is detected", () => {
  const grown = ["a.test.ts"];
  assert.notDeepEqual(grown.sort(), [...PINNED_QUARANTINE].sort());
});
