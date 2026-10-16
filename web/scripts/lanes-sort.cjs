/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS helper script. */
/**
 * lanes-sort.cjs — keep scripts/lanes/*.txt sorted (TUL-1185 / TUL-1186).
 *
 * Every lane used to append to the END of the same files, so each merge made
 * the next open PR conflict. Entries are now kept in byte order, so new entries
 * land at different places, and `.gitattributes` merges the files with the
 * built-in `union` driver. After a union merge two different lines inserted at
 * the very same spot can be out of order: run `npm run lanes:sort` (or
 * `node scripts/lanes-sort.cjs --check` to only verify).
 *
 * `#` comment lines stay on top, entries are sorted and de-duplicated.
 */
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "lanes");

/** The sorted form of a lane file's text: comments first, unique entries in byte order. */
function sortedText(raw) {
  const lines = raw.split("\n").map((l) => l.trim());
  const comments = lines.filter((l) => l.startsWith("#"));
  const entries = [...new Set(lines.filter((l) => l && !l.startsWith("#")))].sort((a, b) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  );
  return [...comments, ...entries].join("\n") + "\n";
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  let bad = 0;
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".txt")).sort()) {
    const file = path.join(DIR, f);
    const raw = fs.readFileSync(file, "utf8");
    const next = sortedText(raw);
    if (next === raw) continue;
    bad += 1;
    if (check) console.error(`scripts/lanes/${f} is not sorted / de-duplicated`);
    else fs.writeFileSync(file, next);
  }
  if (check && bad) {
    console.error("Run: npm run lanes:sort");
    process.exit(1);
  }
}

module.exports = { sortedText };
