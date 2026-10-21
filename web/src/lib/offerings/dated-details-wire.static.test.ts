import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DATED_DETAILS_EDITOR_COPY } from "@/components/admin/shell/internal/page-modules/dated-details-editor-copy";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const action = readFileSync(join(root, "lib/server-actions/dated-details.ts"), "utf8");

test("the actions are staff-guarded and every offering query goes through the tenant-scoped helper", () => {
  assert.match(action, /^"use server";/);
  assert.match(action, /await requireNotImpersonating\(\)/);
  assert.equal((action.match(/await staff\("(?:load|save)"\)/g) ?? []).length, 2);
  // the lint ratchet forbids a raw .from("talent_offerings") in a server action
  assert.doesNotMatch(action, /\.from\("talent_offerings"\)/);
  assert.equal((action.match(/tenantScopedQuery\(g\.admin, "talent_offerings", g\.tenantId\)/g) ?? []).length, 3);
});

test("a failed read of the held columns is not an empty form (saving it would wipe the details)", () => {
  assert.match(action, /error\.code !== "42703"/);
  assert.match(action, /datedDetails\.load\.columns/);
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
