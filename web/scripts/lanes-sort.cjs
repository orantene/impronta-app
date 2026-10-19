#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS helper script. */
// TUL-1185 / TUL-1186: keep web/scripts/lanes/*.txt sorted.
//
// Every PR that enrols a test used to append one line to the END of a list, so each merge to
// main conflicted the next PR (always the same last lines). In a SORTED list a new path lands
// where its name belongs, so two PRs rarely touch adjacent lines. The order is plain code-unit
// order (locale independent), comment and blank lines stay at the top, duplicates are dropped.
//
//   node scripts/lanes-sort.cjs          sort every list in place
//   node scripts/lanes-sort.cjs --check  exit 1 and name the unsorted lists (used by CI test)

const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "lanes");

function sortedContent(raw) {
  const lines = raw.split("\n").map((l) => l.trim());
  const head = lines.filter((l) => l.startsWith("#"));
  const body = [...new Set(lines.filter((l) => l && !l.startsWith("#")))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...head, ...body].join("\n") + "\n";
}

function listFiles(dir = DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
}

function unsorted(dir = DIR) {
  return listFiles(dir).filter((f) => {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    return raw !== sortedContent(raw);
  });
}

if (require.main === module) {
  if (process.argv.includes("--check")) {
    const bad = unsorted();
    if (bad.length) {
      console.error(`Unsorted lane lists: ${bad.join(", ")}. Run: node scripts/lanes-sort.cjs`);
      process.exit(1);
    }
  } else {
    for (const f of listFiles()) {
      const p = path.join(DIR, f);
      const raw = fs.readFileSync(p, "utf8");
      const next = sortedContent(raw);
      if (next !== raw) fs.writeFileSync(p, next);
    }
  }
}

module.exports = { sortedContent, unsorted, listFiles };
