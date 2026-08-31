/**
 * tulala:replay — run the engine over the corpus and print what it decided.
 *
 * For the human in the loop. `npm run test:tulala` tells you whether anything
 * broke; this tells you WHAT the engine now thinks, one line per case, so a rule
 * change can be reviewed rather than merely passed.
 *
 * Usage:
 *   npm run tulala:replay            # signatures + any drift
 *   npm run tulala:replay -- --why   # include the reasoning for each case
 */

import { replayAll, caseSignature } from "../src/lib/tulala/replay";

const showWhy = process.argv.includes("--why");

const results = replayAll();
const drifted = results.filter((r) => r.mismatches.length > 0);

console.log(`\nTulala engine replay — ${results.length} cases\n`);

for (const result of results) {
  const mark = result.mismatches.length === 0 ? "  " : "!!";
  console.log(`${mark} ${caseSignature(result)}`);

  if (showWhy) {
    for (const reason of result.recommendation.reasons) {
      console.log(`      · [${reason.code}] ${reason.text}`);
    }
    for (const trigger of result.recommendation.upgradeTriggers) {
      console.log(`      ↑ ${trigger.triggerKey} → ${trigger.targetTier}`);
    }
    console.log("");
  }

  for (const mismatch of result.mismatches) {
    console.log(
      `      ${mismatch.field}: expected ${String(mismatch.expected)}, got ${String(mismatch.actual)}`,
    );
  }
}

if (drifted.length > 0) {
  console.log(`\n${drifted.length} case(s) drifted from expectations:\n`);
  for (const result of drifted) {
    console.log(`  ${result.fixture.id} — ${result.fixture.describe}`);
    console.log(`    ${result.fixture.why}\n`);
  }
  console.log(
    "If the new behaviour is CORRECT, update the fixture's `expect` and say why in the commit.\n" +
      "If it is not, the rule change is wrong.\n",
  );
  process.exit(1);
}

console.log(`\nAll ${results.length} cases match.\n`);
