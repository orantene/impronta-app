/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS check script. */
/**
 * check:ci-lane-parity — assert .github/workflows/ci.yml runs every `test:*`
 * lane that the `ci` aggregate script (package.json) runs.
 *
 * WHY: the GitHub Actions gate invokes a hand-curated list of `npm run test:*`
 * steps, NOT `npm run ci`. When a lane is added to the `ci` aggregate but not to
 * ci.yml, it silently never gates a PR. That drift is exactly how
 * test:builder + test:builder-chrome (and test:money / test:billing /
 * test:fields / test:notifications / test:reviews) went ungated — a behavioral
 * regression could land on `main` with a green check. This guard turns that
 * drift into a red CI step the moment it reappears.
 *
 * INVARIANT: { test:* lanes referenced by pkg.scripts.ci } ⊆ { `npm run test:*`
 * steps present in ci.yml }. ci.yml running EXTRA lanes (e.g. test:components,
 * which is intentionally not in the `ci` chain) is allowed — the check is
 * one-directional on purpose.
 *
 * --selftest exercises the matcher against synthetic inputs so the guard itself
 * can't rot into a no-op.
 */
const fs = require("node:fs");
const path = require("node:path");

/** Extract the de-duped, sorted set of `test:*` lanes referenced in a script string. */
function lanesInCiScript(ciScript) {
  return [...new Set(ciScript.match(/test:[a-z0-9:-]+/g) ?? [])].sort();
}

/** Lanes in `lanes` that ci.yml does NOT invoke as a `npm run <lane>` step. */
function missingFromYml(lanes, yml) {
  return lanes.filter((lane) => !yml.includes(`npm run ${lane}`));
}

function selftest() {
  const assert = require("node:assert");
  // pulls every distinct test:* token, de-duped + sorted
  assert.deepEqual(
    lanesInCiScript("npm run test:money && npm run lint && npm run test:money && npm run test:billing"),
    ["test:billing", "test:money"],
  );
  // a lane present as a step is not flagged; an absent one is
  const yml = "      - run: npm run test:money\n      - run: npm run test:billing\n";
  assert.deepEqual(missingFromYml(["test:money", "test:billing"], yml), []);
  assert.deepEqual(missingFromYml(["test:money", "test:reviews"], yml), ["test:reviews"]);
  // substring safety: `test:money` step must NOT satisfy a `test:money-extra` lane
  assert.deepEqual(missingFromYml(["test:money-extra"], "npm run test:money\n"), ["test:money-extra"]);
  console.log("[check:ci-lane-parity] selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const pkg = require("../package.json");
  const ciScript = pkg.scripts?.ci ?? "";
  const lanes = lanesInCiScript(ciScript);

  const ymlPath = path.join(__dirname, "..", "..", ".github", "workflows", "ci.yml");
  const yml = fs.readFileSync(ymlPath, "utf8");

  const missing = missingFromYml(lanes, yml);

  if (missing.length > 0) {
    console.error(
      `[check:ci-lane-parity] FAIL — .github/workflows/ci.yml omits ${missing.length} test lane(s) that 'npm run ci' runs:`,
    );
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      "Add a step `- run: npm run <lane>` to ci.yml (under the existing `tests —` steps), " +
        "or drop the lane from the `ci` script in package.json. See the `ci` aggregate vs ci.yml.",
    );
    process.exit(1);
  }

  console.log(`[check:ci-lane-parity] OK — all ${lanes.length} 'ci' test lane(s) are gated in ci.yml.`);
}

main();
