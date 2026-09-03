#!/usr/bin/env node
// Regenerate the unchecked-Supabase-read baseline.
//
//   node scripts/regen-supabase-read-baseline.mjs
//
// Run this ONLY when you have deliberately changed the count — fixed some, or
// added one you have justified in review. It rewrites the recorded numbers to
// whatever the tree currently contains, so running it to make a red test go
// green defeats the entire guard. The test tells you which file drifted; fix
// the read, or annotate it, and then run this.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { countByFile, scanSource, WEB_ROOT } from "../src/lib/quality/supabase-unchecked-read.ts";

const counts = countByFile(scanSource());
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const out = join(WEB_ROOT, "src/lib/quality/supabase-unchecked-read.baseline.json");
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
const total = Object.values(sorted).reduce((s, n) => s + n, 0);
console.log(`[supabase-read-baseline] ${total} unchecked read(s) across ${Object.keys(sorted).length} file(s)`);
