/**
 * copy.static.test.ts — one sentence, guarded against being said again.
 *
 * "Nothing was changed." is a claim about the world, and the runner is the
 * only thing in a position to make it. It used to be printed on every failure,
 * including the ones where a handler had written three rows and then thrown.
 * A behavioural test can prove `failureMessage("unknown")` does not say it
 * today; it cannot stop somebody pasting the reassuring sentence into a new
 * branch tomorrow, and that branch would look exactly as correct as the
 * others.
 *
 * So the phrase itself is counted. Two occurrences in `run.ts`, both reachable
 * only under effects 'none', and any third one fails this file. A static test
 * is a weak instrument used deliberately: the line it protects produces no
 * failure anywhere else when it changes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { WEB_ROOT } from "@/lib/quality/supabase-unchecked-read";
import { failureMessage, type CommandEffects } from "./run";

const RUN_SRC = readFileSync(join(WEB_ROOT, "src/lib/commands/run.ts"), "utf8");
const PHRASE = "Nothing was changed";

/** Comment lines mention the phrase to explain it. Those are not the copy. */
function codeLinesMentioning(source: string, phrase: string): Array<[number, string]> {
  return source
    .split("\n")
    .map((line, index): [number, string] => [index + 1, line])
    .filter(([, line]) => {
      if (!line.includes(phrase)) return false;
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    });
}

test("only the 'none' effect is allowed to claim nothing changed", () => {
  const all: CommandEffects[] = ["none", "partial", "unknown"];
  for (const effects of all) {
    const message = failureMessage(effects, "the receipt was written and the ticket was not");
    assert.equal(
      message.includes(PHRASE),
      effects === "none",
      `effects '${effects}' produced the wrong promise: ${message}`,
    );
  }
});

test("the three failure sentences are the ones the operator was promised", () => {
  assert.equal(failureMessage("none", "x"), "That did not go through. Nothing was changed.");
  assert.equal(
    failureMessage("partial", "the receipt was written and the ticket was not"),
    "Partly applied: the receipt was written and the ticket was not. Do not retry blindly.",
  );
  assert.equal(failureMessage("unknown", "x"), "It may have gone through. Check before retrying.");
});

test("a partial detail that already ends in a full stop does not double it", () => {
  assert.equal(
    failureMessage("partial", "the hold was released."),
    "Partly applied: the hold was released. Do not retry blindly.",
  );
});

test("no failure sentence contains an em dash", () => {
  const all: CommandEffects[] = ["none", "partial", "unknown"];
  for (const effects of all) {
    assert.ok(!failureMessage(effects, "a detail").includes("—"), effects);
  }
});

test("the phrase appears in exactly two places in the runner", () => {
  const hits = codeLinesMentioning(RUN_SRC, PHRASE);
  assert.equal(
    hits.length,
    2,
    `"${PHRASE}" is written in ${hits.length} places in run.ts, not 2: ` +
      `${hits.map(([n]) => `line ${n}`).join(", ")}. A new one has to earn effects 'none'.`,
  );

  const lines = RUN_SRC.split("\n");
  const [first, second] = hits;

  // One is the constant for a claim that never landed.
  assert.match(
    first[1],
    /^const COULD_NOT_START = /,
    `the first occurrence moved off the COULD_NOT_START constant: ${first[1].trim()}`,
  );

  // The other is the 'none' arm of `failureMessage`, and the case label
  // immediately above it is what makes that true.
  assert.match(
    lines[second[0] - 2],
    /case "none":/,
    `the second occurrence is not under case "none": ${lines[second[0] - 2].trim()}`,
  );
});

test("the pre-claim sentence is only ever returned alongside effects 'none'", () => {
  // No `s` flag: `[^{}]` already spans newlines, and the flag needs an ES2018
  // target this project does not set.
  const returns = RUN_SRC.match(/return \{[^{}]*\};/g) ?? [];
  const carrying = returns.filter((statement) => statement.includes("COULD_NOT_START"));

  assert.equal(carrying.length, 1, "COULD_NOT_START is returned from more than one place");
  for (const statement of carrying) {
    assert.match(
      statement,
      /effects: "none"/,
      `a return promises nothing changed without asserting it:\n${statement}`,
    );
  }

  // And it is referenced nowhere except its definition and those returns, so
  // there is no third path that could reach the sentence.
  const total = (RUN_SRC.match(/COULD_NOT_START/g) ?? []).length;
  const inReturns = carrying.reduce(
    (n, statement) => n + (statement.match(/COULD_NOT_START/g) ?? []).length,
    0,
  );
  assert.equal(
    total,
    inReturns + 1,
    "COULD_NOT_START is used somewhere that is not an effects 'none' return",
  );
});

test("the fenced sentence promises nothing about what happened", () => {
  // A fenced runner's handler ran to completion AND another runner is very
  // likely running the same one. Neither "it worked" nor "nothing happened".
  const fenced = /const FENCED = "([^"]+)"/.exec(RUN_SRC);
  assert.ok(fenced, "the fenced copy was renamed and this guard stopped measuring it");
  assert.ok(!fenced[1].includes(PHRASE), `a fenced runner cannot promise that: ${fenced[1]}`);
  assert.ok(!fenced[1].includes("—"), "no em dashes in user-facing copy");
  assert.match(fenced[1], /Check before retrying\./);
});

test("the time-based staleness constant is gone", () => {
  // It is the defect, not a tuning knob: a claim's age says when work STARTED,
  // and two runners comparing the same age both concluded they had won.
  assert.ok(
    !/STALE_CLAIM_MS/.test(RUN_SRC),
    "run.ts still decides takeover on elapsed time rather than on a lease",
  );
  assert.match(RUN_SRC, /command_claim/, "the claim no longer goes through the fencing RPC");
  assert.match(RUN_SRC, /command_complete/, "the stamp no longer goes through the fencing RPC");
  assert.match(RUN_SRC, /command_heartbeat/);
});
