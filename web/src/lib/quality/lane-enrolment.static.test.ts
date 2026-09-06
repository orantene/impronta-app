import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
// WEB_ROOT, not `import.meta.dirname`: the latter is undefined under `tsx` in CI,
// which failed this file at LOAD with ERR_INVALID_ARG_TYPE while every assertion
// in it was correct. The siblings all derive the root from `import.meta.url`.
import { classifyLanes, ungatedLanes } from "./lane-enrolment";
import { WEB_ROOT } from "./supabase-unchecked-read";

const WEB = WEB_ROOT;
const scripts = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")).scripts as Record<string, string>;
const workflow = readFileSync(join(WEB, "..", ".github", "workflows", "ci.yml"), "utf8");
const baseline = JSON.parse(
  readFileSync(join(WEB, "src", "lib", "quality", "lane-enrolment.baseline.json"), "utf8"),
) as { count: number; lanes: string[] };

test("no lane is ungated that was not already", () => {
  const found = ungatedLanes(classifyLanes(scripts, workflow));
  const known = new Set(baseline.lanes);
  const added = found.filter((l) => !known.has(l));
  assert.deepEqual(
    added,
    [],
    `These lanes are defined in package.json and run NOWHERE — not in the \`ci\`\n` +
      `chain, not in ci.yml, not prefixed \`manual:\`. A lane in neither list is\n` +
      `invisible to check:ci-lane-parity, which walks the aggregate and can only\n` +
      `find gaps in what it walks. That is how test:access gated nothing for its\n` +
      `whole life while parity reported "46 lanes OK".\n\n` +
      `Wire it into the ci chain or ci.yml, or rename it \`manual:<name>\`:\n` +
      added.map((l) => `  ${l}`).join("\n"),
  );
});

test("a lane that got wired is reported, and does NOT fail the build", () => {
  // DIRECTION IS DELIBERATE. Growth fails; shrink does not. A lane leaving the
  // list means somebody wired it or declared it manual — the outcome this guard
  // exists to produce. Reddening main for doing the right thing is how two
  // ratchets took main down on 2026-09-05.
  const found = new Set(ungatedLanes(classifyLanes(scripts, workflow)));
  const resolved = baseline.lanes.filter((l) => !found.has(l));
  if (resolved.length > 0) {
    console.log(
      `[lane-enrolment] ${resolved.length} lane(s) are no longer ungated. ` +
        `Re-record the baseline so the count stays honest:\n` +
        resolved.map((l) => `  ${l}`).join("\n"),
    );
  }
  assert.ok(true);
});

test("the baseline's count matches its own list", () => {
  // An un-recorded shrink is visible here rather than silent: if someone edits
  // the list without the count, this fails and says so.
  assert.equal(baseline.count, baseline.lanes.length);
});

test("GUARD BITES: an invented ungated lane is reported", () => {
  const withFake = { ...scripts, "test:invented-lane-that-runs-nowhere": "tsx --test nothing.ts" };
  const found = ungatedLanes(classifyLanes(withFake, workflow));
  assert.ok(
    found.includes("test:invented-lane-that-runs-nowhere"),
    "the guard did not notice a lane wired to nothing — it is measuring nothing",
  );
});

test("GUARD BITES: a lane named in ci.yml is NOT reported", () => {
  const found = ungatedLanes(classifyLanes(scripts, workflow));
  assert.ok(!found.includes("test:phase1-i18n"), "a wired lane was called ungated");
});

test("a lane name is matched on a word boundary, not a prefix", () => {
  // `test:money` must not be satisfied by a workflow line running `test:moneybox`.
  const found = ungatedLanes(classifyLanes({ ...scripts, "test:acces": "x" }, workflow));
  assert.ok(found.includes("test:acces"), "prefix collision let an ungated lane pass");
});
