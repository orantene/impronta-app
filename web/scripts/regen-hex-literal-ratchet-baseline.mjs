#!/usr/bin/env node
// Regenerate the hardcoded-colour baseline.
//
//   node scripts/regen-hex-literal-ratchet-baseline.mjs
//
// Run this ONLY after you have deliberately changed the count: replaced a hex
// with a token, or justified a new literal in review with the Creative
// Director. Running it to make a red test go green defeats the gate: the test
// names the file and the line that drifted, so fix that file first, THEN
// re-record. The number may only go down.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  WEB_ROOT,
  countByFile,
  scanSurfaces,
  totalsBySurface,
} from "../src/lib/quality/hex-literal-ratchet.ts";

const counts = countByFile(scanSurfaces());
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const out = join(WEB_ROOT, "src/lib/quality/hex-literal-ratchet.baseline.json");
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
const totals = totalsBySurface(sorted);
const total = Object.values(sorted).reduce((s, n) => s + n, 0);
console.log(
  `[hex-literal-ratchet] ${total} hex literal(s) across ${Object.keys(sorted).length} file(s): ` +
    Object.entries(totals)
      .map(([surface, n]) => `${surface}=${n}`)
      .join(", "),
);
