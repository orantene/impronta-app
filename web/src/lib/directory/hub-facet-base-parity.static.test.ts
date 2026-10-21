import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-1233 / TUL-1789: the hub facet-count functions must count the SAME profiles the hub list shows.
// Staging showed "92 perfiles" beside "Mexico (1) / Guadalajara (1)" because the facet base was
// talent_is_site_visible_anywhere (active roster + eye on) while the list pages is_publicly_listed
// (also pending rosters and self-published independents). Pins both sides so neither can drift alone.
const sql = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/_pending_pm/20261231425700_directory_facet_counts_hub_use_list_search_tul1233.sql"),
  "utf8",
);
const listSrc = readFileSync(join(process.cwd(), "src/lib/directory/fetch-directory-page.ts"), "utf8");

test("TUL-1233: the hub list and its header count gate on is_publicly_listed and exclude resources", () => {
  const gates = listSrc.match(/\.eq\("is_publicly_listed", true\)/g) ?? [];
  assert.ok(gates.length >= 2, "list query and count query both gate on is_publicly_listed");
  assert.match(listSrc, /\.neq\("profile_kind", "resource"\)/);
});

test("TUL-1233: every hub facet base set uses the list's gate, not the narrower site-visible-anywhere one", () => {
  const fns = sql.split("CREATE OR REPLACE FUNCTION").slice(1);
  assert.equal(fns.length, 3);
  for (const fn of fns) {
    assert.match(fn, /tp\.is_publicly_listed = true/);
    assert.match(fn, /tp\.profile_kind <> 'resource'/);
  }
  assert.doesNotMatch(sql, /AND public\.talent_is_site_visible_anywhere\(tp\.id\)/);
});

test("TUL-1233: the location facet joins the same columns the card location reads", () => {
  assert.match(sql, /tp\.residence_city_id = l\.id OR tp\.location_id = l\.id/);
  assert.match(listSrc, /pick\(profile\.residence_city\) \?\? pick\(profile\.legacy_location\)/);
});
