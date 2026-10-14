/**
 * Static guard: 20261231381200 redefines talent_site_subdomain_lookup(text) and
 * must keep every QA nickname label from 20261231359400 (whichever migration
 * runs last wins) while adding primary_custom_domain.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const SQL = readFileSync(join(DIR, "20261231381200_talent_site_primary_domain_redirect.sql"), "utf8");
const start = SQL.indexOf("create function public.talent_site_subdomain_lookup");
const end = SQL.indexOf("$function$;", SQL.indexOf("as $function$", start));
const BODY = SQL.slice(start, end);

test("subdomain lookup keeps every nickname label from 359400", () => {
  assert.ok(start > 0 && end > start);
  const rows: Array<[string[], string]> = [
    [["alba", "alba-demo"], "alba-nail-artist"],
    [["linh", "linh-demo"], "linh-tran"],
    [["sofia-nails", "sofia-nails-demo"], "camila-nails"],
    [["maison-v2", "maison-v2-demo"], "alba-nail-artist"],
    [["folio", "folio-demo"], "mateo-ferrer"],
    [["gridline", "gridline-demo"], "alex-trevino"],
  ];
  for (const [labels, slug] of rows) {
    const re = new RegExp(
      `label\\.v in \\(${labels.map((l) => `'${l}'`).join(",\\s*")}\\) then '${slug}'`,
    );
    assert.match(BODY, re, `missing alias ${labels.join("/")} -> ${slug}`);
  }
});

test("subdomain lookup returns primary_custom_domain and keeps grants", () => {
  assert.match(BODY, /primary_custom_domain text/);
  assert.match(BODY, /\) as primary_custom_domain/);
  assert.match(
    SQL,
    /grant execute on function public\.talent_site_subdomain_lookup\(text\) to anon, authenticated;/,
  );
});
