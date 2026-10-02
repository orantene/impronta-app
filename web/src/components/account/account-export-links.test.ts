import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_EXPORT_HREF, accountExportCopy } from "./AccountExportLinks";

test("export links point at the export route, csv as a second link", () => {
  assert.equal(ACCOUNT_EXPORT_HREF.json, "/api/account/export");
  assert.equal(ACCOUNT_EXPORT_HREF.csv, "/api/account/export?format=csv");
});
test("copy exists in en and es without em dashes", () => {
  for (const es of [false, true]) {
    const c = accountExportCopy(es);
    for (const v of Object.values(c)) assert.ok(v.length > 0 && !v.includes("—"));
  }
  assert.equal(accountExportCopy(true).title, "Descargar mis datos");
});
