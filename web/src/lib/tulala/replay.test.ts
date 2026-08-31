/**
 * The corpus, as a test.
 *
 * This is the file that makes an engine rule change safe to ship: it answers
 * "what else did that move?" for every shape the business must not misprice,
 * which is not a question anyone can answer by reading the rule they changed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { REPLAY_FIXTURES } from "./replay-fixtures";
import { REPLAY_CATALOG, caseSignature, replayAll, replayCase } from "./replay";
import { isKnownFactKey, validateFactValue } from "./fact-keys";

test("every fixture matches its expectations", () => {
  const failures = replayAll().filter((r) => r.mismatches.length > 0);
  if (failures.length > 0) {
    const report = failures
      .map(
        (f) =>
          `\n  ${f.fixture.id} — ${f.fixture.describe}\n` +
          f.mismatches
            .map((m) => `      ${m.field}: expected ${String(m.expected)}, got ${String(m.actual)}`)
            .join("\n") +
          `\n      why this case exists: ${f.fixture.why}`,
      )
      .join("\n");
    assert.fail(`${failures.length} fixture(s) drifted:${report}\n`);
  }
});

test("fixture ids are unique and stable-looking", () => {
  const ids = REPLAY_FIXTURES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9-]+$/, `${id} should be kebab-case so it survives renaming pressure`);
  }
});

test("every fixture fact key AND value is valid", () => {
  // Values matter as much as keys. A fixture carrying `own_place` when the
  // vocabulary says `own_premises` still exercises the engine (which reads the
  // key), so it passes, while asserting behaviour that could never occur in
  // production. The corpus has to be made of facts that could actually exist.
  for (const fixture of REPLAY_FIXTURES) {
    for (const [key, value] of fixture.facts) {
      assert.ok(isKnownFactKey(key), `${fixture.id}: unknown key ${key}`);
      const check = validateFactValue(key, value);
      assert.ok(check.ok, `${fixture.id}: ${key} = ${JSON.stringify(value)} — ${check.ok ? "" : check.error}`);
    }
  }
});

test("every fixture explains why it exists", () => {
  // A fixture nobody can justify is a fixture that gets deleted the first time
  // it goes red, which is exactly when it was doing its job.
  for (const fixture of REPLAY_FIXTURES) {
    assert.ok(fixture.why.length > 40, `${fixture.id} needs a real justification`);
    assert.ok(fixture.describe.length > 10, `${fixture.id} needs a description`);
    assert.ok(Object.keys(fixture.expect).length > 0, `${fixture.id} asserts nothing`);
  }
});

test("replay is deterministic across runs", () => {
  // The engine's whole value proposition. If two runs over identical facts
  // disagree, no measurement taken from it means anything.
  const a = replayAll().map(caseSignature);
  const b = replayAll().map(caseSignature);
  assert.deepEqual(a, b);
});

test("the frozen catalog keeps the traps that make the corpus meaningful", () => {
  const website = REPLAY_CATALOG.workspace.find((p) => p.planKey === "website");
  // If Website ever stops seating zero here, the seat-cap fixtures silently stop
  // testing anything and the salaried-staff regression can come back unnoticed.
  assert.equal(website?.rosterSeats, 0);
  const free = REPLAY_CATALOG.workspace.find((p) => p.planKey === "free");
  assert.ok((free?.rosterSeats ?? 0) > 0, "Free must seat someone for the cheaper-and-abler case");
  assert.ok((website?.monthlyPriceCents ?? 0) > (free?.monthlyPriceCents ?? 0));
  const network = REPLAY_CATALOG.workspace.find((p) => p.planKey === "network");
  assert.equal(network?.isSellableNow, false, "an unsellable tier must stay in the corpus");
});

test("signatures are single-line and include the plan decision", () => {
  for (const result of replayAll()) {
    const line = caseSignature(result);
    assert.ok(!line.includes("\n"));
    assert.ok(line.includes("sell="));
  }
});

test("a deliberately wrong expectation is reported, not swallowed", () => {
  // Self-test. A harness whose diffing is broken passes everything, which is
  // indistinguishable from an engine with no bugs.
  const real = REPLAY_FIXTURES.find((f) => f.id === "nails-from-home");
  assert.ok(real);
  const sabotaged = { ...real, expect: { ...real.expect, workspace: true } };
  const result = replayCase(sabotaged);
  assert.ok(result.mismatches.some((m) => m.field === "structure.workspace"));
});
