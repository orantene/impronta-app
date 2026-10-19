// Prints the per-file inline sell-check counts the D1 static test ratchets against.
// Usage: node scripts/d1-scan-sellable.cjs   (from web/)
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

const PATTERNS = [
  /\bmoderation_?[sS]tate["']?\s*[!=]==/g,
  /\.eq\(\s*"moderation_state"/g,
  /\.eq\(\s*"visibility",\s*"public"\s*\)/g,
  /\bvisibility\s*[!=]==\s*"agency_only"/g,
];
const EXEMPT = new Set(["src/lib/offerings/sellable.ts"]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function scan(root) {
  const counts = {};
  for (const abs of walk(join(root, "src"), [])) {
    const rel = abs.slice(root.length + 1).split("\\").join("/");
    if (EXEMPT.has(rel)) continue;
    const src = readFileSync(abs, "utf8");
    let n = 0;
    for (const re of PATTERNS) n += (src.match(re) || []).length;
    if (n > 0) counts[rel] = n;
  }
  return counts;
}

module.exports = { scan };
if (require.main === module) console.log(JSON.stringify(scan(process.cwd()), null, 2));
