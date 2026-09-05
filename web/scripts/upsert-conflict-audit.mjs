#!/usr/bin/env node
/**
 * upsert-conflict-audit.mjs — report every `onConflict` target Postgres cannot infer.
 *
 *   npx tsx scripts/upsert-conflict-audit.mjs            # human report
 *   npx tsx scripts/upsert-conflict-audit.mjs --json     # machine readable
 *   npx tsx scripts/upsert-conflict-audit.mjs --baseline # rewrite the CI baseline
 *   npx tsx scripts/upsert-conflict-audit.mjs --markdown # the doc table
 *
 * RUN IT WITH `tsx`, NOT `node` — it imports a TypeScript module. `node` fails on
 * the import, and if you pipe the output anywhere the exit code you read will be
 * the pipe's, not this script's. That mistake cost someone an hour tonight.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  WEB_ROOT,
  audit,
  collectUniqueIndexes,
  isBreaking,
  toBaseline,
} from "../src/lib/quality/upsert-conflict-audit.ts";

const args = new Set(process.argv.slice(2));
const findings = audit();
const breaking = findings.filter(isBreaking);

if (args.has("--json")) {
  console.log(JSON.stringify({ findings, indexes: collectUniqueIndexes().length }, null, 2));
} else if (args.has("--baseline")) {
  const path = join(WEB_ROOT, "src/lib/quality/upsert-conflict-audit.baseline.json");
  writeFileSync(path, `${JSON.stringify(toBaseline(findings), null, 2)}\n`);
  console.log(`wrote ${breaking.length} breaking finding(s) to ${path}`);
} else if (args.has("--markdown")) {
  console.log("| file:line | table | onConflict | verdict | index |");
  console.log("|---|---|---|---|---|");
  for (const f of breaking) {
    console.log(
      `| \`${f.file}:${f.line}\` | \`${f.table}\` | \`${f.columns.join(",")}\` | **${f.verdict}** | \`${f.index ?? "—"}\` |`,
    );
  }
} else {
  const by = (v) => findings.filter((f) => f.verdict === v).length;
  console.log(`unique indexes/constraints at HEAD : ${collectUniqueIndexes().length}`);
  console.log(`upserts naming an onConflict target: ${findings.length}`);
  console.log(`  ok      ${by("ok")}`);
  console.log(`  partial ${by("partial")}   <- 42P10 at planning, every row`);
  console.log(`  missing ${by("missing")}   <- 42P10 at planning, every row`);
  console.log(`  unknown ${by("unknown")}   <- not statically decidable, never failed on`);
  for (const f of breaking) {
    console.log(`\n${f.file}:${f.line}  [${f.verdict}]  ${f.table}(${f.columns.join(",")})`);
    console.log(`    ${f.detail}`);
  }
}

process.exitCode = 0;
