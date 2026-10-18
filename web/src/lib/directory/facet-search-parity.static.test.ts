import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-1233: the facet-count RPCs must filter p_search with the SAME function the result list uses.
// The migration is parked in _pending_pm until Oran's migration OK; this pins its shape so the
// held SQL cannot drift back to a plain ILIKE.
const sql = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/_pending_pm/20261231412000_directory_facet_counts_use_list_search.sql"),
  "utf8",
);
const listSrc = readFileSync(join(process.cwd(), "src/lib/directory/fetch-directory-page.ts"), "utf8");

test("TUL-1233: the result list searches through directory_search_public_talent_ids", () => {
  assert.match(listSrc, /rpc\("directory_search_public_talent_ids"/);
});

test("TUL-1233: every redefined facet function filters p_search through the list search, with no inline ILIKE", () => {
  const fns = sql.split("CREATE OR REPLACE FUNCTION").slice(1);
  assert.equal(fns.length, 6);
  for (const fn of fns) {
    assert.match(fn, /tp\.id IN \(SELECT public\.directory_search_public_talent_ids\(p_search\)\)/);
    assert.doesNotMatch(fn, /ILIKE '%' \|\| trim\(p_search\)/);
  }
  assert.match(sql, /DO NOT APPLY without Oran/);
});
