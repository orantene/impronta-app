import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const src = readFileSync(path.join(process.cwd(), "src/components/talent/get-found/GscTokenField.tsx"), "utf8");

test("TUL-1021: field imports and calls the existing save action", () => {
  assert.ok(src.includes('from "@/lib/talent/google-site-verification-actions"'));
  assert.ok(src.includes("saveGoogleSiteVerificationAction("));
});

test("TUL-1021: field strings exist in both en and es", () => {
  const [en, es] = src.split(/\n {2}es: \{/);
  for (const k of ["label", "help", "save", "remove", "invalid", "failed"]) {
    assert.match(en, new RegExp(`\\b${k}:`));
    assert.match(es ?? "", new RegExp(`\\b${k}:`));
  }
});
