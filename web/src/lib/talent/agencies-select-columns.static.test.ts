import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * public.agencies has `display_name`, never `name` (Postgres 42703 on staging:
 * "column agencies_1.name does not exist"). Pin every agencies select/embed.
 */
const ROOT = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const hasBareName = (cols: string) =>
  cols.split(/[,\s()]+/).some((c) => c === "name");

test("no select or embed asks agencies for a non-existent `name` column", () => {
  const offenders: string[] = [];
  for (const file of walk(ROOT)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\.from\(\s*"agencies"\s*\)[\s\S]{0,300}?\.select\(\s*(["'`])([\s\S]*?)\1/g)) {
      if (hasBareName(m[2])) offenders.push(`${file}: from("agencies").select(${m[2]})`);
    }
    for (const m of src.matchAll(/\bagencies(?::\w+|!\w+)*\s*\(([^()]*)\)/g)) {
      if (hasBareName(m[1])) offenders.push(`${file}: embed agencies(${m[1]})`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("talent services destinations roster embeds display_name and maps it", () => {
  const src = readFileSync(join(ROOT, "lib/talent/services-settings-actions.ts"), "utf8");
  assert.match(src, /agencies:tenant_id \( display_name, slug \)/);
  assert.match(src, /label: agency\.display_name \?\? "Agency listing"/);
  assert.match(src, /enquiryTo: agency\.display_name \?\? "The agency"/);
});
