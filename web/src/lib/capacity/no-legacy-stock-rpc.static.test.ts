import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * The legacy stock RPCs have no callers, and must not regain one.
 *
 * `reserve_offering_stock` / `release_offering_stock` move a QUANTITY
 * newest-first, so a release can free a DIFFERENT allocation than the caller
 * reserved. Capacity is dropping both; this guard is what lets them, and what
 * stops the shape returning under the old names afterwards.
 *
 * Scans DIRECTORIES, never a named file — a guard pinned to a filename
 * measures a location, not an invariant, which cost four separate reddenings
 * this phase. Comments are blanked first, because this repo documents the bugs
 * it forbids and a guard that punishes documentation teaches people to stop
 * writing it.
 */
const ROOTS = ["src", "scripts"];
const SKIP = new Set(["node_modules", ".next", "database.types.ts"]);
const FORBIDDEN = ["reserve_offering_stock", "release_offering_stock"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?tsx?)$/.test(entry) && !/\.test\.[cm]?tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

test("nothing calls the legacy offering-stock RPCs", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(join(process.cwd(), root))) {
      const body = blankComments(readFileSync(file, "utf8"));
      for (const name of FORBIDDEN) {
        if (body.includes(name)) offenders.push(`${file.split("/web/")[1] ?? file} -> ${name}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these reach for a quantity-based stock RPC; reserve and release by allocation id",
  );
});
