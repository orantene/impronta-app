import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DATED_DETAILS_EDITOR_COPY } from "@/components/admin/shell/internal/page-modules/dated-details-editor-copy";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const action = readFileSync(join(root, "lib/server-actions/dated-details.ts"), "utf8");

test("the actions are staff-guarded and every query is tenant scoped", () => {
  assert.match(action, /^"use server";/);
  assert.match(action, /await requireNotImpersonating\(\)/);
  assert.equal((action.match(/await staff\(\)/g) ?? []).length, 2);
  const queries = action.match(/\.from\("talent_offerings"\)[\s\S]{0,300}?(?:maybeSingle\(\))/g) ?? [];
  assert.equal(queries.length, 3);
  for (const q of queries) assert.match(q, /\.eq\("tenant_id", g\.tenantId\)/);
});

test("saving always sanitizes; the raw client value is never written", () => {
  assert.match(action, /dated_details_i18n: sanitizeDatedDetails\(parsed\.data\.details\)/);
});

test("editor copy: EN and ES carry the same keys, no em dashes", () => {
  assert.deepEqual(Object.keys(DATED_DETAILS_EDITOR_COPY.en).sort(), Object.keys(DATED_DETAILS_EDITOR_COPY.es).sort());
  for (const lang of ["en", "es"] as const) {
    for (const v of Object.values(DATED_DETAILS_EDITOR_COPY[lang])) assert.ok(!v.includes("—") && v.length > 0);
  }
});
