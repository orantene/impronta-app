/**
 * No committed script may invoke `tsc --noEmit` outside the machine-wide queue.
 *
 * WHY. `web/scripts/tsc-queue.sh` serialises full typechecks across every
 * checkout on this machine, because concurrent ones starve each other: measured
 * 2026-09-05, three unqueued runs against one queued run turned a gate that
 * normally takes minutes into 1h30m of wall clock for 22m of CPU. The queue
 * works. It is walked around.
 *
 * WHAT THIS GUARD CANNOT DO, stated here and in the test name because a guard
 * whose limit is only known to its author is a guard that will be trusted for
 * something it does not do. Process ancestry on the night this was written
 * showed the three starving runs were `npx tsc --noEmit` typed ad hoc at a
 * shell, with `claude` as the direct parent and no package script involved.
 * NONE of them would have been caught by this file. A committed bypass is the
 * only thing a repo-level check can see; the ad-hoc kind is answered by the
 * rule in CLAUDE.md, not by code. This guard exists so the committed kind
 * cannot quietly reappear later and be blamed on the ad-hoc kind.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Reuse the repo's existing root resolver rather than deriving a second one:
// `import.meta.dirname` is undefined under the tsx CJS transform this lane uses,
// which is a green-looking file that crashes at import time.
import { WEB_ROOT, blankComments } from "./supabase-unchecked-read";

/** The one file allowed to invoke tsc directly: it IS the queue. */
const THE_QUEUE = "scripts/tsc-queue.sh";

/**
 * The two package scripts that predate this guard, recorded rather than swept —
 * house style, and removing someone else's escape hatch is not a guard's call.
 * The point of naming them is that they cannot MULTIPLY: a third one is a test
 * failure. `typecheck:unqueued` is the deliberate hatch and is honestly named;
 * `typecheck:incremental` is a convenience that predates the queue entirely.
 */
const RECORDED_BYPASSES = new Set(["typecheck:unqueued", "typecheck:incremental"]);

/** `tsc --noEmit`, however it is spelled, with any flags in between. */
const INVOCATION = /\btsc\b[^\n|&;]*--noEmit/;

function shellScripts(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) shellScripts(full, acc);
    else if (entry.endsWith(".sh")) acc.push(full);
  }
  return acc;
}

test("no NEW package.json script invokes tsc --noEmit outside the queue", () => {
  const pkg = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const offenders = Object.entries(pkg.scripts ?? {})
    .filter(([name, cmd]) => INVOCATION.test(cmd) && !RECORDED_BYPASSES.has(name))
    .map(([name, cmd]) => `  ${name}: ${cmd}`);

  assert.deepEqual(
    offenders,
    [],
    offenders.length === 0
      ? ""
      : `\n\nThese scripts run a full typecheck without taking the machine-wide lock:\n\n` +
        `${offenders.join("\n")}\n\n` +
        `Route them through the queue instead:\n` +
        `  "typecheck": "bash ${THE_QUEUE}"\n\n` +
        `Concurrent typechecks do not fail — they STARVE, which reads as a slow\n` +
        `machine rather than as a bug, so nothing ever gets blamed for it.\n`,
  );
});

test("no committed shell script invokes tsc --noEmit except the queue itself", () => {
  const offenders = shellScripts(join(WEB_ROOT, "scripts"))
    .filter((f) => !f.endsWith("tsc-queue.sh"))
    .filter((f) => INVOCATION.test(readFileSync(f, "utf8")))
    .map((f) => `  ${f.slice(WEB_ROOT.length + 1)}`);

  assert.deepEqual(
    offenders,
    [],
    offenders.length === 0
      ? ""
      : `\n\nThese shell scripts bypass the typecheck queue:\n\n${offenders.join("\n")}\n`,
  );
});

test("the queue this guard defends still exists and still runs tsc", () => {
  // Without this, deleting or renaming the queue would make the guard above
  // pass trivially and permanently: nothing invokes tsc outside a file that is
  // no longer there. The guard would be green and measuring nothing.
  const queue = readFileSync(join(WEB_ROOT, THE_QUEUE), "utf8");
  assert.match(queue, INVOCATION, `${THE_QUEUE} no longer invokes tsc --noEmit`);
  assert.match(queue, /LOCK="\/tmp\//, `${THE_QUEUE} no longer takes a machine-wide lock`);
});

test("the repo does not INSTRUCT the bypass in its own onboarding script", () => {
  // This is the test that earned this file. `setup-worktree.sh` ended by
  // printing `npx tsc --noEmit` as the next step for every new worktree owner,
  // which is the exact invocation that was starving the queue. The bypass was
  // never really ad hoc: the repo was telling people to do it, and each of them
  // was following instructions correctly.
  const setup = readFileSync(join(WEB_ROOT, "scripts/setup-worktree.sh"), "utf8");
  assert.doesNotMatch(
    blankComments(setup),
    INVOCATION,
    "setup-worktree.sh is telling new worktrees to bypass the typecheck queue",
  );
  assert.match(setup, /npm run typecheck/, "setup-worktree.sh must point at the queued entry point");
});

test("SCOPE: this guard reads the TREE, so it cannot see a bypass nobody committed", () => {
  // Stated as an assertion so a later rewrite cannot quietly widen the claim.
  // The scope is narrower than the problem: a command someone types at a shell
  // leaves nothing in the tree to read. What makes this guard worth having
  // anyway is the finding above — the instructed bypasses ARE committed text,
  // and they are what most of the unqueued runs were faithfully copying.
  const self = readFileSync(join(WEB_ROOT, "src/lib/quality/tsc-queue-bypass.static.test.ts"), "utf8");
  // Assembled from fragments on purpose: written as one regex literal, the
  // assertion MATCHES ITSELF and the test fails for a reason that has nothing
  // to do with the file's behaviour. A check that counts its own source is a
  // known way to measure the wrong thing.
  const processApis = ["child", "_process", "exec", "Sync", "spawn", "Sync"];
  const forbidden = new RegExp(
    [processApis.slice(0, 2).join(""), processApis.slice(2, 4).join(""), processApis.slice(4).join("")].join("|"),
  );
  assert.doesNotMatch(
    blankComments(self),
    forbidden,
    "this guard must not inspect processes; it is a source check",
  );
});
