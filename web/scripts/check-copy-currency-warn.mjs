#!/usr/bin/env node
/**
 * WARN-ONLY check (lane 4, brief A6): flags two things and ALWAYS exits 0, so it can never fail CI.
 *   1. ad-hoc currency formatting: `Intl.NumberFormat(... currency ...)` outside the money modules.
 *      Route prices through src/lib/money/format-price.ts (`formatPrice`).
 *   2. hardcoded user-facing English in .tsx: attribute literals (placeholder / aria-label / title / alt)
 *      and bare JSX text lines. Put the string in messages/en.json + messages/es.json instead.
 *
 * Usage: node scripts/check-copy-currency-warn.mjs [--all]   (default: top 15 files per rule)
 * In GitHub Actions it also prints `::warning` annotations (capped at 50 per rule).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const SKIP_DIRS = new Set(["node_modules", "dev", "__phase-c-harness"]);
const MONEY_MODULES = [
  "src/lib/money/",
  "src/lib/billing/",
  "src/lib/orders/money-format",
  "src/lib/talent/offerings-money",
  "src/lib/pricing/",
  "src/lib/payments/",
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|static\.test)\./.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const currencyHits = [];
const englishHits = [];

for (const file of walk(ROOT)) {
  const rel = relative(process.cwd(), file);
  const lines = readFileSync(file, "utf8").split("\n");
  const inMoney = MONEY_MODULES.some((m) => rel.startsWith(m));
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    if (!inMoney && /Intl\.NumberFormat\(/.test(line) && /currency/.test(lines.slice(i, i + 4).join(" "))) {
      currencyHits.push({ rel, line: i + 1, text: t.slice(0, 100) });
    }
    if (file.endsWith(".tsx")) {
      if (/\b(?:placeholder|aria-label|title|alt)="[^"{]*[A-Za-z]{3}[^"]*"/.test(line)) englishHits.push({ rel, line: i + 1, text: t.slice(0, 100) });
      else if (/^[A-Z][a-z]+(?: [a-zA-Z']+){1,}[.,!?]?$/.test(t)) englishHits.push({ rel, line: i + 1, text: t.slice(0, 100) });
    }
  });
}

const showAll = process.argv.includes("--all");
function report(title, hits) {
  console.log(`\n[warn] ${title}: ${hits.length} line(s)`);
  const byFile = new Map();
  for (const h of hits) byFile.set(h.rel, (byFile.get(h.rel) ?? 0) + 1);
  const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, showAll ? Infinity : 15);
  for (const [f, n] of top) console.log(`  ${String(n).padStart(4)}  ${f}`);
  if (process.env.GITHUB_ACTIONS) {
    for (const h of hits.slice(0, 50)) console.log(`::warning file=web/${h.rel},line=${h.line}::${title}`);
  }
}

report("ad-hoc currency formatting (use formatPrice from src/lib/money/format-price.ts)", currencyHits);
report("hardcoded user-facing English (move to messages/en.json + es.json)", englishHits);
console.log("\n[warn] check-copy-currency-warn is advisory only: exit 0.");
process.exit(0);
