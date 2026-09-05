#!/usr/bin/env node
// Regenerate the exposed-guard baseline.
//
//   node scripts/regen-guard-reads-source-baseline.mjs
//
// Run this ONLY when you have deliberately changed the count — wrapped a read in
// blankComments, or added an assertion you have justified in review. Running it
// to make a red test go green defeats the guard: the test names the file that
// drifted, so fix or exempt that file first, THEN re-record.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { countByFile, scanTests, WEB_ROOT } from "../src/lib/quality/guard-reads-source.ts";

const counts = countByFile(scanTests());
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const out = join(WEB_ROOT, "src/lib/quality/guard-reads-source.baseline.json");
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
const total = Object.values(sorted).reduce((s, n) => s + n, 0);
console.log(`[guard-reads-source] ${total} comment-satisfiable assertion(s) across ${Object.keys(sorted).length} file(s)`);
