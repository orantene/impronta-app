/**
 * .github/workflows/qa-host-pool.yml must never let a `_vercel_share` value
 * reach a commit status, a PR comment or a log.
 *
 * WHY. `web/scripts/qa-host.mjs claim` prints a share URL that carries a 23h
 * preview credential (`?_vercel_share=...`). Commit statuses are readable by
 * anyone who can read the repo, so a status whose target_url is that URL hands
 * out access to the QA host, which runs on the PRODUCTION database. The fix
 * (chore/qa-host-share-link, PR #2655) drops the query string and fragment
 * from the claim output before it is used.
 *
 * WHAT THIS FILE DOES NOT PROVE. It reads workflow text and runs `sed` on a
 * sample URL. It cannot see what qa-host.mjs prints at run time, nor what
 * Actions masks. It pins the one property a repo-level check can see: the only
 * thing the workflow ever writes or posts is the stripped value.
 *
 * ORDERING. This test FAILS against a main that lacks the strip. It is meant to
 * merge after #2655.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const WORKFLOW = readFileSync(join(WEB_ROOT, "..", ".github", "workflows", "qa-host-pool.yml"), "utf8");

/** Executable lines: comments dropped, backslash continuations joined. */
function codeLines(text: string): string[] {
  const joined = text.replace(/\\\r?\n\s*/g, " ");
  return joined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

const STRIP_CLAIM =
  /\$\(\s*node\s+\S*qa-host\.mjs\s+claim\b[^)|]*\|\s*sed\s+'(s\/\[\?#\]\.\*\/\/)'\s*\)/;
const ASSIGN_HOST = /^host=\$\(/;
const WRITE_HOST = /^echo\s+"host=\$host"\s*>>\s*"\$GITHUB_OUTPUT"$/;

/** Each entry names one way the workflow can leak a share credential. */
function findLeaks(text: string): string[] {
  const leaks: string[] = [];
  const lines = codeLines(text);

  for (const l of lines) {
    if (l.includes("qa-host.mjs") && /\bclaim\b/.test(l)) {
      if (!ASSIGN_HOST.test(l)) {
        leaks.push(`claim output is not captured into a variable (prints to the log): ${l}`);
      } else if (!STRIP_CLAIM.test(l)) {
        leaks.push(`claim output is captured without stripping the query string: ${l}`);
      }
    }
    if (l.includes("_vercel_share")) leaks.push(`literal _vercel_share outside a comment: ${l}`);
    if (/\bset\s+-[a-z]*x|\bbash\s+-[a-z]*x|ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG/.test(l)) {
      leaks.push(`shell tracing or runner debug traces every command: ${l}`);
    }
    if (/\bgh\s+(pr|issue)\s+comment\b|createComment|\/comments\b|pulls\/\S*\/reviews/.test(l)) {
      leaks.push(`posts a PR or issue comment: ${l}`);
    }
    if (/^(echo|printf|tee|cat)\b/.test(l) && !WRITE_HOST.test(l)) {
      leaks.push(`prints something other than the stripped host: ${l}`);
    }
    if (/::set-output|::notice|::warning|::error/.test(l)) {
      leaks.push(`workflow command can surface a value in the log or annotations: ${l}`);
    }
  }

  const steps = text.split(/\n\s*- (?:name|uses):/);
  for (const s of steps) {
    const mentionsClaimOutput = /steps\.claim\.outputs\./.test(s);
    if (mentionsClaimOutput && !/steps\.claim\.outputs\.host\b/.test(s)) {
      leaks.push("a step reads a claim output other than the stripped `host`");
    }
  }
  return leaks;
}

test("the current workflow has no path for a _vercel_share value to leak", () => {
  assert.deepEqual(
    findLeaks(WORKFLOW),
    [],
    "qa-host-pool.yml can publish the share credential. Pipe the claim output\n" +
      "through `sed 's/[?#].*//'` (PR #2655) and never echo it.",
  );
});

test("the claim step strips the query string and fragment before use", () => {
  const claim = codeLines(WORKFLOW).find((l) => l.includes("qa-host.mjs") && /\bclaim\b/.test(l));
  assert.ok(claim, "no `qa-host.mjs claim` line found; the guard is measuring nothing");
  const m = STRIP_CLAIM.exec(claim);
  assert.ok(m, `claim line does not pipe through the sed strip: ${claim}`);
  const stripped = execFileSync("sed", [m[1]], {
    input: "https://qa-3.tulala.digital/?_vercel_share=SECRET123#frag\n",
    encoding: "utf8",
  });
  assert.equal(stripped, "https://qa-3.tulala.digital/\n");
  assert.ok(!stripped.includes("SECRET123"));
});

test("the commit status takes its target from the stripped step output only", () => {
  const lines = codeLines(WORKFLOW);
  assert.ok(lines.some((l) => WRITE_HOST.test(l)), "the stripped host is never written to GITHUB_OUTPUT");
  assert.ok(
    lines.some((l) => /^HOST:\s*\$\{\{\s*steps\.claim\.outputs\.host\s*\}\}$/.test(l)),
    "the status step does not read HOST from steps.claim.outputs.host",
  );
  assert.ok(
    lines.some((l) => l.includes("target_url=") && l.includes("$HOST")),
    "the status call does not post target_url from $HOST",
  );
});

/**
 * Self-contained copy of the fixed claim and status steps, so the bite tests
 * below do not depend on whether #2655 has merged.
 */
const FIXED = `
      - name: Claim a QA host
        id: claim
        run: |
          # comment mentioning ?_vercel_share=... is allowed
          host=$(node web/scripts/qa-host.mjs claim "$REF" | sed 's/[?#].*//')
          echo "host=$host" >> "$GITHUB_OUTPUT"
      - name: Post commit status
        env:
          HOST: \${{ steps.claim.outputs.host }}
        run: |
          gh api "repos/x/statuses/$SHA" -f state=success -f target_url="$HOST"
`;

test("GUARD BITES: the fixed fixture is clean", () => {
  assert.deepEqual(findLeaks(FIXED), []);
});

test("GUARD BITES: the pre-fix claim step is reported", () => {
  const prefix = FIXED.replace(" | sed 's/[?#].*//'", "");
  assert.notEqual(prefix, FIXED);
  assert.ok(findLeaks(prefix).some((l) => l.includes("without stripping")));
});

test("GUARD BITES: echoing the raw claim output is reported", () => {
  const leaky = FIXED.replace(
    'echo "host=$host" >> "$GITHUB_OUTPUT"',
    'echo "claimed $host"\n          echo "host=$host" >> "$GITHUB_OUTPUT"',
  );
  assert.notEqual(leaky, FIXED);
  assert.ok(findLeaks(leaky).some((l) => l.includes("prints something other")));
});

test("GUARD BITES: a bare claim call, a PR comment and shell tracing are reported", () => {
  const bare = FIXED.replace(/host=\$\((node [^|]*)\|[^)]*\)/, "$1");
  assert.ok(findLeaks(bare).some((l) => l.includes("prints to the log")));
  assert.ok(findLeaks(FIXED + '\n          gh pr comment 1 --body "$HOST"\n').some((l) => l.includes("comment")));
  assert.ok(findLeaks(FIXED.replace("run: |\n", "run: |\n          set -x\n")).some((l) => l.includes("tracing")));
});
